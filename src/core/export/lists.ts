// The site's content (spec content-data, "export"): the document the export writes, and the script of its paged lists.
//  - Every page made as a template of a collection's items becomes one page per item, at the folder of the
//    collection and the item's slug (core/data/bindings.ts templatePaths), each showing its item; the template
//    itself is no page of the site. Links bound to an item's page lead to those files, written relative to the page
//    that holds them (core/files/values.ts exportPath reads the expanded pages).
//  - Every bound list holds every item of its query: a paged list's items past its first page are hidden, and the
//    list carries its page size, its way to the next pages and their words, which js/lists.js reads to add a "load
//    more" button or page links after the list (core/data/materialize.ts, `site`).
// The preview writes the same lists, without expanding the template (it shows the pages the editor has).
import type { DocNode, DocumentJson, Page } from '../document/model.ts';
import type { ModelRules } from '../document/validate.ts';
import { walk } from '../document/model.ts';
import { sequentialIds } from '../ports/ids.ts';
import { applyPatches } from '../history/transaction.ts';
import { addressAttributes, followPaths } from '../files/references.ts';
import { fold, slug } from '../text/fold.ts';
import { collectionNamed, collectionsOf, fieldText, itemTitle, lookupIn, titleField } from '../data/collections.ts';
import { siteWord, siteYesNo, templatePaths, type DataContext } from '../data/bindings.ts';
import { LIST_ATTRIBUTE, materialize } from '../data/materialize.ts';
import type { Collection, Item } from '../data/model.ts';

// The pages the site writes, in the pages' order, read from the collections alone (no page is materialized): each
// page's own file, and in a template page's place its items' files (templatePaths), each with the page it comes from.
// What the Explorer lists, and the order the export writes them in.
export interface SitePage {
  readonly file: string;
  readonly page: Page;
  // the item an item page shows (the template is `page`)
  readonly item: string | null;
}
export function sitePages(document: DocumentJson): readonly SitePage[] {
  const paths = templatePaths(document);
  return document.pages.flatMap((page): SitePage[] => {
    const mark = page.tree.dataItem;
    if (mark?.template !== true) return [{ file: page.file, page, item: null }];
    const collection = collectionNamed(document, mark.collection);
    const files = paths.get(mark.collection);
    if (collection === undefined || files === undefined) return [];
    return collection.items.map((item) => ({ file: files.get(item.id) ?? page.file, page, item: item.id }));
  });
}

// The site's addresses of the template pages: a template writes no file of its own (its items' pages are the site's),
// so an address that names it — a menu's link to "post.html" — leads to its collection's first item's page, written
// as every other address to a page (DCS-087). A template whose collection holds no item writes no page, and its
// address stays as it is.
function templateAddresses(pages: readonly SitePage[]): ReadonlyMap<string, string> {
  const first = new Map<string, string>();
  for (const one of pages) if (one.item !== null && !first.has(one.page.file)) first.set(one.page.file, one.file);
  return first;
}

