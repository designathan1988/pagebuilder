// The server of the published sites. A single Worker, for all customers:
//  - reads the Host and finds the site: <slug>.<SITES_SUFFIX>, or a custom domain mapped in domains/<host>;
//  - serves the published version from R2 (sites/<slug>/v<N>/...), with index.html, extensionless URLs and the site's 404;
//  - receives the sites' forms (POST) and forwards them to the platform;
//  - forwards /_api/* (the apps' database and members: the runtime's app.db and app.auth) to the site-data function;
//  - on the publishing host, with the secret, stores a new version from the editor's ZIP and swaps the pointer
//    (meta/<slug>.json) at once, and keeps the map of custom domains.
// References: developers.cloudflare.com (R2 Workers API, Cache API, routes, Cloudflare for SaaS), read on 2026-10-21.
import { unzipSync } from 'fflate';

export interface Env {
  SITES: R2Bucket;
  SITES_SUFFIX: string;
  PLATFORM_HOST: string;
  PLATFORM_SECRET: string;
  FORMS_ENDPOINT: string;
  DATA_ENDPOINT: string;
  BADGE_URL: string;
}

interface SiteMeta {
  readonly version: number;
  readonly badge: boolean;
}

const MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', json: 'application/json',
  xml: 'application/xml', txt: 'text/plain; charset=utf-8', svg: 'image/svg+xml', png: 'image/png',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
  ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
  pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav',
  webmanifest: 'application/manifest+json',
};
const mimeOf = (path: string): string => MIME[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
const SLUG = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

function sameSecret(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length || b.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Security headers for customer sites on a domain separate from the dashboard (web.dev, "Securely hosting user
// data"; Cloudflare's security headers example). No COEP require-corp (it would break third-party images and videos)
// and no X-Frame-Options DENY (the dashboard shows the site in an iframe).
function secure(headers: Headers): void {
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Strict-Transport-Security', 'max-age=31536000');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.delete('X-Powered-By');
}

async function siteOf(host: string, env: Env): Promise<string | null> {
  const name = host.toLowerCase().replace(/:\d+$/, '');
  if (name.endsWith(env.SITES_SUFFIX)) {
    const slug = name.slice(0, -env.SITES_SUFFIX.length);
    return SLUG.test(slug) ? slug : null;
  }
  const mapped = await env.SITES.get(`domains/${name}`);
  return mapped === null ? null : (await mapped.text()).trim();
}

async function metaOf(slug: string, env: Env): Promise<SiteMeta | null> {
  const object = await env.SITES.get(`meta/${slug}.json`);
  return object === null ? null : (await object.json<SiteMeta>());
}

// ------------------------------------------------------------------ publishing (platform host)

// A path from inside the ZIP, safe to become a key: no "..", no leading slash, no backslashes.
function safePath(name: string): string | null {
  const path = name.replace(/\\/g, '/').replace(/^\/+/, '');
  if (path === '' || path.endsWith('/') || path.split('/').some((part) => part === '..' || part === '.')) return null;
  return path;
}

async function publish(request: Request, env: Env, url: URL, ctx: ExecutionContext): Promise<Response> {
  const slug = url.searchParams.get('slug') ?? '';
  const version = Number(url.searchParams.get('version'));
  if (!SLUG.test(slug) || !Number.isInteger(version) || version < 1) return new Response('bad request', { status: 400 });
  const files = unzipSync(new Uint8Array(await request.arrayBuffer()));
  const prefix = `sites/${slug}/v${version}/`;
  let count = 0;
  for (const [name, bytes] of Object.entries(files)) {
    const path = safePath(name);
    if (path === null) continue;
    await env.SITES.put(prefix + path, bytes, { httpMetadata: { contentType: mimeOf(path) } });
    count += 1;
  }
  if (count === 0) return new Response('empty archive', { status: 400 });
  // the swap: from here on, visits read the new version
  const meta: SiteMeta = { version, badge: url.searchParams.get('badge') === '1' };
  await env.SITES.put(`meta/${slug}.json`, JSON.stringify(meta), { httpMetadata: { contentType: 'application/json' } });
  // the old versions are removed after the response
  ctx.waitUntil(removeOlderVersions(env, slug, version));
  return Response.json({ ok: true, files: count });
}

async function removePrefix(env: Env, prefix: string, keep?: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const listed = await env.SITES.list({ prefix, cursor });
    const keys = listed.objects.map((object) => object.key).filter((key) => keep === undefined || !key.startsWith(keep));
    if (keys.length > 0) await env.SITES.delete(keys);
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor !== undefined);
}

const removeOlderVersions = (env: Env, slug: string, version: number) => removePrefix(env, `sites/${slug}/`, `sites/${slug}/v${version}/`);

async function platform(request: Request, env: Env, url: URL, ctx: ExecutionContext): Promise<Response> {
  if (!sameSecret(request.headers.get('x-platform-secret') ?? '', env.PLATFORM_SECRET)) return new Response('forbidden', { status: 403 });
  const route = `${request.method} ${url.pathname}`;
  if (route === 'PUT /__platform/publish') return publish(request, env, url, ctx);
  if (route === 'DELETE /__platform/site') {
    const slug = url.searchParams.get('slug') ?? '';
    if (!SLUG.test(slug)) return new Response('bad request', { status: 400 });
    await env.SITES.delete(`meta/${slug}.json`);
    ctx.waitUntil(removePrefix(env, `sites/${slug}/`));
    return Response.json({ ok: true });
  }
  if (route === 'PUT /__platform/domain' || route === 'DELETE /__platform/domain') {
    const host = (url.searchParams.get('host') ?? '').toLowerCase();
    if (!/^[a-z0-9.-]{4,253}$/.test(host) || host.endsWith(env.SITES_SUFFIX)) return new Response('bad request', { status: 400 });
    if (request.method === 'DELETE') await env.SITES.delete(`domains/${host}`);
    else {
      const slug = url.searchParams.get('slug') ?? '';
      if (!SLUG.test(slug)) return new Response('bad request', { status: 400 });
      await env.SITES.put(`domains/${host}`, slug, { httpMetadata: { contentType: 'text/plain' } });
    }
    return Response.json({ ok: true });
  }
  return new Response('not found', { status: 404 });
}

// ------------------------------------------------------------------ the sites' forms

const THANKS = (back: string) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Mensagem enviada</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f8fafc;color:#0f172a}main{max-width:420px;padding:32px;text-align:center}a{color:#4f46e5}</style></head>
<body><main><h1>Mensagem enviada</h1><p>Obrigado! Recebemos sua mensagem e vamos responder em breve.</p><p><a href="${back}">Voltar ao site</a></p></main></body></html>`;

async function form(request: Request, env: Env, url: URL, slug: string): Promise<Response> {
  const type = request.headers.get('content-type') ?? '';
  if (!type.includes('application/x-www-form-urlencoded') && !type.includes('multipart/form-data')) return new Response('method not allowed', { status: 405 });
  const data = await request.formData();
  // honeypot field: bots fill it in, people do not see it
  if (String(data.get('_gotcha') ?? '') !== '') return new Response(THANKS(url.pathname), { headers: { 'content-type': 'text/html; charset=utf-8' } });
  const fields: Record<string, string> = {};
  for (const [key, value] of data.entries()) if (typeof value === 'string' && key !== '_gotcha') fields[key] = value;
  const sent = await fetch(env.FORMS_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-platform-secret': env.PLATFORM_SECRET },
    body: JSON.stringify({ slug, page: url.pathname, data: fields }),
  });
  if (!sent.ok) return new Response('Não foi possível enviar agora. Tente de novo em instantes.', { status: 502, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const headers = new Headers({ 'content-type': 'text/html; charset=utf-8' });
  secure(headers);
  return new Response(THANKS(url.pathname), { headers });
}

// ------------------------------------------------------------------ the apps' database

const API_PREFIX = '/_api/';
const MAX_API_BODY = 256 * 1024;

// Same origin as the site: the runtime calls /_api/... without CORS. "ping" answers here (the runtime finds out whether
// the site has the platform database); the rest goes to the site-data function, with the slug and the path in headers.
async function api(request: Request, env: Env, url: URL, slug: string): Promise<Response> {
  const path = url.pathname.slice(API_PREFIX.length);
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  secure(headers);
  if (path === 'ping') return new Response(JSON.stringify({ service: 'webconstructor-data', site: slug }), { headers });
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) return new Response('{"error":"method_not_allowed"}', { status: 405, headers });
  const body = request.method === 'POST' || request.method === 'PATCH' ? await request.arrayBuffer() : null;
  if (body !== null && body.byteLength > MAX_API_BODY) return new Response('{"error":"too_large"}', { status: 413, headers });
  const target = new URL(env.DATA_ENDPOINT);
  target.search = url.search;
  const forwarded = await fetch(target, {
    method: request.method,
    headers: {
      'content-type': 'application/json',
      'x-platform-secret': env.PLATFORM_SECRET,
      'x-site-slug': slug,
      'x-api-path': path,
      authorization: request.headers.get('authorization') ?? '',
    },
    ...(body === null ? {} : { body }),
  });
  return new Response(forwarded.body, { status: forwarded.status, headers });
}

// ------------------------------------------------------------------ visits

// the free plan badge, at the end of each page's <body>
function withBadge(response: Response, env: Env): Response {
  const badge = `<a href="${env.BADGE_URL}" target="_blank" rel="noopener" style="position:fixed;right:12px;bottom:12px;z-index:2147483647;`
    + 'padding:6px 10px;border-radius:8px;background:#0f172a;color:#fff;font:600 12px/1.4 system-ui,sans-serif;text-decoration:none;'
    + 'box-shadow:0 4px 12px rgba(0,0,0,.2)">Feito com Webconstructor</a>';
  return new HTMLRewriter().on('body', { element(element) { element.append(badge, { html: true }); } }).transform(response);
}

async function visit(request: Request, env: Env, url: URL, ctx: ExecutionContext, slug: string): Promise<Response> {
  const meta = await metaOf(slug, env);
  if (meta === null) return new Response('Site não encontrado', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  // the version is part of the cache key: publishing again never serves the previous version (the key includes the host)
  const cacheKey = new Request(`${url.origin}${url.pathname}?__v=${meta.version}`, { method: 'GET' });
  const cache = caches.default;
  if (request.method === 'GET') {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return new Response('Bad Request', { status: 400 });
  }
  if (path.split('/').includes('..')) return new Response('Bad Request', { status: 400 });
  if (path.endsWith('/')) path += 'index.html';
  const base = `sites/${slug}/v${meta.version}`;
  let key = `${base}${path}`;
  let object = await env.SITES.get(key);
  // extensionless URLs: /about -> /about.html or /about/index.html
  if (object === null && !/\.[a-z0-9]+$/i.test(path)) {
    for (const candidate of [`${base}${path}.html`, `${base}${path}/index.html`]) {
      object = await env.SITES.get(candidate);
      if (object !== null) {
        key = candidate;
        break;
      }
    }
  }
  let status = 200;
  if (object === null) {
    object = await env.SITES.get(`${base}/404.html`);
    status = 404;
    if (object === null) return new Response('Página não encontrada', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    key = '404.html';
  }
  const html = /\.html?$/i.test(key);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (!headers.has('content-type')) headers.set('content-type', mimeOf(key));
  headers.set('etag', object.httpEtag);
  // HTML: the browser always revalidates; the rest: long cache (the new version has another key in the edge cache)
  headers.set('cache-control', html ? 'public, max-age=0, must-revalidate' : 'public, max-age=3600');
  secure(headers);
  let response = new Response(request.method === 'HEAD' ? null : object.body, { status, headers });
  if (html && meta.badge && request.method === 'GET') response = withBadge(response, env);
  if (status === 200 && request.method === 'GET') ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === env.PLATFORM_HOST) return platform(request, env, url, ctx);
    const slug = await siteOf(url.hostname, env);
    if (slug === null) return new Response('Site não encontrado', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    if (url.pathname.startsWith(API_PREFIX)) return api(request, env, url, slug);
    if (request.method === 'POST') return form(request, env, url, slug);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD, POST' } });
    return visit(request, env, url, ctx, slug);
  },
} satisfies ExportedHandler<Env>;
