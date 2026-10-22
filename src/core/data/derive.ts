// The derivation (spec content-data): what follows any change of the document in the same transaction, so the content
// stays one truth whatever command made the change.
//  1. An element bound to an item that the change edited directly (its text typed on the canvas, an image's source
//     picked in Settings) writes its new value to the item — through a reference, to the item it names — the canvas
//     is one more way to edit the collection. A value the field cannot hold refuses the change, naming the row and the
//     column.
//  2. The collections settle: a slug an item lacks is made from its title, and a reference to an item that is gone is
//     released.
//  3. The shared regions follow an edited instance (regions.ts syncRegions), and a page the change made receives the
//     regions shared with new pages.
//  4. Every bound list and item page shows its collection again (materialize.ts).
// The store calls deriveData after a handler's patches are applied and before the document is validated; the derived
// patches join the command's own in one history entry, so one undo takes the whole change back. A refusal here is a
// predictable one, said in the status bar; the command's change is then not applied at all.
import type { Message } from '../commands/registry.ts';
import type { DocNode, DocumentJson, Page } from '../document/model.ts';
import { walk } from '../document/model.ts';
import { deepEqual, type Patch } from '../history/transaction.ts';
import type { MessageId } from '../../generated/ids.ts';
import { filledFor, itemPagesOf, placeOf, reached, reachedBy, readBack, repeats, shownBy, targetsOf, type DataContext, type ItemPages, type Place } from './bindings.ts';
import { DataRefusal, collectionNamed, collectionsOf, filledSlugs, lookupIn, queryItems, readFieldCell, referencedIds, refuse } from './collections.ts';
import { listFirstPage, materialize } from './materialize.ts';
import { ITEM_PAGE, SHOW, isReferenceType, type Cell, type Collection, type Item } from './model.ts';
import { documentPatches } from './patches.ts';
import { syncRegions } from './regions.ts';

export type Derived = { readonly patches: readonly Patch[] } | { readonly refused: Message };

// Whether a document has anything to derive: collections, or a shared region.
const holdsContent = (document: DocumentJson): boolean => collectionsOf(document).length > 0 || (document.components ?? []).some((c) => c.shared !== undefined);

// Every place an item shows in the document: the repeated items of each bound list (nested lists' too) and every item
// page, with the item, its row and the elements that show it — the places materialize.ts fills, read the same way.
interface Shown {
  readonly place: Place;
  readonly nodes: readonly DocNode[];
  // the component whose instance the elements stand in
  readonly component: string | undefined;
}
function shownItems(document: DocumentJson): Shown[] {
  const shown: Shown[] = [];
  const lookup = lookupIn(document);
  const visit = (node: DocNode, place: Place | null, within: string | undefined): void => {
    const inside = node.component ?? within;
    const list = node.dataList;
    const collection = list === undefined ? undefined : collectionNamed(document, list.collection);
    const placed = new Map<string, Place>();
    if (list !== undefined && collection !== undefined && (list.via === undefined || place !== null)) {
      let rows: readonly Item[] = [];
      try {
        const own = list.via === undefined || place === null ? collection.items : referencedIds(place.item.values[list.via]).flatMap((id) => collection.items.filter((item) => item.id === id));
        rows = listFirstPage(document, list, collection, queryItems({ ...collection, items: own }, list.query, lookup), node.children).rows;
      } catch (error) {
        if (!(error instanceof DataRefusal)) throw error;
      }
      node.children.filter((child) => repeats(list, child)).forEach((instance, k) => {
        const item = rows[k];
        const at = item === undefined ? null : placeOf(collection, item.id);
        if (at === null) return;
        placed.set(instance.id, at);
        shown.push({ place: at, nodes: [...reached(instance)], component: instance.component ?? inside });
      });
    }
    for (const child of node.children) visit(child, placed.get(child.id) ?? (list !== undefined && repeats(list, child) ? null : place), inside);
  };
  for (const page of document.pages) {
    const mark = page.tree.dataItem;
    const collection = mark === undefined ? undefined : collectionNamed(document, mark.collection);
    const first = mark?.template === true ? collection?.items[0]?.id : undefined;
    const id = mark?.item ?? first;
    const place = collection === undefined || id === undefined ? null : placeOf(collection, id);
    if (place !== null) shown.push({ place, nodes: [...reached(page.tree)], component: undefined });
    visit(page.tree, place, undefined);
  }
  return shown;
}

// What a value shown by an element is, as the field holds it: the text (with its marks, for a rich text field), the
// source, the alternative text or the address.
function written(node: DocNode, shown: string, type: Collection['fields'][number]['type']): unknown {
  if (type === 'richtext') return node.inline !== undefined ? node.inline : [shown];
  return shown;
}

