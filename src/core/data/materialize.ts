// Materializing the content (spec content-data): the document as its collections say it is. Every bound list holds one
// repeated item per item of its query, in the query's order, each showing its item; every page made for an item shows
// it. One pure function, used by the commands that bind, fill and make pages, and by the derivation that follows any
// other change (derive.ts), so a list never shows anything but its collection.
//
// The repeated items of a list are the list element's children that are instances of the list's component, in order;
// its other children stay where they are. The n-th repeated item keeps its own nodes (ids, names, unbound content) and
// shows the n-th item; an item past the last repeated one gets a new instance of the component after the last one,
// named as a repeat names it; a repeated item past the last item goes, and every reference to it is released.
//
// A nested list (DataList.via) shows the items its place's item names in a multireference field: every child of the
// element is one of its items, the first the one the others are copied from; while the list shows none, its first item
// stays, hidden (dataHidden), so the list keeps its look for the items that name some.
//
// A paged list (Query.pageSize) shows its first page on the canvas; on the site (`site`) it holds every item, the ones
// past the first page hidden, and says how the site's list script reaches them (core/export/lists.ts).
import type { NodeId } from '../../generated/commands.ts';
import { refreshCopiedIdentities } from '../document/clone.ts';
import { locate, walk, type ComponentDefinition, type DocNode, type DocumentJson } from '../document/model.ts';
import { releaseReferencesPatch } from '../document/tree.ts';
import { copied, marked } from '../design/components.ts';
import { placementRefusal } from '../elements/content-model.ts';
import { applyPatches, deepEqual } from '../history/transaction.ts';
import { copyName } from '../structure/duplicate.ts';
import { nodeMaker, type NodeMaker } from '../structure/node-maker.ts';
import { sequentialIds } from '../ports/ids.ts';
import { collectionNamed, firstPage, lookupIn, queryItems, referencedIds, refuse, DataRefusal } from './collections.ts';
import { fillTree, itemPagesOf, placeOf, repeats, siteWord, type DataContext, type ItemPages, type Place } from './bindings.ts';
import type { Collection, DataList, Item } from './model.ts';

// A new repeated item: a copy of the component's definition with new ids, its root named after the item before it (a
// repeat's rule: "Card", "Card 2"…) and every element inside named so no other element shares its name.
export function newInstance(document: DocumentJson, definition: ComponentDefinition, after: string, make: NodeMaker): DocNode {
  const name = copyName(after, make.taken);
  make.taken.add(name);
  const plain = copied(definition.tree, () => make.ids.next() as NodeId, make, true);
  const tree = refreshCopiedIdentities(document, [{ source: definition.tree, copy: plain }])[0];
  if (tree === undefined) throw new Error('data: the copied instance is missing');
  return marked({ ...tree, name }, [], definition.name);
}

// A new item of a nested list: a copy of its first item with new ids and names, keeping the marks of the instance it
// stands in (the part of the component each element comes from, as a duplicate keeps them), never its hidden flag.
function newCopy(document: DocumentJson, template: DocNode, make: NodeMaker): DocNode {
  const copy = (node: DocNode): DocNode => {
    const name = copyName(node.name, make.taken);
    make.taken.add(name);
    const { dataHidden: _hidden, ...plain } = node;
    void _hidden;
    return { ...plain, id: make.ids.next() as NodeId, name, children: node.children.map(copy) };
  };
  const tree = refreshCopiedIdentities(document, [{ source: template, copy: copy(template) }])[0];
  if (tree === undefined) throw new Error('data: the copied item is missing');
  return tree;
}

// How the materialization writes the lists: for the canvas (a paged list shows its first page), or for the site.
export interface Materializing {
  readonly site?: boolean;
}

// The items a list shows for a place (a nested list's place is the item it stands in), in its query's order, or null
// when the list cannot show any (its collection, its component or its field is gone: the list loses its mark).
function listRows(document: DocumentJson, list: DataList, collection: Collection, place: Place | null): readonly Item[] | 'unplaced' {
  const lookup = lookupIn(document);
  if (list.via === undefined) return queryItems(collection, list.query, lookup);
  // a nested list outside any item (a component's definition, an element no item fills) shows what it holds
  if (place === null) return 'unplaced';
  const ids = referencedIds(place.item.values[list.via]);
  const named = ids.map((id) => collection.items.find((item) => item.id === id)).filter((item): item is Item => item !== undefined);
  return queryItems({ ...collection, items: named }, list.query, lookup);
}

