// The richer content model (spec content-data): the field types beyond the plain ones (references, options, slugs,
// emails, files, videos, colours), the formats a binding writes its value in, the show bindings, nested lists, paged
// lists and the template of a collection's item pages — read on the blog fixture (manifest/features/fixtures/
// content-blog.json: authors, categories and posts) and on small collections of their own.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { manifest } from '../../manifest/runtime.ts';
import type { DocNode, DocumentJson } from '../document/model.ts';
import { walk } from '../document/model.ts';
import { rulesFromManifest, validateDocument } from '../document/validate.ts';
import { sequentialIds } from '../ports/ids.ts';
import { filledSlugs, guessType, itemNamed, lookupIn, readCell, readFieldCell, setCell, setField, type Lookup } from './collections.ts';
import { formatsOf, formattedText, itemPagesOf, placeOf, readBack, showHolds, templatePaths, type DataContext } from './bindings.ts';
import { derivedDocument } from './derive.ts';
import { materialize } from './materialize.ts';
import { DataRefusal } from './collections.ts';
import type { Collection, Field } from './model.ts';
import { siteDocument } from '../export/lists.ts';
import { previewPage, siteEntries } from '../export/export.ts';

const RULES = rulesFromManifest(manifest.elements, manifest.properties, manifest.html);
const context = (): DataContext => ({ ids: sequentialIds('t'), rules: RULES, words: (key) => key });
const blog = (): DocumentJson => JSON.parse(fs.readFileSync('manifest/features/fixtures/content-blog.json', 'utf8')) as DocumentJson;
const named = (document: DocumentJson, name: string): Collection => (document.collections ?? []).find((c) => c.name === name) as Collection;
const field = (collection: Collection, key: string): Field => collection.fields.find((f) => f.key === key) as Field;
const nodesNamed = (document: DocumentJson, page: number, name: RegExp): DocNode[] => [...walk(document.pages[page]?.tree as DocNode)].filter((node) => name.test(node.name));
const refusedWith = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    if (error instanceof DataRefusal) return error.refusal.key;
    throw error;
  }
  return 'accepted';
};

