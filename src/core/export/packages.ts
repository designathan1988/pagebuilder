// The site packed as an application (spec export-packages): the same files the ZIP export writes, wrapped for where
// the person wants it to run.
//  - pwa: an installable web app (developer.mozilla.org, "Making PWAs installable"): a web app manifest every page
//    links, with a name, a start_url, a display and a 192px and a 512px icon, and a service worker that keeps every
//    file of the site so it opens offline. Published on HTTPS it installs on Windows, macOS, Android and iOS, and
//    PWABuilder (pwabuilder.com) turns its address into a Microsoft Store (MSIX) or Google Play (TWA) package.
//  - android: a Capacitor project (capacitorjs.com/docs, v8): capacitor.config.json names the app and www/ holds the
//    site; `npm install`, `npx cap add android` and Android Studio build the APK or AAB (and `npx cap add ios`, Xcode,
//    the iPhone app).
//  - desktop: an Electron Forge project (electronforge.io, electronjs.org): main.js opens the site in a window from
//    app/ through a privileged app:// scheme (so modules, storage and fetch work as on the web); `npm install` and
//    `npm run make` build the Windows installer (Squirrel), the macOS ZIP and the Linux packages.
// Pure: the files in, the archive's files out.
import en from '../../i18n/locales/en.json' with { type: 'json' };
import ptBR from '../../i18n/locales/pt-BR.json' with { type: 'json' };
import { formatMessage } from '../../i18n/index.ts';
import { walk, type DocNode, type DocumentJson } from '../document/model.ts';
import { relativePath } from '../files/files.ts';
import { crc32, type ZipEntry } from '../project/zip.ts';
import { manifest } from '../../manifest/runtime.ts';
import { pageLanguage } from './names.ts';

export type PackageFormat = 'site' | 'pwa' | 'android' | 'desktop';

// the archive each format downloads as
export const PACKAGE_ARCHIVE: Readonly<Record<PackageFormat, string>> = {
  site: 'site.zip',
  pwa: 'site-pwa.zip',
  android: 'app-android.zip',
  desktop: 'app-desktop.zip',
};

export const PWA_MANIFEST = 'manifest.webmanifest';
export const SERVICE_WORKER = 'sw.js';
export const ICON_192 = 'icons/icon-192.png';
export const ICON_512 = 'icons/icon-512.png';
export const ICON_MASKABLE = 'icons/icon-maskable-512.png';

// the package versions the projects name (npm, October 2026)
const CAPACITOR_VERSION = '^8.5.3';
const ELECTRON_VERSION = '^45.0.0';
const FORGE_VERSION = '^8.0.1';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const text = (path: string, content: string): ZipEntry => ({ path, bytes: encoder.encode(content) });
const json = (path: string, value: unknown): ZipEntry => text(path, `${JSON.stringify(value, null, 2)}\n`);

// What the app is called, its identifier and its colours.
//  - name: the start page's title (else the first page's name), what the web app manifest and the package descriptions
//    say in full;
//  - appName: the brand, the title's part before its separator ("Brasa & Sal — Cozinha de fogo" → "Brasa & Sal"): the
//    launcher's label, the window's title and the installer's name, which a whole SEO title would overflow;
//  - shortName: the web app manifest's short_name, at most 12 characters;
//  - id: the Android package name and iOS bundle identifier (reverse domain): lowercase letters and digits only in
//    each part, so both stores take it; seeded by the start page's internal id, which no edit of a title or a text
//    changes and which every project draws at random, so it stays the same from one export to the next (a store
//    installs a new build as an update only under the same id). The README asks for the person's own domain first.
//  - color: the first design token whose value is a hex colour, else the start page's accent (the first saturated
//    background its elements set: a button's, a badge's), else the editor's blue; background: the start page's own.
export interface AppIdentity {
  readonly name: string;
  readonly appName: string;
  readonly shortName: string;
  readonly id: string;
  readonly slug: string;
  readonly color: string;
  readonly background: string;
  readonly start: string;
  readonly language: string;
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/iu;
const DEFAULT_COLOR = '#2563eb';
const DEFAULT_BACKGROUND = '#ffffff';
// what separates a brand from the rest of a title: a dash between spaces, a bar, a middle dot, a colon
const TITLE_SEPARATOR = /\s+[—–\-|·]\s+|:\s+/u;
const LAUNCHER_LENGTH = 30;
// the property an element's background colour is written in (the manifest names it for the checks' contrast)
const BACKGROUND = manifest.interactions.checks.backgroundProperty;

// the base breakpoint's base-state value of a property, when it is a hex colour
function hexStyle(node: DocNode, property: string): string | null {
  const value = (node.styles.desktop?.base as Readonly<Record<string, unknown>> | undefined)?.[property];
  return typeof value === 'string' && HEX.test(value.trim()) ? value.trim().toLowerCase() : null;
}

// a colour that reads as a brand's accent: saturated, neither near white nor near black (HSL)
function isAccent(hex: string): boolean {
  const [r, g, b] = rgb(hex).map((c) => c / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const saturation = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1));
  return saturation >= 0.35 && lightness >= 0.2 && lightness <= 0.75;
}