// The site's words and marks on a paged list: its page size, its way to the next pages and the words of its controls
// in the site's language (core/export/lists.ts reads them), and the mark of each repeated item.
export const LIST_ATTRIBUTE = 'data-list-paging';
export const LIST_ITEM_ATTRIBUTE = 'data-list-item';
function pagedList(document: DocumentJson, node: DocNode, list: DataList): DocNode {
  const words = {
    [LIST_ATTRIBUTE]: list.query.paging ?? 'more',
    'data-list-page-size': String(list.query.pageSize ?? 0),
    'data-list-more': siteWord(document.language, 'data.site.loadMore'),
    'data-list-pages': siteWord(document.language, 'data.site.pages'),
  };
  return { ...node, customAttributes: { ...node.customAttributes, ...words } };
}
const markedItem = (node: DocNode, hidden: boolean): DocNode => {
  const { dataHidden: _was, ...plain } = node;
  void _was;
  return { ...plain, customAttributes: { ...node.customAttributes, [LIST_ITEM_ATTRIBUTE]: '' }, ...(hidden ? { dataHidden: true as const } : {}) };
};

// The document with every bound list and every item page showing its collection. A list whose collection or component
// is gone, and a page whose item is gone, lose their mark and keep what they show. A template page whose item is gone
// shows its collection's first item. A change inside a locked element is refused, as any command's is.
export function materialize(document: DocumentJson, context: DataContext, mode: Materializing = {}): DocumentJson {
  const pages: ItemPages = itemPagesOf(document);
  const make = nodeMaker(document, context.rules, context.ids, context.words);
  const removed = new Set<NodeId>();
  const site = mode.site === true;

  // The list element's children once the list shows its rows, each repeated item with the place it shows.
  const listChildren = (node: DocNode, list: DataList, collection: Collection, rows: readonly Item[], within: string | undefined): { readonly children: readonly DocNode[]; readonly places: ReadonlyMap<string, Place> } => {
    const shown = site ? rows : firstPage(rows, list.query);
    // the items past the first page are on the site only, yet what they would show is checked now, as the canvas's
    // are: an export never meets a value its element cannot show (an image no file answers to)
    const sample = node.children.find((child) => repeats(list, child));
    if (sample !== undefined) for (const item of rows.slice(shown.length)) fillTree(document, sample, { collection, item, row: collection.items.indexOf(item) + 1 }, pages, within);
    const places = new Map<string, Place>();
    const filled = (instance: DocNode, row: number): DocNode => {
      const item = shown[row];
      if (item === undefined) return instance;
      // the row a person sees: the item's place in the collection, as the Data grid numbers it
      const place = { collection, item, row: collection.items.indexOf(item) + 1 };
      // a nested list's first item shows again once it has an item (its show binding, if any, says again)
      let shownItem = instance;
      if (instance.dataHidden === true) {
        const { dataHidden: _hidden, ...plain } = instance;
        void _hidden;
        shownItem = plain;
      }
      const tree = fillTree(document, shownItem, place, pages, within);
      places.set(tree.id, place);
      return tree;
    };
    const kept: DocNode[] = [];
    let index = 0;
    let template: DocNode | undefined;
    for (const child of node.children) {
      if (!repeats(list, child)) {
        kept.push(child);
        continue;
      }
      template ??= child;
      if (index < shown.length) kept.push(filled(child, index));
      // a nested list keeps its first item while it shows none, hidden
      else if (index === 0 && list.via !== undefined) kept.push({ ...child, dataHidden: true });
      index += 1;
    }
    // the items past the last repeated one: new instances (new copies of the first item, in a nested list) after the
    // last one (at the end when the list holds none)
    const last = kept.findLastIndex((child) => repeats(list, child));
    const added: DocNode[] = [];
    const definition = list.component === undefined ? undefined : document.components?.find((c) => c.name === list.component);
    let before = node.children.filter((child) => repeats(list, child)).at(-1)?.name ?? definition?.name ?? node.name;
    for (let row = index; row < shown.length; row += 1) {
      const fresh = definition !== undefined ? newInstance(document, definition, before, make) : template !== undefined ? newCopy(document, template, make) : null;
      if (fresh === null) break;
      before = fresh.name;
      added.push(filled(fresh, row));
    }
    // (a list inside an item made in this same change stands in a copy of what was checked already: its definition's)
    if (added.length > 0) {
      const refused = locate(document, node.id as NodeId) === null ? null : placementRefusal(document, context.rules, node.id as NodeId, added);
      if (refused !== null) throw new DataRefusal(refused);
      kept.splice(last < 0 ? kept.length : last + 1, 0, ...added);
    }
    // on the site, the items past the first page are hidden until the list script shows them; an item its show binding
    // hides is no item of a page
    const pageSize = list.query.pageSize;
    let shownCount = 0;
    const paged = (child: DocNode): DocNode => {
      if (!repeats(list, child) || !places.has(child.id) || child.dataHidden === true) return child;
      shownCount += 1;
      return markedItem(child, shownCount > (pageSize ?? 0));
    };
    const children = site && pageSize !== undefined && shown.length > pageSize ? kept.map(paged) : kept;
    const same = children.length === node.children.length && children.every((child, i) => child === node.children[i]);
    return { children: same ? node.children : children, places };
  };

  // `unplaced`: the element stands outside any item, so nothing in it is hidden for one (a definition's element, an
  // instance no list fills); a nested list's first item, kept hidden while the list shows none, is not
  const visit = (node: DocNode, place: Place | null, unplaced = place === null, within: string | undefined = undefined): DocNode => {
    let next = node;
    // the component whose instance the element stands in (an item of a nested list shows its definition's content
    // where its item holds no value)
    const inside = node.component ?? within;
    if (unplaced && next.dataHidden === true) {
      const { dataHidden: _hidden, ...plain } = next;
      void _hidden;
      next = plain;
    }
    const list = node.dataList;
    let places: ReadonlyMap<string, Place> = new Map();
    if (list !== undefined) {
      const collection = collectionNamed(document, list.collection);
      const definition = list.component === undefined ? undefined : document.components?.find((c) => c.name === list.component);
      if (collection === undefined || (list.via === undefined && definition === undefined) || (list.via !== undefined && list.component !== undefined)) {
        const { dataList: _gone, ...plain } = next;
        void _gone;
        next = plain;
      } else {
        const rows = listRows(document, list, collection, place);
        if (rows !== 'unplaced') {
          const shown = listChildren(next, list, collection, rows, inside);
          places = shown.places;
          if (shown.children !== next.children) {
            const kept = new Set(shown.children.map((child) => child.id));
            for (const child of node.children) if (!kept.has(child.id)) for (const inner of walk(child)) removed.add(inner.id as NodeId);
            next = { ...next, children: shown.children };
          }
          if (site && list.query.pageSize !== undefined && rows.length > list.query.pageSize) next = pagedList(document, next, list);
        }
      }
    }
    const held = next;
    const children = held.children.map((child) => {
      const own = places.get(child.id);
      if (own !== undefined) return visit(child, own, false, inside);
      // a nested list's item that shows no item of it: no item fills it, and its hidden flag stays
      const nested = held.dataList?.via !== undefined && repeats(held.dataList, child);
      return nested ? visit(child, null, false, inside) : visit(child, place, place === null, inside);
    });
    return children.every((child, i) => child === held.children[i]) ? held : { ...held, children };
  };

  let working: DocumentJson = {
    ...document,
    pages: document.pages.map((page) => {
      let tree = page.tree;
      let place: Place | null = null;
      const mark = tree.dataItem;
      if (mark !== undefined) {
        const collection = collectionNamed(document, mark.collection);
        // a template shows the item chosen, else its collection's first; a copy shows its own item
        const chosen = collection === undefined ? null : mark.item === undefined ? null : placeOf(collection, mark.item);
        const first = mark.template === true && chosen === null && collection !== undefined && collection.items[0] !== undefined ? placeOf(collection, collection.items[0].id) : null;
        place = chosen ?? first;
        if (collection === undefined || (place === null && mark.template !== true)) {
          const { dataItem: _gone, ...plain } = tree;
          void _gone;
          tree = plain;
        } else if (mark.template === true && place?.item.id !== mark.item) {
          const { item: _old, ...kept } = mark;
          void _old;
          tree = { ...tree, dataItem: place === null ? kept : { ...kept, item: place.item.id } };
        }
        if (place !== null) tree = fillTree(document, tree, place, pages);
        // a template's other items are pages of the site: what each would show is checked now, as the item shown is
        if (mark.template === true && collection !== undefined && !site) {
          for (const item of collection.items) {
            if (item.id === place?.item.id) continue;
            const other = { ...page, tree: { ...page.tree, dataItem: { ...mark, item: item.id } } };
            materialize({ ...document, pages: [other] }, { ...context, ids: sequentialIds('check-') }, { site: true });
          }
        }
      }
      tree = visit(tree, place);
      if (tree === page.tree) return page;
      // what a lock holds stays as it is: a list or a page it would change refuses the whole change
      const lock = changedLock(page.tree, tree);
      if (lock !== null) refuse('status.data.locked', { name: lock.name });
      return { ...page, tree };
    }),
  };
  // a component's definition shows no item: nothing in it is hidden for one
  if (working.components?.some((definition) => [...walk(definition.tree)].some((n) => n.dataHidden === true)) === true) {
    working = { ...working, components: working.components.map((definition) => ({ ...definition, tree: visit(definition.tree, null) })) };
  }
  // what went with the removed repeated items: every reference to them (a link to an element, an interaction's target)
  if (removed.size > 0) working = applyPatches(working, releaseReferencesPatch(working, removed)).document;
  return working;
}

// The outermost locked element of a tree that a change of it reaches (changed, or gone), or null.
function changedLock(before: DocNode, after: DocNode): DocNode | null {
  const now = new Map([...walk(after)].map((node) => [node.id, node]));
  for (const node of walk(before)) if (node.locked === true && !deepEqual(now.get(node.id), node)) return node;
  return null;
}