describe('the field types', () => {
  it('reads an email, a colour, a slug, a video address and a file in their canonical forms', () => {
    expect(readCell('email', ' ana@exemplo.com ')).toBe('ana@exemplo.com');
    expect(readCell('email', 'ana@exemplo')).toBeNull();
    expect(readCell('colour', '#F80')).toBe('#ff8800');
    expect(readCell('colour', 'e11d48')).toBe('#e11d48');
    expect(readCell('colour', 'red')).toBeNull();
    expect(readCell('slug', 'Bolo de Cenoura!')).toBe('bolo-de-cenoura');
    expect(readCell('slug', '!!!')).toBeNull();
    expect(readCell('video', 'https://www.youtube.com/watch?v=abc')).toBe('https://www.youtube.com/watch?v=abc');
    expect(readCell('video', 'javascript:alert(1)')).toBeNull();
    expect(readCell('file', 'docs/menu.pdf')).toBe('docs/menu.pdf');
    expect(readCell('multireference', 'a, b; a')).toEqual(['a', 'b']);
  });

  it('guesses an email, a colour and a video column from a file', () => {
    expect(guessType(['ana@exemplo.com', 'bruno@exemplo.com'])).toBe('email');
    expect(guessType(['#e11d48', '#0ea5e9'])).toBe('colour');
    expect(guessType(['https://youtu.be/abc', 'https://vimeo.com/1'])).toBe('video');
  });

  it('reads a reference by the id, the slug or the title of an item of its collection, and an option by its choice', () => {
    const document = blog();
    const lookup = lookupIn(document);
    const posts = named(document, 'Posts');
    expect(readFieldCell(field(posts, 'autor'), 'bruno lima', undefined, lookup)).toBe('a2');
    expect(readFieldCell(field(posts, 'autor'), 'a1', undefined, lookup)).toBe('a1');
    expect(readFieldCell(field(posts, 'autor'), 'Carla', undefined, lookup)).toBeNull();
    expect(readFieldCell(field(posts, 'categorias'), 'Viagem, cafe', undefined, lookup)).toEqual(['k2', 'k3']);
    expect(readFieldCell(field(posts, 'status'), 'publicado', undefined, lookup)).toBe('Publicado');
    expect(readFieldCell(field(posts, 'status'), 'Arquivado', undefined, lookup)).toBeNull();
    expect(itemNamed(named(document, 'Categorias'), 'cafe')?.id).toBe('k3');
  });

  it('makes a slug from the title while an item has none, numbered when taken, and refuses a slug another item holds', () => {
    const collection: Collection = { name: 'C', fields: [{ key: 'titulo', label: 'Título', type: 'text' }, { key: 'slug', label: 'Slug', type: 'slug' }], items: [{ id: 'i1', values: { titulo: 'Bolo' } }, { id: 'i2', values: { titulo: 'Bolo' } }, { id: 'i3', values: { titulo: 'Pão', slug: 'meu-pao' } }] };
    const filled = filledSlugs(collection);
    expect(filled.items.map((item) => item.values.slug)).toEqual(['bolo', 'bolo-2', 'meu-pao']);
    expect(refusedWith(() => setCell(filled, 'i3', 'slug', 'Bolo'))).toBe('status.data.slugTaken');
  });

  it('turns a text field into a reference through the titles it holds, and refuses a title no item has', () => {
    const document = blog();
    const lookup: Lookup = lookupIn(document);
    const people: Collection = { name: 'Pessoas', fields: [{ key: 'quem', label: 'Quem', type: 'text' }], items: [{ id: 'x', values: { quem: 'Ana Souza' } }] };
    const referencing = setField(people, 'quem', { type: 'reference', collection: 'Autores' }, lookup);
    expect(referencing.items[0]?.values.quem).toBe('a1');
    expect(setField(referencing, 'quem', { type: 'text' }, lookup).items[0]?.values.quem).toBe('Ana Souza');
    const stranger: Collection = { ...people, items: [{ id: 'x', values: { quem: 'Carla' } }] };
    expect(refusedWith(() => setField(stranger, 'quem', { type: 'reference', collection: 'Autores' }, lookup))).toBe('status.data.badValue');
    // an option's new choices keep every value it holds, or are refused
    const posts = named(document, 'Posts');
    expect(refusedWith(() => setField(posts, 'status', { options: ['Publicado'] }, lookup))).toBe('status.data.badValue');
  });

  it('releases a reference to an item that is gone in the same change', () => {
    const document = blog();
    const authors = named(document, 'Autores');
    const changed = { ...document, collections: (document.collections ?? []).map((c) => (c.name === 'Autores' ? { ...authors, items: authors.items.filter((item) => item.id !== 'a2') } : c)) };
    const after = derivedDocument(document, changed, context());
    expect(named(after, 'Posts').items.map((item) => item.values.autor)).toEqual(['a1', undefined, 'a1', undefined, undefined]);
    expect(validateDocument(after, [], RULES)).toEqual([]);
  });
});

