// The app packages (spec export-packages): the installable web app's manifest, icons and service worker, the
// Capacitor and Electron projects around the site. With PACKAGES_OUT set, the test also writes the three archives of
// the todo example there, for building them with their own tools.
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { manifest } from '../../manifest/runtime.ts';
import type { DocumentJson } from '../document/model.ts';
import { rulesFromManifest } from '../document/validate.ts';
import type { SiteScripts } from '../ports/site-scripts.ts';
import { unzip } from '../project/zip.ts';
import { packageArchive, siteEntries } from './export.ts';
import { appIdentity, iconPng, PACKAGE_ARCHIVE, packageEntries, type PackageFormat } from './packages.ts';

const RULES = rulesFromManifest(manifest.elements, manifest.properties, manifest.html);
const scripts: SiteScripts = { forms: () => '', app: () => readFileSync('src/editor/app-runtime/runtime.js', 'utf8'), checkSyntax: () => null };
const todo = JSON.parse(readFileSync('src/editor/examples/todo.json', 'utf8')) as DocumentJson;
const files = (format: PackageFormat) => {
  const entries = packageEntries(format, siteEntries(todo, RULES, scripts), todo);
  return new Map(entries.map((entry) => [entry.path, new TextDecoder().decode(entry.bytes)]));
};

describe('the app packages', () => {
  it('draws a PNG of the size asked, its pixels the palette indexes', () => {
    const png = iconPng(192, '#2563eb', 'T');
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(png.buffer, png.byteOffset);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([192, 192]);
    // the IDAT chunk inflates to one filter byte and 48 bytes (192 pixels × 2 bits) a row
    let at = 8;
    let idat: Uint8Array | null = null;
    while (at < png.length) {
      const length = view.getUint32(at);
      const type = new TextDecoder().decode(png.subarray(at + 4, at + 8));
      if (type === 'IDAT') idat = png.subarray(at + 8, at + 8 + length);
      at += 12 + length;
    }
    const raw = inflateSync(idat as Uint8Array);
    expect(raw.length).toBe(192 * 49);
    // the corner is transparent (index 0), the middle of the letter T's bar is ink (index 2)
    expect(raw[1]).toBe(0);
  });

  it('names the app after the first page and colours it with the first colour token', () => {
    const identity = appIdentity({ ...todo, tokens: [{ name: 'brand', kind: 'color', value: '#ff6600' }] });
    expect(identity.color).toBe('#ff6600');
    expect(identity.id).toMatch(/^com\.webconstructor\.[a-z][a-z0-9_]*$/u);
  });

  it('speaks the language the start page\'s <html lang> says, English when the project names none', () => {
    const unnamed = Object.fromEntries(Object.entries(todo).filter(([key]) => key !== 'language')) as DocumentJson;
    expect(appIdentity(unnamed).language).toBe('en');
    const index = files('pwa').get('index.html') ?? '';
    expect(index).toContain(`<html lang="${appIdentity(todo).language}"`);
  });

  it('makes the site an installable web app', () => {
    const pwa = files('pwa');
    const webManifest = JSON.parse(pwa.get('manifest.webmanifest') ?? '{}') as { icons: { sizes: string }[]; start_url: string; display: string; name: string };
    expect(webManifest.display).toBe('standalone');
    expect(webManifest.icons.map((icon) => icon.sizes)).toEqual(['192x192', '512x512', '512x512']);
    expect(pwa.has('icons/icon-192.png') && pwa.has('icons/icon-512.png')).toBe(true);
    const index = pwa.get('index.html') ?? '';
    expect(index).toContain('<link rel="manifest" href="manifest.webmanifest">');
    expect(index).toContain("navigator.serviceWorker.register('sw.js')");
    // the worker keeps every file of the site, the app's modules among them
    const worker = pwa.get('sw.js') ?? '';
    for (const path of pwa.keys()) if (path !== 'sw.js') expect(worker).toContain(`"./${path}"`);
    expect(worker).toContain('"./js/app-layer/runtime.js"');
  });

  it('packs the site in a Capacitor project and in an Electron Forge project', () => {
    const android = files('android');
    expect(JSON.parse(android.get('capacitor.config.json') ?? '{}')).toMatchObject({ webDir: 'www' });
    expect(android.has('www/index.html') && android.has('www/js/app-layer/main.js')).toBe(true);
    const desktop = files('desktop');
    const pkg = JSON.parse(desktop.get('package.json') ?? '{}') as { main: string; author: string; description: string; config: { forge: { makers: unknown[] } } };
    expect(pkg.main).toBe('main.js');
    // Squirrel.Windows needs an author and a description (electronforge.io, maker-squirrel)
    expect(pkg.author !== '' && pkg.description !== '').toBe(true);
    expect(desktop.get('main.js')).toContain("protocol.handle('app'");
    expect(desktop.has('app/index.html')).toBe(true);
  });

  it('writes the projects\' README in the site\'s language, English for a language without its own', () => {
    for (const [language, file, title] of [['pt-BR', 'LEIA-ME.md', 'app Android e iOS'], ['en', 'README.md', 'Android and iOS app'], ['fr', 'README.md', 'Android and iOS app']] as const) {
      const site = { ...todo, language };
      const android = new Map(packageEntries('android', siteEntries(site, RULES, scripts), site).map((entry) => [entry.path, new TextDecoder().decode(entry.bytes)]));
      const desktop = new Map(packageEntries('desktop', siteEntries(site, RULES, scripts), site).map((entry) => [entry.path, new TextDecoder().decode(entry.bytes)]));
      const identity = appIdentity(site);
      expect(android.get(file)).toContain(`# ${identity.name}: ${title}`);
      expect(android.get(file)).toContain(`(\`${identity.id}\`)`);
      expect(desktop.get(file)).toContain(`${identity.name} Setup.exe`);
    }
  });

  it('writes archives every unzip tool reads', async () => {
    for (const format of ['site', 'pwa', 'android', 'desktop'] as const) {
      const bytes = packageArchive(format, todo, RULES, scripts);
      expect((await unzip(bytes)).size).toBeGreaterThan(2);
      const out = process.env.PACKAGES_OUT;
      if (out !== undefined && out !== '') writeFileSync(`${out}/${PACKAGE_ARCHIVE[format]}`, bytes);
    }
  });
});