export function appIdentity(document: DocumentJson): AppIdentity {
  const first = document.pages[0];
  const start = document.pages.some((page) => page.file === 'index.html') ? 'index.html' : (first?.file ?? 'index.html');
  const startPage = document.pages.find((page) => page.file === start) ?? first;
  const attributes = (startPage?.tree.attributes ?? {}) as Readonly<Record<string, unknown>>;
  const title = String(attributes.pageTitle ?? '').trim();
  const name = (title || first?.name.trim() || 'App').slice(0, 60);
  const brand = name.split(TITLE_SEPARATOR)[0]?.trim() || name;
  const appName = brand.length <= LAUNCHER_LENGTH ? brand : brand.slice(0, LAUNCHER_LENGTH).trim();
  const shortName = appName.length <= 12 ? appName : appName.split(/\s+/u)[0]?.slice(0, 12) || appName.slice(0, 12);
  const slug = appName.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '') || 'app';
  const seed = crc32(encoder.encode(startPage?.id ?? name)).toString(16).padStart(8, '0');
  const token = (document.tokens ?? []).find((one) => HEX.test(one.value.trim()))?.value.trim();
  const accent = startPage === undefined ? undefined : [...walk(startPage.tree)].map((node) => hexStyle(node, BACKGROUND)).find((hex): hex is string => hex !== null && isAccent(hex));
  const background = startPage === undefined ? null : hexStyle(startPage.tree, BACKGROUND);
  // the language the start page's <html lang> says (core/render/output.ts): its own setting, else the project's, else
  // English, so the README and the package metadata speak the site's language
  const language = pageLanguage(attributes.pageLanguage, document.language);
  return { name, appName, shortName, id: `com.webconstructor.site${seed}`, slug, color: token ?? accent ?? DEFAULT_COLOR, background: background ?? DEFAULT_BACKGROUND, start, language };
}

// ---- icons: a PNG drawn here (no canvas in the core), the app's initial on its colour ----

// a 5×7 font of the letters and digits, each row five bits, the leftmost the highest
const GLYPHS: Readonly<Record<string, readonly number[]>> = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31], 0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14],
  2: [14, 17, 1, 2, 4, 8, 31], 3: [30, 1, 1, 14, 1, 1, 30], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
  6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14], 9: [14, 17, 17, 15, 1, 2, 12],
};

const rgb = (hex: string): readonly [number, number, number] => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
};