describe('the formats of bound values', () => {
  const price: Field = { key: 'preco', label: 'Preço', type: 'number', decimals: 2 };
  const none: Lookup = () => undefined;
  it('writes a number as a currency, a percent or grouped in the site language', () => {
    expect(formattedText(price, 1234.5, { format: 'currency' }, 'pt-BR', none).replace(/\s/g, ' ')).toBe('R$ 1.234,50');
    expect(formattedText(price, 1234.5, { format: 'currency', currency: 'USD' }, 'en', none)).toBe('$1,234.50');
    expect(formattedText({ ...price, decimals: 0 } as Field, 12, { format: 'percent' }, 'en', none)).toBe('12%');
    expect(formattedText(price, 1234.5, { format: 'grouped' }, 'en', none)).toBe('1,234.50');
    expect(formattedText(price, 1234.5, {}, 'pt-BR', none)).toBe('1234,50');
  });
  it('writes a date in a style and a yes/no in a pair of words of the site language', () => {
    const date: Field = { key: 'data', label: 'Data', type: 'date' };
    expect(formattedText(date, '2026-10-01', { format: 'date-long' }, 'pt-BR', none)).toBe('1 de outubro de 2026');
    expect(formattedText(date, '2026-10-01', { format: 'month-year' }, 'en', none)).toBe('October 2026');
    expect(formattedText(date, '2026-10-01', {}, 'en', none)).toBe('2026-10-01');
    const flag: Field = { key: 'd', label: 'D', type: 'boolean' };
    expect(formattedText(flag, true, {}, 'pt-BR', none)).toBe('Sim');
    expect(formattedText(flag, false, { format: 'on-off' }, 'pt-BR', none)).toBe('Desligado');
    expect(formattedText(flag, true, { format: 'true-false' }, 'en', none)).toBe('True');
  });
  // the review of 5f94474e (R-10): what the canvas shows in a format, typed back, is the value it shows
  it('reads back every date style and every pair of words it writes, in the site language', () => {
    const date: Field = { key: 'data', label: 'Data', type: 'date' };
    const flag: Field = { key: 'd', label: 'D', type: 'boolean' };
    for (const language of ['en', 'pt-BR', 'de', 'fr', 'ja', undefined]) {
      for (const format of formatsOf(date)) {
        for (const value of ['2026-10-01', '1999-02-28', '2030-12-31']) {
          const expected = format === 'month-year' ? `${value.slice(0, 8)}01` : value;
          expect([language, format, readBack(date, formattedText(date, value, { format }, language, none), { format }, language, none)]).toEqual([language, format, expected]);
        }
      }
      for (const format of formatsOf(flag)) for (const value of [true, false]) expect(readBack(flag, formattedText(flag, value, { format }, language, none), { format }, language, none)).toBe(value);
    }
    expect(readBack(date, '31 de fevereiro de 2026', { format: 'date-long' }, 'pt-BR', none)).toBeNull();
    expect(readBack(date, '2 DE OUTUBRO DE 2026', { format: 'date-long' }, 'pt-BR', none)).toBe('2026-10-02');
    expect(readBack(flag, 'Talvez', { format: 'on-off' }, 'pt-BR', none)).toBeNull();
  });
});

