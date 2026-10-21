// @vitest-environment happy-dom
// The words a site's runtimes show its visitors follow the page's language (<html lang>, the project's language unless
// the page sets its own): an English site reads English, a pt site Portuguese, any other language English. The words
// are the catalogues' (siteRuntime.*), written into the runtimes by their builders (app-runtime/words.ts).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { translate } from '../../i18n/index.ts';
import { appRuntimeScript } from '../app-runtime/script.ts';
import { SITE_WORDS_MARKER } from '../app-runtime/words.ts';
import { widgetsScript } from './script.ts';

const cases = [['en', 'en'], ['pt-BR', 'pt-BR'], ['pt', 'pt-BR'], ['fr', 'en']] as const;

describe('the visitor words of the site runtimes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    delete (window as unknown as { __wcWidgets?: boolean }).__wcWidgets;
  });

  it('writes the words into both runtimes', () => {
    expect(widgetsScript()).not.toContain(SITE_WORDS_MARKER);
    expect(appRuntimeScript()).not.toContain(SITE_WORDS_MARKER);
  });

  it.each(cases)('the components of a page in %s speak %s', (lang, locale) => {
    document.documentElement.lang = lang;
    document.body.innerHTML = '<div data-wc="lightbox"><img src="a.png" alt="a"><img src="b.png" alt="b"></div><div data-wc="cart"><div data-wc-items></div></div>';
    new Function(widgetsScript())();
    document.querySelector<HTMLElement>('[data-wc="lightbox"] img')?.click();
    expect(document.querySelector('.wc-lb-close')?.getAttribute('aria-label')).toBe(translate(locale, 'siteRuntime.widgets.close'));
    expect(document.querySelector('.wc-lb-next')?.getAttribute('aria-label')).toBe(translate(locale, 'siteRuntime.widgets.next'));
    expect(document.querySelector('[data-wc="cart"]')?.getAttribute('aria-label')).toBe(translate(locale, 'siteRuntime.widgets.cart'));
  });

  it.each(cases)('the application runtime of a page in %s speaks %s', async (lang, locale) => {
    document.documentElement.lang = lang;
    // no platform backend answers: the members are the browser's own
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 404 })));
    const source = `${appRuntimeScript()}\n// ${lang}`;
    const runtime = (await import(/* @vite-ignore */ `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`)) as { app: { auth: { signup(input: object): Promise<unknown> } } };
    await expect(runtime.app.auth.signup({ email: 'visitor@example.com', password: 'short' })).rejects.toThrow(translate(locale, 'siteRuntime.app.error.weakPassword'));
  });
});