// white or near-black, whichever reads better on the colour (WCAG relative luminance)
function inkOn(color: readonly [number, number, number]): readonly [number, number, number] {
  const [r, g, b] = color.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? [17, 24, 39] : [255, 255, 255];
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(encoder.encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

// zlib (RFC 1950) of stored deflate blocks (RFC 1951 BTYPE 00): valid for every reader, no compressor needed
function zlibStored(raw: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(raw.length / 65535));
  const out = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let at = 2;
  for (let i = 0; i < blocks; i += 1) {
    const part = raw.subarray(i * 65535, Math.min(raw.length, (i + 1) * 65535));
    out[at] = i === blocks - 1 ? 1 : 0;
    out[at + 1] = part.length & 0xff;
    out[at + 2] = part.length >> 8;
    out[at + 3] = ~part.length & 0xff;
    out[at + 4] = (~part.length >> 8) & 0xff;
    out.set(part, at + 5);
    at += 5 + part.length;
  }
  let a = 1;
  let b = 0;
  for (const byte of raw) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  new DataView(out.buffer).setUint32(at, ((b << 16) | a) >>> 0);
  return out;
}

// A square PNG of `size` pixels: a palette image (colour type 3, 2 bits a pixel) of the transparent corners, the
// colour and the ink; `maskable` fills the whole square and keeps the letter inside the safe zone (the centre 80%).
export function iconPng(size: number, color: string, letter: string, maskable = false): Uint8Array {
  const fill = rgb(color);
  const ink = inkOn(fill);
  const glyph = GLYPHS[letter.toUpperCase()] ?? GLYPHS.A ?? [];
  const radius = maskable ? 0 : size * 0.22;
  const scale = Math.floor((size * (maskable ? 0.4 : 0.5)) / 7);
  const left = Math.floor((size - scale * 5) / 2);
  const top = Math.floor((size - scale * 7) / 2);
  const stride = Math.ceil(size / 4);
  const raw = new Uint8Array((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < size; x += 1) {
      // inside the rounded square?
      const dx = Math.max(radius - x - 0.5, x + 0.5 - (size - radius), 0);
      const dy = Math.max(radius - y - 0.5, y + 0.5 - (size - radius), 0);
      let index = dx * dx + dy * dy > radius * radius ? 0 : 1;
      const gx = Math.floor((x - left) / scale);
      const gy = Math.floor((y - top) / scale);
      if (index === 1 && x >= left && y >= top && gx < 5 && gy < 7 && ((glyph[gy] ?? 0) >> (4 - gx)) & 1) index = 2;
      const at = y * (stride + 1) + 1 + (x >> 2);
      raw[at] = (raw[at] ?? 0) | (index << (6 - 2 * (x & 3)));
    }
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, size);
  view.setUint32(4, size);
  header[8] = 2;
  header[9] = 3;
  const palette = new Uint8Array([0, 0, 0, ...fill, ...ink]);
  const transparency = new Uint8Array([0, 255, 255]);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('PLTE', palette), chunk('tRNS', transparency), chunk('IDAT', zlibStored(raw)), chunk('IEND', new Uint8Array())];
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const initialOf = (name: string): string => [...name.normalize('NFD').replace(/[̀-ͯ]/gu, '').toUpperCase()].find((c) => GLYPHS[c] !== undefined) ?? 'A';

// the icons, unless the project holds its own at the same paths
function icons(entries: readonly ZipEntry[], identity: AppIdentity): ZipEntry[] {
  const held = new Set(entries.map((entry) => entry.path));
  const letter = initialOf(identity.appName);
  return [
    { path: ICON_192, bytes: iconPng(192, identity.color, letter) },
    { path: ICON_512, bytes: iconPng(512, identity.color, letter) },
    { path: ICON_MASKABLE, bytes: iconPng(512, identity.color, letter, true) },
  ].filter((icon) => !held.has(icon.path));
}

// The native icon sources, drawn like the web icons: the project's own 512px icon when it holds one at its path, else
// the app's initial on its colour.
const ownIcon = (entries: readonly ZipEntry[]): Uint8Array | undefined => entries.find((entry) => entry.path === ICON_512)?.bytes;

// A Windows icon (.ico) holding one PNG image (Windows Vista and later read PNG entries): the ICONDIR header, one
// ICONDIRENTRY (0 stands for 256 pixels) and the image.
function icoOf(png: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(22 + png.length);
  const view = new DataView(out.buffer);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);
  out[6] = size >= 256 ? 0 : size;
  out[7] = size >= 256 ? 0 : size;
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, png.length, true);
  view.setUint32(18, 22, true);
  out.set(png, 22);
  return out;
}

// A macOS icon (.icns) holding PNG images by their type (ic08: 256px, ic09: 512px, ic10: 1024px).
function icnsOf(images: readonly (readonly [string, Uint8Array])[]): Uint8Array {
  const length = 8 + images.reduce((sum, [, png]) => sum + 8 + png.length, 0);
  const out = new Uint8Array(length);
  const view = new DataView(out.buffer);
  out.set(encoder.encode('icns'), 0);
  view.setUint32(4, length);
  let at = 8;
  for (const [type, png] of images) {
    out.set(encoder.encode(type), at);
    view.setUint32(at + 4, 8 + png.length);
    out.set(png, at + 8);
    at += 8 + png.length;
  }
  return out;
}