// The head an item's page writes (the review's R-4: every item page carried the template's title, description and
// canonical address), from the template's own settings (DCS-088):
//  - the title: the item's title; a template title that names the template page ("Post — My blog", the page "Post")
//    takes the item's title in that place, and any other template title is read as the site's name after it
//    ("Carrot cake — My blog"). The social title follows the same rule while the template sets one.
//  - the description: the item's description field (a text field named description, summary, excerpt, or their
//    Portuguese words) while the item holds one, else the item's title.
//  - the canonical address: the item page's own, at the place the template's canonical names for the template's file.
const DESCRIPTION_WORDS: ReadonlySet<string> = new Set(['description', 'descricao', 'summary', 'resumo', 'excerpt', 'sumario']);
const TITLE_SETTING = 'pageTitle';
const SEPARATED = /(\s+[—–|·-]\s+)/u;
function itemHeadTitle(stored: unknown, templateName: string, title: string): string {
  if (typeof stored !== 'string' || stored.trim() === '') return title;
  const parts = stored.split(SEPARATED);
  const at = parts.findIndex((part, i) => i % 2 === 0 && fold(part.trim()) === fold(templateName.trim()));
  if (at < 0) return `${title} — ${stored.trim()}`;
  return parts.map((part, i) => (i === at ? title : part)).join('');
}
function itemCanonical(stored: unknown, templateFile: string, itemFile: string): string | undefined {
  if (typeof stored !== 'string' || stored.trim() === '') return undefined;
  // the site's root, from the template's canonical address: as many folders up as the template's file stands in
  const depth = templateFile.split('/').length - 1;
  if (!URL.canParse(stored.trim())) return itemFile.split('/').pop() ?? itemFile;
  const root = new URL(`./${'../'.repeat(depth)}`, stored.trim());
  return new URL(itemFile, root).href;
}
function itemHead(document: DocumentJson, rules: ModelRules, page: Page, collection: Collection, item: Item, file: string): DocNode['attributes'] {
  const title = itemTitle(collection, item, document.language);
  const ids = (head: string): readonly string[] => [...rules.attributeValues].filter(([, facts]) => facts.head === head).map(([id]) => id);
  const held = page.tree.attributes as Readonly<Record<string, unknown>>;
  const next: Record<string, unknown> = { ...held, [TITLE_SETTING]: itemHeadTitle(held[TITLE_SETTING], page.name, title) };
  const own = titleField(collection);
  const described = collection.fields.find((field) => field !== own && (field.type === 'text' || field.type === 'richtext') && (DESCRIPTION_WORDS.has(slug(field.key)) || DESCRIPTION_WORDS.has(slug(field.label))));
  const words = described === undefined ? '' : fieldText(described, item.values[described.key], siteYesNo(document.language), { language: document.language, decimals: described.decimals }, lookupIn(document)).trim();
  for (const id of ids('meta:description')) next[id] = words === '' ? title : words;
  for (const id of ids('meta:og:title')) if (typeof held[id] === 'string' && held[id] !== '') next[id] = itemHeadTitle(held[id], page.name, title);
  for (const id of ids('link:canonical')) {
    const canonical = itemCanonical(held[id], page.file, file);
    if (canonical === undefined) Reflect.deleteProperty(next, id);
    else next[id] = canonical;
  }
  return next as DocNode['attributes'];
}

// The pages of the site: each template page replaced by its items' pages, in its place, each with its item's head;
// every address that names a template page leads to its first item's page (followPaths, the one rule of the places a
// path is written).
function expandedPages(document: DocumentJson, rules: ModelRules): DocumentJson {
  const pages = sitePages(document);
  if (pages.every((one) => one.item === null)) return document;
  const addresses = templateAddresses(pages);
  const followed = addresses.size === 0 ? document : applyPatches(document, followPaths(document, (path) => addresses.get(path) ?? path, undefined, addressAttributes(rules))).document;
  const expanded = sitePages(followed).map((one): Page => {
    if (one.item === null) return one.page;
    const mark = one.page.tree.dataItem;
    const collection = mark === undefined ? undefined : collectionNamed(followed, mark.collection);
    const item = collection?.items.find((each) => each.id === one.item);
    if (mark === undefined || collection === undefined || item === undefined) throw new Error('export: an item page lost its item');
    return {
      ...one.page,
      id: `${one.page.id}~${item.id}`,
      name: itemTitle(collection, item, followed.language),
      file: one.file,
      tree: { ...one.page.tree, attributes: itemHead(followed, rules, one.page, collection, item, one.file), dataItem: { ...mark, item: item.id } },
    };
  });
  return { ...followed, pages: expanded };
}

// The document as the site holds it: the item pages written out (itemPages) and every list whole. A project with no
// collection is the document itself.
// the ids the site's own copies take: counted, so two exports of one document are the same bytes
const siteContext = (document: DocumentJson, rules: ModelRules): DataContext => ({ ids: sequentialIds('site-item-'), rules, words: (key) => siteWord(document.language, key) });
export function siteDocument(document: DocumentJson, rules: ModelRules, itemPages: boolean): DocumentJson {
  if (collectionsOf(document).length === 0) return document;
  return materialize(itemPages ? expandedPages(document, rules) : document, siteContext(document, rules), { site: true });
}

