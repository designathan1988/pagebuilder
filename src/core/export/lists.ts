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
import { collectionNamed, collectionsOf, itemTitle } from '../data/collections.ts';
import { siteWord, templatePaths, type DataContext } from '../data/bindings.ts';
import { LIST_ATTRIBUTE, materialize } from '../data/materialize.ts';

// The pages of the site: each template page replaced by its items' pages, in its place.
function expandedPages(document: DocumentJson): readonly Page[] {
  const paths = templatePaths(document);
  return document.pages.flatMap((page) => {
    const mark = page.tree.dataItem;
    if (mark?.template !== true) return [page];
    const collection = collectionNamed(document, mark.collection);
    const files = paths.get(mark.collection);
    if (collection === undefined || files === undefined) return [];
    return collection.items.map((item) => ({
      ...page,
      id: `${page.id}~${item.id}`,
      name: itemTitle(collection, item, document.language),
      file: files.get(item.id) ?? page.file,
      tree: { ...page.tree, dataItem: { ...mark, item: item.id } },
    }));
  });
}

// The document as the site holds it: the item pages written out (itemPages) and every list whole. A project with no
// collection is the document itself.
export function siteDocument(document: DocumentJson, rules: ModelRules, itemPages: boolean): DocumentJson {
  if (collectionsOf(document).length === 0) return document;
  // the ids the site's own copies take: counted, so two exports of one document are the same bytes
  const context: DataContext = { ids: sequentialIds('site-item-'), rules, words: (key) => siteWord(document.language, key) };
  const pages = itemPages ? expandedPages(document) : document.pages;
  return materialize(pages === document.pages ? document : { ...document, pages }, context, { site: true });
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