// Step 1: the items the change edited through their elements.
function writeBack(before: DocumentJson, after: DocumentJson, pages: ItemPages): DocumentJson {
  const old = new Map<string, DocNode>();
  for (const page of before.pages) for (const node of walk(page.tree)) if (node.bind !== undefined) old.set(node.id, node);
  if (old.size === 0) return after;
  const lookup = lookupIn(after);
  const writes = new Map<string, Map<string, Map<string, Cell | undefined>>>();
  for (const { place, nodes, component } of shownItems(after)) {
    for (const node of nodes) {
      const was = old.get(node.id);
      if (was === undefined) continue;
      for (const bound of node.bind ?? []) {
        if (bound.to === SHOW) continue;
        const now = shownBy(node, bound.to);
        if (now === shownBy(was, bound.to)) continue;
        // a value that is what the item shows already is no edit of this element's (the command that changed it was
        // a content command, which showed the item itself)
        // (an item with no value there shows its component's own content, or none: filledFor)
        if (now === shownBy(filledFor(after, node, place, pages, component), bound.to)) continue;
        if (bound.field === ITEM_PAGE) refuse('status.data.pageLink', { name: node.name });
        // the item and the field the binding's path reaches: the place's own, or the one a reference names
        const target = reachedBy(lookup, place, bound.field);
        if (target === undefined) continue;
        const { field } = target;
        // an email shown as a link's address is written mailto:
        const typed = now !== undefined && field.type === 'email' && bound.to === 'link' ? now.replace(/^mailto:/i, '') : now;
        const value = typed === undefined ? undefined : field.type === 'richtext' ? readFieldCell(field, written(node, typed, field.type), after.language, lookup) : readBack(field, typed, bound, after.language, lookup);
        if (value === null) refuse('status.data.badValue', { collection: target.collection.name, row: target.row, column: field.label, value: now ?? '', type: { key: `data.type.${field.type}` as MessageId } });
        const ofCollection = writes.get(target.collection.name) ?? new Map<string, Map<string, Cell | undefined>>();
        const ofItem = ofCollection.get(target.item.id) ?? new Map<string, Cell | undefined>();
        ofItem.set(field.key, value);
        ofCollection.set(target.item.id, ofItem);
        writes.set(target.collection.name, ofCollection);
      }
    }
  }
  if (writes.size === 0) return after;
  return {
    ...after,
    collections: collectionsOf(after).map((collection) => {
      const ofCollection = writes.get(collection.name);
      if (ofCollection === undefined) return collection;
      return {
        ...collection,
        items: collection.items.map((item) => {
          const ofItem = ofCollection.get(item.id);
          if (ofItem === undefined) return item;
          const values: Record<string, Cell> = { ...item.values };
          for (const [key, value] of ofItem) {
            if (value === undefined) Reflect.deleteProperty(values, key);
            else values[key] = value;
          }
          return { id: item.id, values };
        }),
      };
    }),
  };
}
// Step 2: the collections settled — every slug an item lacks made from its title (collections.ts filledSlugs), every
// reference to an item its collection no longer holds released (a multireference keeps the others).
function settled(document: DocumentJson): DocumentJson {
  const collections = collectionsOf(document);
  if (collections.length === 0) return document;
  const held = new Map(collections.map((c) => [c.name, new Set(c.items.map((item) => item.id))]));
  let changed = false;
  const next = collections.map((collection) => {
    let current = filledSlugs(collection);
    const references = current.fields.filter((f) => isReferenceType(f.type));
    if (references.length > 0) {
      let items = current.items;
      items = items.map((item) => {
        let values = item.values;
        for (const field of references) {
          const value = values[field.key];
          if (value === undefined) continue;
          const ids = held.get(field.collection ?? '') ?? new Set<string>();
          const kept = referencedIds(value).filter((id) => ids.has(id));
          if (kept.length === referencedIds(value).length) continue;
          const { [field.key]: _gone, ...others } = values;
          void _gone;
          values = kept.length === 0 ? others : { ...others, [field.key]: field.type === 'reference' ? (kept[0] as string) : kept };
        }
        return values === item.values ? item : { id: item.id, values };
      });
      if (items.some((item, i) => item !== current.items[i])) current = { ...current, items };
    }
    if (current !== collection) changed = true;
    return current;
  });
  return changed ? { ...document, collections: next } : document;
}

