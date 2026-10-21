// The derivation (spec content-data): what follows any change of the document in the same transaction, so the content
// stays one truth whatever command made the change.
//  1. An element bound to an item that the change edited directly (its text typed on the canvas, an image's source
//     picked in Settings) writes its new value to the item: the canvas is one more way to edit the collection. A
//     value the field cannot hold refuses the change, naming the row and the column.
//  2. The shared regions follow an edited instance (regions.ts syncRegions), and a page the change made receives the
//     regions shared with new pages.
//  3. Every bound list and item page shows its collection again (materialize.ts).
// The store calls deriveData after a handler's patches are applied and before the document is validated; the derived
// patches join the command's own in one history entry, so one undo takes the whole change back. A refusal here is a
// predictable one, said in the status bar; the command's change is then not applied at all.
import type { Message } from '../commands/registry.ts';
import type { DocNode, DocumentJson } from '../document/model.ts';
import { walk } from '../document/model.ts';
import { deepEqual, type Patch } from '../history/transaction.ts';
import type { MessageId } from '../../generated/ids.ts';
import { itemPagesOf, reached, shownBy, targetsOf, valueFor, type DataContext, type ItemPages, type Place } from './bindings.ts';
import { DataRefusal, collectionNamed, collectionsOf, queryItems, readCell, refuse } from './collections.ts';
import { materialize } from './materialize.ts';
import { ITEM_PAGE, type Cell, type Collection } from './model.ts';
import { documentPatches } from './patches.ts';
import { syncRegions } from './regions.ts';
import { plainText, type InlineRun } from '../text/inline.ts';

export type Derived = { readonly patches: readonly Patch[] } | { readonly refused: Message };

// Whether a document has anything to derive: collections, or a shared region.
const holdsContent = (document: DocumentJson): boolean => collectionsOf(document).length > 0 || (document.components ?? []).some((c) => c.shared !== undefined);

// Every place an item shows in the document: the repeated items of each bound list and every item page, with the
// item, its row and the elements that show it.
interface Shown {
  readonly place: Place;
  readonly nodes: readonly DocNode[];
}
function shownItems(document: DocumentJson): Shown[] {
  const shown: Shown[] = [];
  const at = (collection: Collection, id: string): Place | null => {
    const row = collection.items.findIndex((item) => item.id === id);
    const item = collection.items[row];
    return item === undefined ? null : { collection, item, row: row + 1 };
  };
  for (const page of document.pages) {
    for (const node of walk(page.tree)) {
      const list = node.dataList;
      const collection = list === undefined ? undefined : collectionNamed(document, list.collection);
      if (list === undefined || collection === undefined) continue;
      let rows: readonly { readonly id: string }[];
      try {
        rows = queryItems(collection, list.query);
      } catch {
        continue;
      }
      const instances = node.children.filter((child) => child.component === list.component);
      instances.forEach((instance, k) => {
        const item = rows[k];
        const place = item === undefined ? null : at(collection, item.id);
        if (place !== null) shown.push({ place, nodes: [...reached(instance)] });
      });
    }
    const mark = page.tree.dataItem;
    const collection = mark === undefined ? undefined : collectionNamed(document, mark.collection);
    const place = mark === undefined || collection === undefined ? null : at(collection, mark.item);
    if (place !== null) shown.push({ place, nodes: [...reached(page.tree)] });
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
  const writes = new Map<string, Map<string, Map<string, Cell | undefined>>>();
  for (const { place, nodes } of shownItems(after)) {
    for (const node of nodes) {
      const was = old.get(node.id);
      if (was === undefined) continue;
      for (const bound of node.bind ?? []) {
        const now = shownBy(node, bound.to);
        if (now === shownBy(was, bound.to)) continue;
        // a value that is what the item shows already is no edit of this element's (the command that changed it was
        // a content command, which showed the item itself)
        const expected = valueFor(after, bound, place, pages);
        const expectedText = expected === undefined ? undefined : typeof expected === 'string' ? expected : plainText(expected as readonly InlineRun[]);
        if (now === expectedText) continue;
        if (bound.field === ITEM_PAGE) refuse('status.data.pageLink', { name: node.name });
        const field = place.collection.fields.find((f) => f.key === bound.field);
        if (field === undefined) continue;
        const value = now === undefined ? undefined : readCell(field.type, written(node, now, field.type), after.language);
        if (value === null) refuse('status.data.badValue', { collection: place.collection.name, row: place.row, column: field.label, value: now ?? '', type: { key: `data.type.${field.type}` as MessageId } });
        const ofCollection = writes.get(place.collection.name) ?? new Map<string, Map<string, Cell | undefined>>();
        const ofItem = ofCollection.get(place.item.id) ?? new Map<string, Cell | undefined>();
        ofItem.set(field.key, value);
        ofCollection.set(place.item.id, ofItem);
        writes.set(place.collection.name, ofCollection);
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

// The marks a change left without meaning go with it, so no other command's change is ever refused because of them:
// a binding whose element can no longer show it (a link made a button, a text element given children), and the item
// mark of a page that copies another page made for the same item.
function prune(document: DocumentJson, context: DataContext): DocumentJson {
  const fix = (node: DocNode): DocNode => {
    let next = node;
    if (node.bind !== undefined) {
      const targets = targetsOf(node, context.rules);
      const seen = new Set<string>();
      const kept = node.bind.filter((bound) => {
        const fits = targets.includes(bound.to) && !seen.has(bound.to);
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
      const key = `${mark.collection}\u0000${mark.item}`;
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
      if (!deepEqual(collectionNamed(before, list.collection), collectionNamed(after, list.collection))) continue;
      const items = (n: DocNode) => n.children.filter((child) => child.component === list.component).map((child) => child.id);
      if (!deepEqual(items(was), items(node))) refuse('status.data.listOwned', { name: node.name, collection: list.collection });
    }
  }
}

// The document a change leads to once its content follows it (the steps above).
export function derivedDocument(before: DocumentJson, changed: DocumentJson, context: DataContext): DocumentJson {
  const after = prune(changed, context);
  if (!holdsContent(after) && !holdsContent(before)) return after;
  listEdit(before, after);
  const written = writeBack(before, after, itemPagesOf(after));
  const regions = syncRegions(before, written, context);
  return materialize(regions, context);
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
