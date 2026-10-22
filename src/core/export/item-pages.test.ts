// A template's item pages as the site writes them (the review of 5f94474e, R-3, R-4 and R-5), on the blog fixture
// (manifest/features/fixtures/content-blog.json: Home, and the template page post.html of Posts).
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { DocNode, DocumentJson, Page } from '../document/model.ts';
import { RULES, runHandler } from '../testing/handlers.ts';
import { sequentialIds } from '../ports/ids.ts';
import { pagesFromCollectionCommand } from '../data/commands.ts';
import { DataRefusal } from '../data/collections.ts';
import { derivedDocument } from '../data/derive.ts';
import { materialize } from '../data/materialize.ts';
import type { DataContext } from '../data/bindings.ts';
import { siteEntries, siteFilesWritten } from './export.ts';

const blog = (): DocumentJson => JSON.parse(fs.readFileSync('manifest/features/fixtures/content-blog.json', 'utf8')) as DocumentJson;
const context = (): DataContext => ({ ids: sequentialIds('t'), rules: RULES, words: (key) => key });
const htmlOf = (document: DocumentJson, path: string): string => {
  const entry = siteEntries(document, RULES).find((one) => one.path === path);
  if (entry === undefined) throw new Error(`no ${path} in the archive`);
  return new TextDecoder().decode(entry.bytes);
};
const withRoot = (page: Page, tree: Partial<DocNode>): Page => ({ ...page, tree: { ...page.tree, ...tree } });
const refusedWith = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    if (error instanceof DataRefusal) return error.refusal.key;
    throw error;
  }
  return 'accepted';
};

describe('links to a template page', () => {
  it('lead to its first item page in the export, never to the template file the site does not write', () => {
    const document = blog();
    const link = { id: 'nav-post', type: 'link', name: 'Nav', tag: 'a', attributes: { href: 'post.html' }, classes: [], styles: {}, text: 'Latest post', children: [] } as unknown as DocNode;
    const home = document.pages[0] as Page;
    const linked: DocumentJson = { ...document, pages: [withRoot(home, { children: [link, ...home.tree.children] }), ...document.pages.slice(1)] };
    const paths = siteEntries(linked, RULES).map((one) => one.path);
    expect(paths).not.toContain('post.html');
    expect(htmlOf(linked, 'index.html')).toMatch(/<a[^>]*href="posts\/bolo-de-cenoura\.html"[^>]*>Latest post/);
  });
});

describe('the home page as a template', () => {
  it('is refused, so the site keeps its index.html', () => {
    const document = blog();
    const ran = runHandler(pagesFromCollectionCommand(), document, { collection: 'Autores', nameField: 'nome' }, { ui: { page: (document.pages[0] as Page).tree.id } });
    expect(ran.outcome.kind).toBe('refused');
    expect(ran.outcome.kind === 'refused' ? ran.outcome.message.key : null).toBe('status.data.templateIsHome');
  });

  it('refuses the first page when no page is index.html (the site opens there)', () => {
    const document = blog();
    const moved: DocumentJson = { ...document, pages: document.pages.map((page, i) => (i === 0 ? { ...page, file: 'inicio.html' } : page)) };
    const ran = runHandler(pagesFromCollectionCommand(), moved, { collection: 'Autores', nameField: 'nome' }, { ui: { page: (moved.pages[0] as Page).tree.id } });
    expect(ran.outcome.kind === 'refused' ? ran.outcome.message.key : null).toBe('status.data.templateIsHome');
  });
});