describe('show bindings, nested lists, paged lists and the item template', () => {
  it('shows an element by a field of its item: set, empty, equal, through a reference', () => {
    const document = blog();
    const posts = named(document, 'Posts');
    const place = (id: string) => placeOf(posts, id) as NonNullable<ReturnType<typeof placeOf>>;
    expect(showHolds(document, { field: 'destaque', to: 'show', when: 'filled' }, place('p1'))).toBe(true);
    expect(showHolds(document, { field: 'destaque', to: 'show', when: 'filled' }, place('p2'))).toBe(false);
    expect(showHolds(document, { field: 'destaque', to: 'show', when: 'empty' }, place('p3'))).toBe(true);
    expect(showHolds(document, { field: 'status', to: 'show', when: 'eq', value: 'rascunho' }, place('p3'))).toBe(true);
    expect(showHolds(document, { field: 'autor.nome', to: 'show', when: 'neq', value: 'Ana Souza' }, place('p2'))).toBe(true);
    expect(showHolds(document, { field: 'categorias', to: 'show', when: 'eq', value: 'Viagem' }, place('p2'))).toBe(true);
  });

  it('shows a paged list\'s first page on the canvas, newest first, with each card\'s author through its reference', () => {
    const document = blog();
    const cards = nodesNamed(document, 0, /^Titulo/).map((node) => node.text);
    expect(cards).toEqual(['Café coado perfeito', 'Uma semana em Lisboa']);
    expect(nodesNamed(document, 0, /^Autor/).map((node) => node.text)).toEqual(['Ana Souza', 'Bruno Lima']);
    expect(nodesNamed(document, 0, /^Preco/).map((node) => node.text?.replace(/\s/g, ' '))).toEqual(['R$ 7,90', 'R$ 0,00']);
  });

  it('holds every item on the site, the ones past the first page hidden and marked for the list script', () => {
    const site = siteDocument(blog(), RULES, false);
    const list = nodesNamed(site, 0, /^Lista$/)[0] as DocNode;
    expect(list.customAttributes).toMatchObject({ 'data-list-paging': 'more', 'data-list-page-size': '2', 'data-list-more': 'Carregar mais' });
    expect(list.children.filter((child) => child.component === 'Cartao').map((child) => child.dataHidden === true)).toEqual([false, false, true, true, true]);
  });

  // the review of 5f94474e (R-2): a page holds the items that show, after the show filter, on the canvas as on the site
  it('shows on the canvas the first page the site shows, counted after a show binding of the cards', () => {
    const shownCards = (when: 'filled' | 'empty') => {
      const source = blog();
      const show = (node: DocNode): DocNode => (node.component === 'Cartao' ? { ...node, bind: [{ field: 'destaque', to: 'show', when }] } : { ...node, children: node.children.map(show) });
      const marked: DocumentJson = { ...source, components: (source.components ?? []).map((c) => (c.name === 'Cartao' ? { ...c, tree: { ...c.tree, bind: [{ field: 'destaque', to: 'show', when }] } } : c)), pages: source.pages.map((page) => ({ ...page, tree: show(page.tree) })) };
      const canvas = derivedDocument(source, marked, context());
      const cards = (document: DocumentJson) => (nodesNamed(document, 0, /^Lista$/)[0] as DocNode).children.filter((child) => child.component === 'Cartao');
      const title = (card: DocNode) => [...walk(card)].find((node) => /^Titulo/.test(node.name))?.text;
      const site = cards(siteDocument(canvas, RULES, false));
      return { canvas: cards(canvas).filter((card) => card.dataHidden !== true).map(title), site: site.filter((card) => card.dataHidden !== true).map(title), marked: site.filter((card) => card.customAttributes?.['data-list-item'] !== undefined).length };
    };
    expect(shownCards('filled')).toEqual({ canvas: ['Bolo de cenoura', 'Pão de queijo'], site: ['Bolo de cenoura', 'Pão de queijo'], marked: 0 });
    const empty = shownCards('empty');
    expect(empty.canvas).toHaveLength(2);
    expect(empty.site).toEqual(empty.canvas);
    expect(empty.marked).toBe(3);
  });

  it('repeats a nested list for the items a multireference names, its first item kept hidden while it names none', () => {
    const document = blog();
    const withNested: DocumentJson = { ...document, components: (document.components ?? []).map((c) => ({ ...c, tree: markTags(c.tree) })), pages: document.pages.map((page) => ({ ...page, tree: markTags(page.tree) })) };
    const site = siteDocument(withNested, RULES, false);
    const texts = nodesNamed(site, 0, /^Tag( |$)/).map((tag) => (tag.dataHidden === true ? '(hidden)' : tag.text));
    expect(texts).toEqual(['Categoria', 'Categoria', 'Categoria', 'Categoria', '(hidden)', 'Categoria']);
  });

  it('writes the template once per item, in the folder of its collection and at its slug, links leading there', () => {
    const document = blog();
    const paths = templatePaths(document).get('Posts');
    expect([...(paths?.values() ?? [])]).toEqual(['posts/bolo-de-cenoura.html', 'posts/uma-semana-em-lisboa.html', 'posts/cafe-coado-perfeito.html', 'posts/pao-de-queijo.html', 'posts/trilhas-da-serra.html']);
    expect(nodesNamed(document, 0, /^Leia/).map((node) => node.attributes.href)).toEqual(['posts/cafe-coado-perfeito.html', 'posts/uma-semana-em-lisboa.html']);
    const site = siteDocument(document, RULES, true);
    expect(site.pages.map((page) => page.file)).toEqual(['index.html', ...(paths?.values() ?? [])]);
    expect(site.pages.map((page) => [...walk(page.tree)].find((node) => node.name === 'Post autor')?.text ?? null)).toEqual([null, 'Ana Souza', 'Bruno Lima', 'Ana Souza', 'Bruno Lima', '']);
    expect(itemPagesOf(site).size).toBe(5);
  });

  it('refuses a change that would leave a later item of a paged list or of a template showing what its element cannot', () => {
    const document = blog();
    const withImage: DocumentJson = { ...document, collections: (document.collections ?? []).map((c) => (c.name === 'Posts' ? { ...c, fields: [...c.fields, { key: 'capa', label: 'Capa', type: 'image' }] } : c)) };
    const post = withImage.pages[1] as DocumentJson['pages'][number];
    const image = { id: 'post-cover', type: 'image', name: 'Capa', tag: 'img', attributes: { src: '', alt: '' }, classes: [], styles: {}, text: null, children: [], bind: [{ field: 'capa', to: 'image' }] } as unknown as DocNode;
    const bound: DocumentJson = { ...withImage, pages: [withImage.pages[0] as DocumentJson['pages'][number], { ...post, tree: { ...post.tree, children: [...post.tree.children, image] } }] };
    const posts = named(bound, 'Posts');
    const broken: DocumentJson = { ...bound, collections: (bound.collections ?? []).map((c) => (c.name === 'Posts' ? { ...posts, items: posts.items.map((item) => (item.id === 'p4' ? { ...item, values: { ...item.values, capa: 'nada.png' } } : item)) } : c)) };
    expect(refusedWith(() => materialize(broken, context()))).toBe('status.data.imageNotFound');
  });
});