const isPage = (path: string): boolean => /\.html?$/iu.test(path);

// text placed inside HTML: the characters markup reads, written as references
const escapeHtml = (value: string): string => value.replace(/[&<>"]/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

// every page gets the lines in its head (each line given the page's own path)
function intoHeads(entries: readonly ZipEntry[], lines: (page: string) => readonly string[]): ZipEntry[] {
  return entries.map((entry) => {
    if (!isPage(entry.path)) return entry;
    const html = decoder.decode(entry.bytes);
    const at = html.indexOf('</head>');
    if (at < 0) return entry;
    return text(entry.path, `${html.slice(0, at)}${lines(entry.path).map((line) => `  ${line}\n`).join('')}${html.slice(at)}`);
  });
}

export function webManifest(identity: AppIdentity): object {
  return {
    id: './',
    name: identity.name,
    short_name: identity.shortName,
    lang: identity.language,
    start_url: `./${identity.start}`,
    scope: './',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone'],
    background_color: identity.background,
    theme_color: identity.color,
    icons: [
      { src: ICON_192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: ICON_512, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: ICON_MASKABLE, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

// The service worker: every file of the site kept at install, fetched past the browser's HTTP cache (cache: 'reload'),
// so a new export never stores a stale copy as its new version. The pages, scripts, styles and data come from the
// network first (the latest published version, revalidated with the server) and from the cache offline; images, fonts
// and media from the cache first. Its caches are named by the site's scope as well as its version, so two sites on one
// origin (user.github.io/a/ and /b/) never delete each other's.
export function serviceWorker(paths: readonly string[], version: string, start: string): string {
  const files = ['./', ...paths.map((path) => `./${path.split('/').map(encodeURIComponent).join('/')}`)];
  return `// Service worker written by Webconstructor: the site works offline once opened.
const PREFIX = 'site:' + new URL(self.registration.scope).pathname + ':';
const CACHE = PREFIX + '${version}';
const FILES = ${JSON.stringify(files, null, 2)};
// what a new version may change, so it comes from the network first; anything else (images, fonts, media) from the cache
const FRESH = ['document', 'script', 'style', 'manifest', 'worker', ''];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES.map((file) => new Request(file, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

const keep = (request, response) => {
  if (response.ok) {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copy));
  }
  return response;
};

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const address = new URL(request.url);
  // the app's database (/_api/) always asks the server
  if (request.method !== 'GET' || address.origin !== self.location.origin || address.pathname.includes('/_api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => keep(request, response))
        .catch(() => caches.match(request, { ignoreSearch: true }).then((hit) => hit || caches.match(${JSON.stringify(`./${start}`)}))),
    );
    return;
  }
  if (FRESH.includes(request.destination)) {
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .then((response) => keep(request, response))
        .catch(() => caches.match(request).then((hit) => hit || Promise.reject(new Error('offline and not kept: ' + request.url)))),
    );
    return;
  }
  event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((response) => keep(request, response))));
});
`;
}

const versionOf = (entries: readonly ZipEntry[]): string => {
  let c = 0;
  for (const entry of entries) c = crc32(encoder.encode(`${c}:${entry.path}:${crc32(entry.bytes)}`));
  return c.toString(16).padStart(8, '0');
};

// The site as an installable web app.
export function pwaEntries(entries: readonly ZipEntry[], document: DocumentJson): ZipEntry[] {
  const identity = appIdentity(document);
  const withIcons = [...entries, ...icons(entries, identity)];
  const headed = intoHeads(withIcons, (page) => [
    `<link rel="manifest" href="${relativePath(page, PWA_MANIFEST)}">`,
    `<meta name="theme-color" content="${identity.color}">`,
    `<link rel="apple-touch-icon" href="${relativePath(page, ICON_192)}">`,
    `<script>if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('${relativePath(page, SERVICE_WORKER)}'));</script>`,
  ]);
  const manifestEntry = json(PWA_MANIFEST, webManifest(identity));
  const all = [...headed, manifestEntry];
  return [...all, text(SERVICE_WORKER, serviceWorker(all.map((entry) => entry.path), versionOf(all), identity.start))];
}

// a native app opens index.html: a site whose first page has another file gets one that goes there
function withIndex(entries: readonly ZipEntry[], identity: AppIdentity): ZipEntry[] {
  if (entries.some((entry) => entry.path === 'index.html')) return [...entries];
  const target = escapeHtml(encodeURI(identity.start));
  const title = escapeHtml(identity.appName);
  return [...entries, text('index.html', `<!DOCTYPE html>\n<html lang="${escapeHtml(identity.language)}">\n<head>\n  <meta charset="utf-8">\n  <meta http-equiv="refresh" content="0; url=${target}">\n  <title>${title}</title>\n</head>\n<body><a href="${target}">${title}</a></body>\n</html>\n`)];
}

const inFolder = (folder: string, entries: readonly ZipEntry[]): ZipEntry[] => entries.map((entry) => ({ path: `${folder}/${entry.path}`, bytes: entry.bytes }));

const GITIGNORE = 'node_modules/\nout/\nandroid/\nios/\n';

// The icon @capacitor/assets turns into every Android and iOS icon (assets/icon-only.png, 1024 pixels square:
// capacitorjs.com/docs/guides/splash-screens-and-icons)
export const NATIVE_ICON = 'assets/icon-only.png';
const CAPACITOR_ASSETS_VERSION = '^3.0.5';

// The Capacitor project of the site (Android and iOS).
export function androidEntries(entries: readonly ZipEntry[], document: DocumentJson): ZipEntry[] {
  const identity = appIdentity(document);
  const site = withIndex([...entries, ...icons(entries, identity), json(PWA_MANIFEST, webManifest(identity))], identity);
  return [
    json('package.json', {
      name: identity.slug,
      version: '1.0.0',
      private: true,
      description: identity.name,
      scripts: { 'add:android': 'cap add android', 'add:ios': 'cap add ios', icons: 'capacitor-assets generate', sync: 'cap sync', android: 'cap open android', ios: 'cap open ios' },
      dependencies: { '@capacitor/android': CAPACITOR_VERSION, '@capacitor/core': CAPACITOR_VERSION, '@capacitor/ios': CAPACITOR_VERSION },
      devDependencies: { '@capacitor/assets': CAPACITOR_ASSETS_VERSION, '@capacitor/cli': CAPACITOR_VERSION },
    }),
    json('capacitor.config.json', { appId: identity.id, appName: identity.appName, webDir: 'www', backgroundColor: identity.background, android: { backgroundColor: identity.background } }),
    { path: NATIVE_ICON, bytes: iconPng(1024, identity.color, initialOf(identity.appName)) },
    text('.gitignore', GITIGNORE),
    readme(identity, 'export.readme.android'),
    ...inFolder('www', site),
  ];
}

// The README of an app project, in the project's language (Portuguese for a pt project, English for any other), its
// file name too (LEIA-ME or README, in Markdown): the wording is the catalogues' (export.readme.*).
type ReadmeKey = 'export.readme.android' | 'export.readme.desktop';
function readme(identity: AppIdentity, key: ReadmeKey): ZipEntry {
  const catalogue = /^pt(-|$)/iu.test(identity.language) ? ptBR : en;
  return text(catalogue['export.readme.file'], formatMessage(catalogue[key], { name: identity.appName, id: identity.id }));
}

// The desktop icons Electron Forge builds with (packagerConfig.icon names them without an extension and each system
// takes its own: .ico on Windows, .icns on macOS, .png on Linux; the Squirrel installer takes the .ico).
export const DESKTOP_ICON = 'build/icon';

// The Electron Forge project of the site (Windows, macOS and Linux).
export function desktopEntries(entries: readonly ZipEntry[], document: DocumentJson): ZipEntry[] {
  const identity = appIdentity(document);
  const site = [...entries, ...icons(entries, identity)];
  const forgeName = identity.slug.replace(/-/gu, '_');
  const letter = initialOf(identity.appName);
  const png = (size: number): Uint8Array => (size === 512 ? (ownIcon(entries) ?? iconPng(512, identity.color, letter)) : iconPng(size, identity.color, letter));
  return [
    json('package.json', {
      name: identity.slug,
      productName: identity.appName,
      version: '1.0.0',
      description: identity.name,
      author: identity.appName,
      main: 'main.js',
      scripts: { start: 'electron-forge start', package: 'electron-forge package', make: 'electron-forge make' },
      dependencies: { 'electron-squirrel-startup': '^1.0.1' },
      devDependencies: {
        '@electron-forge/cli': FORGE_VERSION,
        '@electron-forge/maker-deb': FORGE_VERSION,
        '@electron-forge/maker-squirrel': FORGE_VERSION,
        '@electron-forge/maker-zip': FORGE_VERSION,
        electron: ELECTRON_VERSION,
      },
      config: {
        forge: {
          packagerConfig: { name: identity.appName, executableName: identity.slug, asar: true, icon: DESKTOP_ICON },
          makers: [
            { name: '@electron-forge/maker-squirrel', config: { name: forgeName, setupIcon: `${DESKTOP_ICON}.ico` } },
            { name: '@electron-forge/maker-zip', platforms: ['darwin', 'linux'] },
            { name: '@electron-forge/maker-deb', config: { options: { icon: `${DESKTOP_ICON}.png` } } },
          ],
        },
      },
    }),
    text('main.js', electronMain(identity)),
    { path: `${DESKTOP_ICON}.png`, bytes: png(512) },
    { path: `${DESKTOP_ICON}.ico`, bytes: icoOf(iconPng(256, identity.color, letter), 256) },
    { path: `${DESKTOP_ICON}.icns`, bytes: icnsOf([['ic08', iconPng(256, identity.color, letter)], ['ic09', png(512)], ['ic10', iconPng(1024, identity.color, letter)]]) },
    text('.gitignore', GITIGNORE),
    readme(identity, 'export.readme.desktop'),
    ...inFolder('app', site),
  ];
}

function electronMain(identity: AppIdentity): string {
  return `// ${identity.appName.replace(/[\r\n]+/gu, ' ')}: the site in a desktop window (Electron). The site's files are served from app/ through
// the app:// scheme, registered as standard and secure so modules, the import map, fetch and localStorage work as on
// the web. Every address outside the app (another site, an e-mail, a phone number) opens in the system's own apps,
// never in this window, which has no back button.
const { app, BrowserWindow, net, protocol, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

if (require('electron-squirrel-startup')) app.quit();

const ROOT = path.join(__dirname, 'app');
const INSIDE = 'app://bundle/';
const OUTSIDE = /^(https?|mailto|tel|sms):/i;

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    title: ${JSON.stringify(identity.appName)},
    backgroundColor: ${JSON.stringify(identity.background)},
    icon: path.join(ROOT, 'icons', 'icon-512.png'),
    autoHideMenuBar: true,
  });
  // a link that opens a new window: a page of the app opens in this window, any other address in the system's apps
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(INSIDE)) win.loadURL(url);
    else if (OUTSIDE.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // a link followed in this window: the app's own pages stay, any other address goes to the system's apps
  win.webContents.on('will-navigate', (event) => {
    if (event.url.startsWith(INSIDE)) return;
    event.preventDefault();
    if (OUTSIDE.test(event.url)) shell.openExternal(event.url);
  });
  win.loadURL(${JSON.stringify(`app://bundle/${encodeURI(identity.start)}`)});
};

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url);
    // a folder's address (app://bundle/, app://bundle/blog/) is its index.html, as on a web server
    const file = pathname.endsWith('/') ? pathname + 'index.html' : pathname;
    const target = path.resolve(ROOT, '.' + decodeURIComponent(file));
    const relative = path.relative(ROOT, target);
    // nothing outside app/ (app://bundle/../../file)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(target).toString());
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
`;
}

export function packageEntries(format: PackageFormat, entries: readonly ZipEntry[], document: DocumentJson): readonly ZipEntry[] {
  if (format === 'pwa') return pwaEntries(entries, document);
  if (format === 'android') return androidEntries(entries, document);
  if (format === 'desktop') return desktopEntries(entries, document);
  return entries;
}