describe('the head of an item page', () => {
  const headed = (attributes: Record<string, string>): DocumentJson => {
    const document = blog();
    return { ...document, pages: document.pages.map((page, i) => (i === 1 ? withRoot(page, { attributes: { ...page.tree.attributes, ...attributes } as DocNode['attributes'] }) : page)) };
  };

  it('writes the item title in the place of the template page name, its own description and its own canonical address', () => {
    const document = headed({ pageTitle: 'Post — Meu blog', pageDescription: 'Um post', pageCanonical: 'https://exemplo.com/post.html' });
    const cake = htmlOf(document, 'posts/bolo-de-cenoura.html');
    const trail = htmlOf(document, 'posts/trilhas-da-serra.html');
    expect(cake).toContain('<title>Bolo de cenoura — Meu blog</title>');
    expect(trail).toContain('<title>Trilhas da serra — Meu blog</title>');
    // Posts has no description field: the description is the item's title
    expect(cake).toContain('<meta name="description" content="Bolo de cenoura">');
    expect(cake).toContain('<link rel="canonical" href="https://exemplo.com/posts/bolo-de-cenoura.html">');
    expect(trail).toContain('<link rel="canonical" href="https://exemplo.com/posts/trilhas-da-serra.html">');
  });

  it('reads a title that does not name the page as the site name, and a description field when the collection has one', () => {
    const document = headed({ pageTitle: 'Meu blog' });
    const posts = (document.collections ?? []).map((c) => (c.name === 'Posts' ? { ...c, fields: [...c.fields, { key: 'resumo', label: 'Resumo', type: 'text' as const }], items: c.items.map((item, i) => (i === 0 ? { ...item, values: { ...item.values, resumo: 'Fofo e simples.' } } : item)) } : c));
    const described: DocumentJson = { ...document, collections: posts };
    const first = (described.collections ?? []).find((c) => c.name === 'Posts')?.items[0];
    const html = siteEntries(described, RULES).filter((one) => one.path.startsWith('posts/')).map((one) => new TextDecoder().decode(one.bytes));
    expect(first?.values.resumo).toBe('Fofo e simples.');
    expect(html.some((text) => text.includes('<meta name="description" content="Fofo e simples.">'))).toBe(true);
    expect(html.every((text) => /<title>[^<]+ — Meu blog<\/title>/.test(text))).toBe(true);
    // no canonical on the template: none on its items
    expect(html.some((text) => text.includes('rel="canonical"'))).toBe(false);
  });
});

describe('the check of a template\'s other items', () => {
  // the template shows an image field; a later item names an image the project lacks
  const broken = (): DocumentJson => {
    const document = blog();
    const withImage: DocumentJson = { ...document, collections: (document.collections ?? []).map((c) => (c.name === 'Posts' ? { ...c, fields: [...c.fields, { key: 'capa', label: 'Capa', type: 'image' as const }], items: c.items.map((item) => (item.id === 'p4' ? { ...item, values: { ...item.values, capa: 'nada.png' } } : item)) } : c)) };
    const image = { id: 'post-cover', type: 'image', name: 'Capa', tag: 'img', attributes: { src: '', alt: '' }, classes: [], styles: {}, text: null, children: [], bind: [{ field: 'capa', to: 'image' }] } as unknown as DocNode;
    const post = withImage.pages[1] as Page;
    return { ...withImage, pages: [withImage.pages[0] as Page, withRoot(post, { children: [...post.tree.children, image] })] };
  };

  it('runs when a change reaches the template page, and not for a change elsewhere (no pass over the items)', () => {
    const before = broken();
    const home = before.pages[0] as Page;
    const post = before.pages[1] as Page;
    // a change of the home page only: the template's items read nothing it touched
    const renamed: DocumentJson = { ...before, pages: [{ ...home, name: 'Início' }, post] };
    expect(refusedWith(() => derivedDocument(before, renamed, context()))).toBe('accepted');
    // a change of the template page: every item is checked again
    const retitled: DocumentJson = { ...before, pages: [home, withRoot(post, { name: 'Post 2' })] };
    expect(refusedWith(() => derivedDocument(before, retitled, context()))).toBe('status.data.imageNotFound');
    // and with no earlier state to lean on, the check always runs
    expect(refusedWith(() => materialize(before, context()))).toBe('status.data.imageNotFound');
  });

  it('lists the item pages in the Explorer from the collection, as the archive writes them', () => {
    const document = blog();
    const listed = siteFilesWritten(document, RULES).filter((one) => one.part === 'page').map((one) => one.path);
    const archived = siteEntries(document, RULES).map((one) => one.path).filter((path) => path.endsWith('.html'));
    expect(listed).toEqual(archived);
  });
});
