// The cloud capture (File › Open a web address… in the cloud editor): the Builder Companion's capture
// (tools/companion/capture.ts), as a service, so a person opens any site without installing anything.
//   POST /capture { url, pages? } with Authorization: Bearer <the person's Supabase session>
//     → { title, files: [{ path, type, base64 }] }, or { error, errorCode? }
//   GET /health → { ok: true }
// Who may ask: a signed-in person (the token is checked with Supabase Auth), from APP_ORIGIN; each person one capture at a
// time and CAPTURES_PER_HOUR an hour; the service CONCURRENCY captures at a time. What it may open: public addresses only
// (guard.ts), the browser behind the guard proxy.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { CaptureChallengeError, capture, configureBrowser } from '../../tools/companion/capture.ts';
import { allowedUrl, startGuardProxy } from './guard.ts';

const PORT = Number(process.env.PORT ?? '8080');
const APP_ORIGIN = process.env.APP_ORIGIN ?? '';
const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
const CONCURRENCY = Number(process.env.CONCURRENCY ?? '2');
const CAPTURES_PER_HOUR = Number(process.env.CAPTURES_PER_HOUR ?? '20');
const MOST_PAGES = Number(process.env.MOST_PAGES ?? '10');
if (!APP_ORIGIN || !SUPABASE_URL || !SUPABASE_KEY) throw new Error('APP_ORIGIN, SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required');

const proxy = await startGuardProxy();
// Chrome sends this machine's addresses around a proxy unless told not to (<-loopback>)
configureBrowser({ proxy: { server: proxy.url }, args: ['--disable-dev-shm-usage', '--proxy-bypass-list=<-loopback>'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });

const headers = (origin: string | undefined) => ({
  'content-type': 'application/json; charset=utf-8',
  ...(origin === APP_ORIGIN ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}),
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
});
const send = (res: ServerResponse, origin: string | undefined, status: number, body: unknown) => {
  res.writeHead(status, headers(origin));
  res.end(JSON.stringify(body));
};
const bodyOf = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let text = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      text += chunk;
      if (text.length > 10_000) reject(new Error('too large'));
    });
    req.on('end', () => resolve(text));
    req.on('error', reject);
  });

// the person behind the token, asked of Supabase Auth (GET /auth/v1/user)
async function userOf(req: IncomingMessage): Promise<string | null> {
  const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
  if (!token) return null;
  const answer = await fetch(new URL('/auth/v1/user', SUPABASE_URL), { headers: { authorization: `Bearer ${token}`, apikey: SUPABASE_KEY } }).catch(() => null);
  if (!answer?.ok) return null;
  const user = (await answer.json()) as { id?: string };
  return user.id ?? null;
}

const busy = new Set<string>();
const recent = new Map<string, number[]>();
let running = 0;
const waiting: (() => void)[] = [];
const slot = async () => {
  if (running >= CONCURRENCY) await new Promise<void>((resolve) => waiting.push(resolve));
  running += 1;
};
const release = () => {
  running -= 1;
  waiting.shift()?.();
};

createServer((req, res) => {
  void (async () => {
    const origin = req.headers.origin;
    if (req.method === 'OPTIONS') return send(res, origin, 204, {});
    if (req.method === 'GET' && req.url === '/health') return send(res, origin, 200, { ok: true });
    if (req.method !== 'POST' || req.url !== '/capture') return send(res, origin, 404, { error: 'not found' });
    if (origin !== undefined && origin !== APP_ORIGIN) return send(res, origin, 403, { error: 'origin' });
    const user = await userOf(req);
    if (user === null) return send(res, origin, 401, { error: 'unauthorized' });
    const now = Date.now();
    const hour = (recent.get(user) ?? []).filter((at) => now - at < 3_600_000);
    if (busy.has(user) || hour.length >= CAPTURES_PER_HOUR) return send(res, origin, 429, { error: 'too many captures', errorCode: 'rate' });
    let url: string;
    let pages = 1;
    try {
      const parsed = JSON.parse(await bodyOf(req)) as { url?: unknown; pages?: unknown };
      if (typeof parsed.url !== 'string') throw new Error('no url');
      url = new URL(parsed.url).href;
      if (typeof parsed.pages === 'number' && Number.isInteger(parsed.pages) && parsed.pages > 0) pages = Math.min(parsed.pages, MOST_PAGES);
    } catch {
      return send(res, origin, 400, { error: 'the request names no web address' });
    }
    if (!(await allowedUrl(url))) return send(res, origin, 400, { error: 'this address cannot be opened', errorCode: 'blocked' });
    busy.add(user);
    recent.set(user, [...hour, now]);
    await slot();
    try {
      return send(res, origin, 200, await capture(url, { pages, allow: allowedUrl }));
    } catch (error) {
      if (error instanceof CaptureChallengeError) return send(res, origin, 403, { errorCode: 'challenge', error: error.message });
      return send(res, origin, 502, { error: (error as Error).message.split('\n')[0] });
    } finally {
      busy.delete(user);
      release();
    }
  })();
}).listen(PORT, () => console.log(`capture on :${PORT}`));
