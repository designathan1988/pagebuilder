// @vitest-environment happy-dom
// The application runtime of a site (js/app-layer/runtime.js) as a page runs it: each case loads a fresh copy of the
// module and starts it on a page of its own, with the definitions core/logic/compile.ts writes.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appRuntimeScript } from './script.ts';
import { widgetsScript } from '../widgets/script.ts';

interface Runtime {
  readonly state: Record<string, unknown>;
  readonly app: {
    go(where: unknown): void;
    fetch(url: string, options?: object): Promise<unknown>;
    store: { get(key: string, fallback?: unknown): unknown; set(key: string, value: unknown): void };
    db: { add(table: string, data: object): Promise<unknown>; remove(table: string, id: string): Promise<unknown>; where(): Promise<string> };
  };
  effect(run: () => void): unknown;
  start(config: object): Promise<void>;
}

let copies = 0;
const fresh = async (): Promise<Runtime> => {
  copies += 1;
  const source = `${appRuntimeScript()}\n// copy ${copies}`;
  return (await import(/* @vite-ignore */ `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`)) as Runtime;
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const read = (body: (state: Record<string, unknown>, app: unknown, fn: unknown, locals: Record<string, unknown>) => unknown) => body;
const page = (html: string) => {
  document.body.innerHTML = html;
};
const happy = () => (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM;

describe('the application runtime', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-app-debug');
    localStorage.clear();
  });

  it('redraws a binding that reads a place of a list after sort and shift (LOGIC-6)', async () => {
    const { state, effect } = await fresh();
    state.scores = [3, 9, 5];
    const seen: unknown[] = [];
    effect(() => seen.push((state.scores as number[])[0]));
    (state.scores as number[]).sort((a, b) => b - a);
    await settle();
    expect(seen.at(-1)).toBe(9);
    (state.scores as number[]).shift();
    await settle();
    expect(seen.at(-1)).toBe(5);
  });

  it('writes no address that runs code, and a plain-text editable field as text (LOGIC-5)', async () => {
    const runtime = await fresh();
    page('<a data-app="a"></a><img data-app="i"><div data-app="e" contenteditable="plaintext-only"></div><div data-app="r" contenteditable="true"></div>');
    await runtime.start({
      variables: [{ name: 'site', type: 'text', initial: ' javascript:alert(1)' }, { name: 'note', type: 'text', initial: '<img src=x onerror=alert(1)><b>bold</b>' }],
      nodes: {
        a: { name: 'Link', attrs: [['href', read((s) => s.site)], ['srcdoc', read(() => '<p>x</p>')]] },
        i: { name: 'Photo', attrs: [['src', read(() => 'data:image/png;base64,AAAA')]] },
        e: { name: 'Plain', model: [read((s) => s.note), (s: Record<string, unknown>, _l: unknown, v: unknown) => (s.note = v)] },
        r: { name: 'Rich', model: [read((s) => s.note), (s: Record<string, unknown>, _l: unknown, v: unknown) => (s.note = v)] },
      },
    });
    const link = document.querySelector('a');
    expect(link?.hasAttribute('href')).toBe(false);
    expect(link?.hasAttribute('srcdoc')).toBe(false);
    expect(document.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(document.querySelector('[data-app="e"]')?.textContent).toBe('<img src=x onerror=alert(1)><b>bold</b>');
    const rich = document.querySelector('[data-app="r"]');
    expect(rich?.querySelector('b')?.textContent).toBe('bold');
    expect(rich?.querySelector('img')?.hasAttribute('onerror')).toBe(false);
    runtime.state.site = 'https://example.com/';
    await settle();
    expect(link?.getAttribute('href')).toBe('https://example.com/');
  });

  it('runs the mount handler of a row added after the start, keeps unkeyed rows, and names the failing field (LOGIC-7, LOGIC-8, LOGIC-18)', async () => {
    const runtime = await fresh();
    document.documentElement.setAttribute('data-app-debug', '');
    page('<ul><li data-app="row"></li></ul><p data-app="bad"></p>');
    const mounted: unknown[] = [];
    await runtime.start({
      variables: [{ name: 'todos', type: 'list', initial: ['a'] }],
      nodes: {
        row: { name: 'Row', each: read((s) => s.todos), as: 'todo', text: read((_s, _a, _f, l) => l.todo), on: [['mount', (_e: unknown, _el: unknown, _s: unknown, _a: unknown, _f: unknown, l: Record<string, unknown>) => mounted.push(l.todo)]] },
        bad: { name: 'Title', text: () => { throw new Error('boom'); } },
      },
    });
    expect(mounted).toEqual(['a']);
    const first = document.querySelector('li');
    (runtime.state.todos as string[]).push('b');
    await settle();
    expect(mounted).toEqual(['a', 'b']);
    // the row of the first place stays the same element
    expect(document.querySelector('li')).toBe(first);
    (runtime.state.todos as string[])[0] = 'c';
    await settle();
    expect(document.querySelector('li')).toBe(first);
    expect(first?.textContent).toBe('c');
    expect(document.querySelector('[data-app-errors]')?.textContent).toContain('Title (text): boom');
  });

  it('shows the variable\'s option in a select whose options a repeat writes (LOGIC-9)', async () => {
    const runtime = await fresh();
    page('<select data-app="pick"><option data-app="opt"></option></select>');
    await runtime.start({
      variables: [{ name: 'category', type: 'text', initial: 'b' }, { name: 'categories', type: 'list', initial: ['a', 'b', 'c'] }],
      nodes: {
        pick: { name: 'Category', model: [read((s) => s.category), (s: Record<string, unknown>, _l: unknown, v: unknown) => (s.category = v)] },
        opt: { name: 'Option', each: read((s) => s.categories), as: 'item', text: read((_s, _a, _f, l) => l.item), attrs: [['value', read((_s, _a, _f, l) => l.item)]] },
      },
    });
    await settle();
    expect(document.querySelector('select')?.value).toBe('b');
  });

  it('writes a number into a unitless property as it is (LOGIC-19)', async () => {
    const runtime = await fresh();
    page('<div data-app="cell"></div>');
    await runtime.start({ nodes: { cell: { name: 'Cell', styles: [['grid-column', read(() => 2)], ['width', read(() => 10)]] } } });
    const cell = document.querySelector<HTMLElement>('[data-app="cell"]');
    expect(cell?.style.getPropertyValue('grid-column')).not.toContain('px');
    expect(cell?.style.getPropertyValue('width')).toBe('10px');
  });

  it('keeps the site\'s own values apart and drops a kept value of another type (LOGIC-15)', async () => {
    happy().setURL('https://host.test/one/index.html');
    const runtime = await fresh();
    runtime.app.store.set('auth', 'mine');
    expect(Object.keys(localStorage)).toEqual(['app:host.test/one/|store:auth']);
    localStorage.setItem('app:host.test/one/|state:todos', '"a text"');
    await runtime.start({ variables: [{ name: 'todos', type: 'list', initial: [], persist: true }], nodes: {} });
    expect(runtime.state.todos).toEqual([]);
  });

  it('reads and writes a renamed variable under the name its visitors saved it as (LOGIC-12)', async () => {
    happy().setURL('https://host.test/one/index.html');
    const runtime = await fresh();
    localStorage.setItem('app:host.test/one/|state:cart', '["shoe"]');
    await runtime.start({ variables: [{ name: 'basket', type: 'list', initial: [], persist: true, kept: 'cart' }], nodes: {} });
    expect(runtime.state.basket).toEqual(['shoe']);
    runtime.state.basket = ['shoe', 'hat'];
    await settle();
    expect(JSON.parse(localStorage.getItem('app:host.test/one/|state:cart') ?? 'null')).toEqual(['shoe', 'hat']);
    expect(localStorage.getItem('app:host.test/one/|state:basket')).toBeNull();
  });

  it('sends a request body that is no plain object as it is, with the headers given (LOGIC-20)', async () => {
    const runtime = await fresh();
    const sent: RequestInit[] = [];
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
      sent.push(init);
      return Promise.resolve(new Response('{}', { headers: { 'content-type': 'application/json' } }));
    });
    const form = new URLSearchParams({ a: '1' });
    await runtime.app.fetch('/x', { method: 'POST', body: form });
    expect(sent[0]?.body).toBe(form);
    await runtime.app.fetch('/x', { method: 'POST', body: { a: 1 }, headers: new Headers({ authorization: 'Bearer t' }) });
    const headers = new Headers(sent[1]?.headers);
    expect(headers.get('authorization')).toBe('Bearer t');
    expect(headers.get('content-type')).toBe('application/json');
    expect(sent[1]?.body).toBe('{"a":1}');
  });

  it('names the database unavailable when the platform does not answer, and never saves in the browser instead (LOGIC-10, LOGIC-21)', async () => {
    happy().setURL('https://site.test/index.html');
    const runtime = await fresh();
    await runtime.start({ tables: [{ name: 'posts', read: 'public', write: 'public' }], nodes: {} });
    const asked: string[] = [];
    let answer = () => new Response('', { status: 503 });
    vi.stubGlobal('fetch', (url: string) => {
      asked.push(url);
      return Promise.resolve(answer());
    });
    await expect(runtime.app.db.add('posts', { title: 'x' })).rejects.toMatchObject({ code: 'unavailable' });
    expect(Object.keys(localStorage).some((key) => key.includes('db:posts'))).toBe(false);
    // asked again at the next call: the platform answers now
    answer = () => new Response(JSON.stringify({ service: 'webconstructor-data' }), { headers: { 'content-type': 'application/json' } });
    expect(await runtime.app.db.where()).toBe('cloud');
    await runtime.app.db.remove('posts', '../../auth/me');
    expect(asked.at(-1)).toBe('/_api/db/posts/..%2F..%2Fauth%2Fme');
  });

  it('asks the editor for a page of the site in the preview (LOGIC-22)', async () => {
    const runtime = await fresh();
    document.documentElement.setAttribute('data-app-debug', '');
    const posted: unknown[] = [];
    vi.spyOn(window.parent, 'postMessage').mockImplementation((message: unknown) => void posted.push(message));
    runtime.app.go('contato.html');
    expect(posted).toEqual([{ builderPreviewPage: 'contato.html' }]);
  });
});

describe('the web components', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    delete (window as unknown as { __wcWidgets?: boolean }).__wcWidgets;
    localStorage.clear();
  });

  it('reads a price in the page\'s language and starts a component the page writes later (LOGIC-16, LOGIC-17)', async () => {
    document.documentElement.lang = 'pt-BR';
    const product = (price: string) => `<div data-wc="product"><h3>Sofá</h3><span data-wc-price>${price}</span><button data-wc-add>+</button></div>`;
    document.body.innerHTML = product('R$ 1.299') + '<span data-wc-count></span>';
    new Function(widgetsScript())();
    expect(document.querySelector('[data-wc-price]')?.textContent?.replace(/\s/gu, ' ')).toBe('R$ 1.299,00');
    const later = document.createElement('div');
    later.innerHTML = product('R$ 12.500');
    document.body.appendChild(later);
    await settle();
    expect(later.querySelector('[data-wc-price]')?.textContent?.replace(/\s/gu, ' ')).toBe('R$ 12.500,00');
    later.querySelector<HTMLElement>('[data-wc-add]')?.click();
    expect(document.querySelector('[data-wc-count]')?.textContent).toBe('1');
  });
});