// The marks a change left without meaning go with it, so no other command's change is ever refused because of them:
// a binding whose element can no longer show it (a link made a button, a text element given children), and the item
// mark of a page that copies another page made for the same item (or another template of the same collection).
function prune(document: DocumentJson, context: DataContext): DocumentJson {
  const fix = (node: DocNode): DocNode => {
    let next = node;
    if (node.bind !== undefined) {
      const targets = targetsOf(node, context.rules);
      const seen = new Set<string>();
      const kept = node.bind.filter((bound) => {
        const fits = (bound.to === SHOW || targets.includes(bound.to)) && !seen.has(bound.to);
        seen.add(bound.to);
        return fits;
      });
      if (kept.length !== node.bind.length) {
        const { bind: _bind, ...plain } = node;
        void _bind;
        next = kept.length === 0 ? plain : { ...plain, bind: kept };
      }
    }
    const children = next.children.map(fix);
    return children.every((child, i) => child === next.children[i]) ? next : { ...next, children };
  };
  const claimed = new Set<string>();
  const pages = document.pages.map((page) => {
    let tree = fix(page.tree);
    const mark = tree.dataItem;
    if (mark !== undefined) {
      const key = mark.template === true ? `${mark.collection}\u0000\u0000template` : `${mark.collection}\u0000${mark.item ?? ''}`;
      if (claimed.has(key)) {
        const { dataItem: _copy, ...plain } = tree;
        void _copy;
        tree = plain;
      }
      claimed.add(key);
    }
    return tree === page.tree ? page : { ...page, tree };
  });
  const components = document.components?.map((definition) => {
    const tree = fix(definition.tree);
    return tree === definition.tree ? definition : { ...definition, tree };
  });
  const changed = pages.some((page, i) => page !== document.pages[i]) || (components ?? []).some((c, i) => c !== document.components?.[i]);
  return changed ? { ...document, pages, ...(components === undefined ? {} : { components }) } : document;
}

// A bound list's repeated items are its collection's (spec data-binding): a command that adds one, removes one or moves
// them while the list and its collection stay as they were (a card duplicated, deleted or dragged) would see the list
// undo it at once, which is a silent failure; it is refused, saying where the items come from.
function listEdit(before: DocumentJson, after: DocumentJson): void {
  const lists = new Map<string, DocNode>();
  for (const page of before.pages) for (const node of walk(page.tree)) if (node.dataList !== undefined) lists.set(node.id, node);
  if (lists.size === 0) return;
  for (const page of after.pages) {
    for (const node of walk(page.tree)) {
      const was = lists.get(node.id);
      const list = node.dataList;
      if (was === undefined || list === undefined || !deepEqual(was.dataList, list)) continue;
      if (!deepEqual(collectionsOf(before), collectionsOf(after))) continue;
      const items = (n: DocNode) => n.children.filter((child) => repeats(list, child)).map((child) => child.id);
      if (!deepEqual(items(was), items(node))) refuse('status.data.listOwned', { name: node.name, collection: list.collection });
    }
  }
}

// The document a change leads to once its content follows it (the steps above).
export function derivedDocument(before: DocumentJson, changed: DocumentJson, context: DataContext): DocumentJson {
  const after = prune(changed, context);
  if (!holdsContent(after) && !holdsContent(before)) return after;
  listEdit(before, after);
  const written = settled(writeBack(before, after, itemPagesOf(after)));
  const regions = syncRegions(before, written, context);
  return materialize(regions, context, { checked: checkedBefore(before, regions), listChecked: listsCheckedBefore(before, regions) });
}

// A template page whose other items' pages need no check in this change (materialize.ts): its tree is the one the
// document held before, and so is everything else the check reads (the collections, the components, the project's
// files, the site's language: every part of the document but its pages). The document before held only what a change
// that checked them left, so they were checked then; an edit elsewhere costs no pass over the items.
function checkedBefore(before: DocumentJson, now: DocumentJson): (page: Page) => boolean {
  const keys = new Set([...Object.keys(before), ...Object.keys(now)] as (keyof DocumentJson)[]);
  const same = [...keys].every((key) => key === 'pages' || before[key] === now[key]);
  const trees = new Set<DocNode>(before.pages.map((page) => page.tree));
  return (page) => same && trees.has(page.tree);
}

// A query's list whose items past its first page need no check in this change (materialize.ts listChildren): its
// element is the one the document held before (its query, its repeated items: the sample a check fills), and so is
// everything else the check reads (the collections, the components, the project's files, the site's language: every
// part of the document but its pages). A nested list is never one: its rows follow the item it stands in. The lists of
// the document before are gathered once, on the first list asked about.
function listsCheckedBefore(before: DocumentJson, now: DocumentJson): (list: DocNode) => boolean {
  const keys = new Set([...Object.keys(before), ...Object.keys(now)] as (keyof DocumentJson)[]);
  const same = [...keys].every((key) => key === 'pages' || before[key] === now[key]);
  let lists: ReadonlySet<DocNode> | null = null;
  return (list) => {
    if (!same) return false;
    lists ??= new Set([...before.pages.map((page) => page.tree), ...(before.components ?? []).map((definition) => definition.tree)].flatMap((tree) => [...walk(tree)].filter((node) => node.dataList !== undefined)));
    return lists.has(list);
  };
}

// The derivation as the store asks for it: the patches that follow the command's, or the refusal that stops it.
export function deriveData(before: DocumentJson, after: DocumentJson, context: DataContext): Derived {
  try {
    const derived = derivedDocument(before, after, context);
    return { patches: derived === after || deepEqual(derived, after) ? [] : documentPatches(after, derived) };
  } catch (error) {
    if (error instanceof DataRefusal) return { refused: error.refusal };
    throw error;
  }
}