// the Tags holders of the instances, as nested lists of the categories
function markTags(root: DocNode): DocNode {
  return { ...root, children: root.children.map((child) => (child.name.startsWith('Tags') && child.dataList === undefined ? { ...child, dataList: { collection: 'Categorias', via: 'categorias', query: {} } } : markTags(child))) };
}

describe('the exported site of the blog', () => {
  it('writes a page per post in posts/, a paged list with its script, and links from page to page', () => {
    const entries = siteEntries(blog(), RULES);
    const text = (path: string): string => new TextDecoder().decode(entries.find((entry) => entry.path === path)?.bytes ?? new Uint8Array());
    const paths = entries.map((entry) => entry.path);
    expect(paths).toEqual(expect.arrayContaining(['index.html', 'posts/bolo-de-cenoura.html', 'posts/trilhas-da-serra.html', 'js/lists.js', 'css/styles.css']));
    // the template is no page of the site
    expect(paths).not.toContain('post.html');
    const home = text('index.html');
    expect(home).toContain('<script defer src="js/lists.js"></script>');
    expect(home).toContain('data-list-paging="more"');
    expect(home).toContain('href="posts/cafe-coado-perfeito.html"');
    // every post is on the home page, the ones past the first page hidden until the list script shows them
    expect(home.match(/data-list-item/g)?.length).toBe(5);
    expect(home.split('\n').filter((line) => line.includes('data-list-item') && /\shidden[\s>]/.test(line))).toHaveLength(3);
    const post = text('posts/bolo-de-cenoura.html');
    expect(post).toContain('Bolo de cenoura');
    expect(post).toContain('Receitas, Café');
    expect(post).toContain('href="../css/styles.css"');
    expect(text('css/styles.css')).toContain('.list-more');
  });

  it('shows the paged list with its script in the preview, the template with the item chosen', () => {
    const html = previewPage(blog(), RULES, 0);
    expect(html).toContain('data-list-paging="more"');
    expect(html).toContain("querySelectorAll('[data-list-paging]')");
    expect(previewPage(blog(), RULES, 1)).toContain('Bolo de cenoura');
  });
});