// Whether the site holds a paged list (the export writes js/lists.js), found without writing every item's page: a
// list's pages are the same on every item page — its rows are its collection's, never the page's item — except a
// nested list's (DataList.via), whose rows are the ones its item names. So only a template that holds a nested list
// (in its tree, or in a component a list may copy) is written out item by item; any other shows its item, as on the
// canvas, and the site's lists are materialized once.
export function sitePagesLists(document: DocumentJson, rules: ModelRules): boolean {
  if (collectionsOf(document).length === 0) return document.pages.some((page) => pageUsesLists(page.tree));
  const nested = (tree: DocNode): boolean => [...walk(tree)].some((node) => node.dataList?.via !== undefined);
  const inComponents = (document.components ?? []).some((definition) => nested(definition.tree));
  const whole = document.pages.some((page) => page.tree.dataItem?.template === true && (inComponents || nested(page.tree)));
  const site = whole ? siteDocument(document, rules, true) : materialize(document, siteContext(document, rules), { site: true });
  return site.pages.some((page) => pageUsesLists(page.tree));
}

// Whether a page holds a paged list (it links js/lists.js).
export const pageUsesLists = (tree: DocNode): boolean => [...walk(tree)].some((node) => node.customAttributes?.[LIST_ATTRIBUTE] !== undefined);

// The look of the controls the script adds, in the site's stylesheet while a page holds a paged list: centred under
// the list, the current page marked.
export const LISTS_CSS = `.list-more,
.list-pages {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
  margin-top: 1.5rem;
}

.list-pages [aria-current="page"] {
  font-weight: 700;
}
`;

// The script of the paged lists (js/lists.js): after each paged list, a "load more" button that shows the next page
// of hidden items and goes once every item shows, or page links that show one page at a time and bring the list back
// into view. Without the script, the first page shows.
export const LISTS_JS = `(function () {
  function itemsOf(list) {
    return Array.prototype.filter.call(list.children, function (child) { return child.hasAttribute('data-list-item'); });
  }
  function setUp(list) {
    var size = parseInt(list.getAttribute('data-list-page-size') || '0', 10);
    var items = itemsOf(list);
    if (!(size > 0) || items.length <= size) return;
    function show(from, to) {
      items.forEach(function (item, i) { item.hidden = i < from || i >= to; });
    }
    var pages = list.getAttribute('${LIST_ATTRIBUTE}') === 'pages';
    var controls = document.createElement(pages ? 'nav' : 'div');
    controls.className = pages ? 'list-pages' : 'list-more';
    if (pages) {
      controls.setAttribute('aria-label', list.getAttribute('data-list-pages') || 'Pages');
      var links = [];
      for (var page = 0; page * size < items.length; page += 1) {
        (function (at) {
          var link = document.createElement('button');
          link.type = 'button';
          link.textContent = String(at + 1);
          link.addEventListener('click', function () {
            show(at * size, at * size + size);
            links.forEach(function (other, i) {
              if (i === at) other.setAttribute('aria-current', 'page');
              else other.removeAttribute('aria-current');
            });
            list.scrollIntoView({ block: 'start' });
          });
          links.push(link);
          controls.appendChild(link);
        })(page);
      }
      links[0].setAttribute('aria-current', 'page');
    } else {
      var shown = size;
      var more = document.createElement('button');
      more.type = 'button';
      more.textContent = list.getAttribute('data-list-more') || 'Load more';
      more.addEventListener('click', function () {
        shown += size;
        show(0, shown);
        if (shown >= items.length) controls.remove();
      });
      controls.appendChild(more);
    }
    list.insertAdjacentElement('afterend', controls);
  }
  Array.prototype.forEach.call(document.querySelectorAll('[${LIST_ATTRIBUTE}]'), setUp);
})();
`;
