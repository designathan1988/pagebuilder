// The content commands (spec content-data): the collections and their fields and
// items, the bindings of elements, bound lists, pages made from a page, and shared regions. Each handler computes the
// document its change leads to with the content module's pure functions — the derivation included (derive.ts), so a
// list, an item page and a shared region already follow the change — and hands the store the difference as patches:
// one undo step. A predictable refusal (a value its field cannot hold, an image no file answers to, a locked element)
// is answered before any patch, naming the row, the column or the element at fault.
import type { NodeId } from '../../generated/commands.ts';
import type { MessageId } from '../../generated/ids.ts';
import { message, registerHandler, registerPredicate, type HandlerContext, type Message, type Outcome } from '../commands/registry.ts';
import { lineage, locate, walk, type ComponentDefinition, type DocNode, type DocumentJson, type Page } from '../document/model.ts';
import { refreshCopiedIdentities } from '../document/clone.ts';
import { componentName, copied, createRefusal, marked } from '../design/components.ts';
import { componentHolders } from '../design/instances.ts';
import { lockRefusal } from '../nodes/flags.ts';
import { HOME as HOME_FILE, copyPage, openedPage, type WithPage } from '../project/pages.ts';
import { copiedCaptureSheet } from '../files/files.ts';
import type { Patch } from '../history/transaction.ts';
import { bindablePaths, boundIn, pathField, pathUses, repeats, targetsOf, templateOf, type DataContext } from './bindings.ts';
import {
  DataRefusal,
  addField,
  addItem,
  canonicalQuery,
  collectionNamed,
  collectionsOf,
  createCollection,
  deleteItems,
  fieldText,
  itemTitle,
  keyFor,
  lookupIn,
  moveItem,
  nameRefusal,
  queryItems,
  queryRefusal,
  refuse,
  removeField,
  setCell,
  setField,
} from './collections.ts';
import { derivedDocument } from './derive.ts';
import { FIELD_TYPES, ITEM_PAGE, SHOW, SHOW_WHEN, isReferenceType, type BindFormat, type BindTarget, type Bound, type Collection, type FieldType, type Query, type ShowWhen } from './model.ts';
import { documentPatches } from './patches.ts';
import { detachRegion, shareRegion, stopSharing } from './regions.ts';

// The editor state's part the content commands follow: the collection the Data panel shows (the editor's own state is
// wider: src/editor/data/state.ts).
export interface WithCollection {
  readonly data?: { readonly collection?: string | undefined } | undefined;
}

const contextOf = <Ui>(context: HandlerContext<Ui>): DataContext => ({ ids: context.ids, rules: context.rules, words: (key, params) => context.words(key, params) });

// A content change as the store takes it: the patches from the document before to the one the change and its
// derivation lead to; a DataRefusal thrown on the way is the command's refusal.
export function contentChange<Ui>(
  context: HandlerContext<Ui>,
  compute: (document: DocumentJson, data: DataContext) => { readonly document: DocumentJson; readonly message: Message; readonly ui?: Ui; readonly selection?: readonly NodeId[] }
): Outcome<Ui> {
  try {
    const before = context.state.document;
    const data = contextOf(context);
    const result = compute(before, data);
    const after = derivedDocument(before, result.document, data);
    const patches: Patch[] = documentPatches(before, after);
    // the selection keeps only what is still there (a card whose item went goes with its item)
    const chosen = result.selection ?? context.state.selection;
    const selection = chosen.filter((id) => locate(after, id) !== null);
    const moved = result.selection !== undefined || selection.length !== chosen.length;
    return { kind: 'change', patches, message: result.message, ...(result.ui === undefined ? {} : { ui: result.ui }), ...(moved ? { selection } : {}) };
  } catch (error) {
    if (error instanceof DataRefusal) return { kind: 'refused', message: error.refusal };
    throw error;
  }
}

// The collection a door names (a door stands for a collection that exists, so a missing one is a defect of the door).
function named(document: DocumentJson, name: unknown): Collection {
  const found = typeof name === 'string' ? collectionNamed(document, name) : undefined;
  if (found === undefined) throw new Error(`data: the project has no collection ${String(name)}`);
  return found;
}

// The document with one collection replaced (its name may change).
const withCollection = (document: DocumentJson, name: string, next: Collection): DocumentJson => ({ ...document, collections: collectionsOf(document).map((c) => (c.name === name ? next : c)) });

const fieldType = (value: unknown): FieldType => {
  if (!(FIELD_TYPES as readonly unknown[]).includes(value)) throw new Error(`data: ${String(value)} is not a field type`);
  return value as FieldType;
};

// The collection the Data panel shows: the one chosen (data.select), else the project's first.
export function shownCollection(document: DocumentJson, ui: WithCollection | undefined): Collection | undefined {
  const chosen = ui?.data?.collection;
  return (chosen === undefined ? undefined : collectionNamed(document, chosen)) ?? collectionsOf(document)[0];
}

// A JSON argument read as a query (a door hands its canonical form).
function queryOf(value: unknown): Query {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? canonicalQuery(value as Query) : {};
}

// ---------------------------------------------------------------- collections

// data.createCollection: a new collection with one text field, named as typed, else "Collection" (numbered when taken);
// the Data panel shows it.
export function createCollectionCommand<Ui extends WithCollection>() {
  return registerHandler<'data.createCollection', Ui>('data.createCollection', (context, { name }) =>
    contentChange(context, (document) => {
      const typed = typeof name === 'string' ? name.trim() : '';
      const base = typed === '' ? context.words('data.defaultCollection') : typed;
      let chosen = base;
      if (typed === '') for (let n = 2; nameRefusal(collectionsOf(document), chosen) !== null; n += 1) chosen = `${base} ${n}`;
      const label = context.words('data.defaultField');
      const collection = createCollection(collectionsOf(document), chosen, [{ key: keyFor(label, []), label, type: 'text' }]);
      return {
        document: { ...document, collections: [...collectionsOf(document), collection] },
        message: message('status.data.created', { name: collection.name }),
        ui: { ...context.state.ui, data: { ...context.state.ui?.data, collection: collection.name } },
      };
    }),
  );
}

// data.renameCollection: a new name, which every list and item page bound to it follows.
export function renameCollectionCommand<Ui extends WithCollection>() {
  return registerHandler<'data.renameCollection', Ui>('data.renameCollection', (context, { collection, name }) =>
    contentChange(context, (document) => {
      const held = named(document, collection);
      const typed = name.trim();
      if (typed === held.name) return { document, message: message('status.data.renamed', { name: typed }) };
      const refused = nameRefusal(collectionsOf(document), typed, held.name);
      if (refused !== null) throw new DataRefusal(refused);
      const follow = (node: DocNode): DocNode => {
        let next = node;
        if (node.dataList?.collection === held.name) next = { ...next, dataList: { ...node.dataList, collection: typed } };
        if (node.dataItem?.collection === held.name) next = { ...next, dataItem: { ...node.dataItem, collection: typed } };
        const children = next.children.map(follow);
        return children.every((child, i) => child === next.children[i]) ? next : { ...next, children };
      };
      // the reference fields that name it name it by its new name
      const moved = withCollection(document, held.name, { ...held, name: typed });
      const follows = (c: Collection): Collection => (c.fields.some((f) => f.collection === held.name) ? { ...c, fields: c.fields.map((f) => (f.collection === held.name ? { ...f, collection: typed } : f)) } : c);
      const renamed: DocumentJson = { ...moved, collections: collectionsOf(moved).map(follows) };
      return {
        document: {
          ...renamed,
          pages: renamed.pages.map((page) => ({ ...page, tree: follow(page.tree) })),
          ...(renamed.components === undefined ? {} : { components: renamed.components.map((c) => ({ ...c, tree: follow(c.tree) })) }),
        },
        message: message('status.data.renamed', { name: typed }),
        ui: context.state.ui?.data?.collection === held.name ? { ...context.state.ui, data: { ...context.state.ui.data, collection: typed } } : context.state.ui,
      };
    }),
  );
}

// Where a collection is shown: its bound lists and its item pages.
function usesOf(document: DocumentJson, name: string): number {
  let uses = 0;
  for (const page of document.pages) for (const node of walk(page.tree)) if (node.dataList?.collection === name || node.dataItem?.collection === name) uses += 1;
  return uses;
}

// data.deleteCollection: asked first (with how many lists and pages show it); the lists and item pages it fed keep
// what they show as ordinary content.
export function deleteCollectionCommand<Ui extends WithCollection>() {
  return registerHandler<'data.deleteCollection', Ui>('data.deleteCollection', (context, { collection }) => {
    const held = named(context.state.document, collection);
    if (context.confirmed !== true) return { kind: 'confirm', params: { name: held.name, count: usesOf(context.state.document, held.name) } };
    return contentChange(context, (document) => {
      const release = (node: DocNode): DocNode => {
        let next = node;
        if (node.dataList?.collection === held.name) {
          const { dataList: _list, ...plain } = next;
          void _list;
          next = plain;
        }
        if (node.dataItem?.collection === held.name) {
          const { dataItem: _item, ...plain } = next;
          void _item;
          next = plain;
        }
        const children = next.children.map(release);
        return children.every((child, i) => child === next.children[i]) ? next : { ...next, children };
      };
      // a reference field that names it becomes a text field holding the titles of the items it named: nothing a
      // person typed is lost with the collection
      const lookup = lookupIn(document);
      const rest = collectionsOf(document)
        .filter((c) => c.name !== held.name)
        .map((c) => {
          const naming = c.fields.filter((f) => isReferenceType(f.type) && f.collection === held.name);
          if (naming.length === 0) return c;
          const keys = new Set(naming.map((f) => f.key));
          return {
            ...c,
            fields: c.fields.map((f) => (keys.has(f.key) ? { key: f.key, label: f.label, type: 'text' as const } : f)),
            items: c.items.map((item) => {
              const values = { ...item.values };
              for (const field of naming) {
                const value = item.values[field.key];
                if (value !== undefined) values[field.key] = fieldText(field, value, { yes: 'true', no: 'false' }, undefined, lookup);
              }
              return { id: item.id, values };
            }),
          };
        });
      const { collections: _all, ...without } = document;
      void _all;
      const base: DocumentJson = rest.length === 0 ? without : { ...without, collections: rest };
      const ui = context.state.ui?.data?.collection === held.name ? { ...context.state.ui, data: { ...context.state.ui.data, collection: rest[0]?.name } } : context.state.ui;
      return {
        document: { ...base, pages: base.pages.map((page) => ({ ...page, tree: release(page.tree) })), ...(base.components === undefined ? {} : { components: base.components.map((c) => ({ ...c, tree: release(c.tree) })) }) },
        message: message('status.data.deleted', { name: held.name }),
        ui,
      };
    });
  });
}

// ---------------------------------------------------------------- fields

// data.addField (the form under the fields): a new field of the collection the Data panel shows, labelled as typed,
// its key made from its label.
export function addFieldCommand<Ui extends WithCollection>() {
  return registerHandler<'data.addField', Ui>('data.addField', (context, { label, type }) =>
    contentChange(context, (document) => {
      const held = shownCollection(document, context.state.ui);
      if (held === undefined) refuse('status.data.noCollection');
      if (label.trim() === '') refuse('status.data.fieldLabelEmpty', { collection: held.name });
      const next = addField(held, label, fieldType(type), defaultTarget(document, held.name));
      return { document: withCollection(document, held.name, next), message: message('status.data.fieldAdded', { collection: held.name, label: label.trim() }) };
    }),
  );
}

// The collection a new reference names until the person chooses another: the project's first other collection, else
// its own (an item naming another of its collection: a related post).
const defaultTarget = (document: DocumentJson, own: string): string => collectionsOf(document).find((c) => c.name !== own)?.name ?? own;

// The choices an option field's door hands, one per line or parted by commas.
const choicesOf = (typed: string): readonly string[] => typed.split(/[\n,;]/).map((choice) => choice.trim()).filter((choice) => choice !== '');

// data.setField: a field's label, type, decimal places, the collection a reference names (target), the choices of an
// option, the field a slug is made from. A field made a reference names the project's first other collection until the
// person chooses one.
export const setFieldCommand = registerHandler('data.setField', (context, { collection, field, label, type, decimals, target, options, from }) =>
  contentChange(context, (document) => {
    const held = named(document, collection);
    const now = held.fields.find((f) => f.key === field);
    const nextType = type === undefined ? now?.type : fieldType(type);
    const chosenTarget = typeof target === 'string' && target !== '' ? target : nextType !== undefined && isReferenceType(nextType) && now?.collection === undefined ? defaultTarget(document, held.name) : undefined;
    const change = {
      ...(typeof label === 'string' ? { label } : {}),
      ...(type === undefined ? {} : { type: fieldType(type) }),
      ...(decimals === undefined ? {} : { decimals }),
      ...(chosenTarget === undefined ? {} : { collection: chosenTarget }),
      ...(typeof options === 'string' ? { options: choicesOf(options) } : {}),
      ...(typeof from === 'string' ? { from } : {}),
    };
    const next = setField(held, field, change, lookupIn(document), document.language);
    const shown = next.fields.find((f) => f.key === field)?.label ?? field;
    return { document: withCollection(document, held.name, next), message: message('status.data.fieldChanged', { collection: held.name, label: shown }) };
  }),
);

// How many places use a field of a collection: the bindings of its lists' components and of its item pages, and the
// filters and orders of its lists.
// A binding uses a field when its path passes through it ("author.name" uses Posts' author and Authors' name); a
// nested list uses the field it follows. Each element is counted once.
function fieldUses(document: DocumentJson, collection: string, key: string): number {
  const lookup = lookupIn(document);
  const using = new Set<string>();
  let uses = 0;
  const visited = new Set<string>();
  // an element an item of `shown` fills, and what it holds
  const visit = (node: DocNode, shown: Collection | undefined) => {
    // an element of an instance is counted through its component's definition, once
    const usesKey = (bound: Bound): boolean => shown !== undefined && bound.field !== ITEM_PAGE && pathUses(lookup, shown, bound.field).some((use) => use.collection === collection && use.field === key);
    if (node.componentPart === undefined && !using.has(node.id) && (node.bind ?? []).some(usesKey)) using.add(node.id);
    const list = node.dataList;
    const own = list === undefined ? undefined : collectionNamed(document, list.collection);
    if (list !== undefined) {
      if (list.collection === collection) uses += [...(list.query.filters ?? []), ...(list.query.order ?? [])].filter((entry) => entry.field === key).length;
      if (list.via === key && shown?.name === collection) uses += 1;
      // the bindings of the list's component, once (a list with no item holds none of its instances)
      const definition = list.component === undefined ? undefined : document.components?.find((c) => c.name === list.component);
      if (definition !== undefined && !visited.has(definition.name)) {
        visited.add(definition.name);
        visit(definition.tree, own);
      }
    }
    for (const child of node.children) visit(child, list !== undefined && repeats(list, child) ? own : shown);
  };
  for (const page of document.pages) visit(page.tree, page.tree.dataItem === undefined ? undefined : collectionNamed(document, page.tree.dataItem.collection));
  return uses + using.size;
}

export const removeFieldCommand = registerHandler('data.removeField', (context, { collection, field }) =>
  contentChange(context, (document) => {
    const held = named(document, collection);
    const label = held.fields.find((f) => f.key === field)?.label ?? field;
    const uses = fieldUses(document, held.name, field);
    if (uses > 0) refuse('status.data.fieldInUse', { collection: held.name, label, count: { plural: 'data.places', count: uses } });
    return { document: withCollection(document, held.name, removeField(held, field)), message: message('status.data.fieldRemoved', { collection: held.name, label }) };
  }),
);

// ---------------------------------------------------------------- items

export const addItemCommand = registerHandler('data.addItem', (context, { collection }) =>
  contentChange(context, (document) => {
    const held = named(document, collection);
    const next = addItem(held, context.ids.next());
    return { document: withCollection(document, held.name, next), message: message('status.data.itemAdded', { collection: held.name, row: next.items.length }) };
  }),
);

export const setCellCommand = registerHandler('data.setCell', (context, { collection, item, field, value }) =>
  contentChange(context, (document) => {
    const held = named(document, collection);
    const next = setCell(held, item, field, value, document.language, lookupIn(document));
    const row = held.items.findIndex((one) => one.id === item) + 1;
    const label = held.fields.find((f) => f.key === field)?.label ?? field;
    return { document: withCollection(document, held.name, next), message: message('status.data.cellSet', { collection: held.name, row, column: label }) };
  }),
);

export const deleteItemsCommand = registerHandler('data.deleteItems', (context, { collection, items }) =>
  contentChange(context, (document) => {
    const held = named(document, collection);
    const ids = Array.isArray(items) ? items.filter((id): id is string => typeof id === 'string') : [];
    if (ids.length === 0) throw new Error('data.deleteItems: no item');
    return { document: withCollection(document, held.name, deleteItems(held, ids)), message: message('status.data.itemsDeleted', { collection: held.name, count: { plural: 'data.items', count: ids.length } }) };
  }),
);

export const moveItemCommand = registerHandler('data.moveItem', (context, { collection, item, to }) =>
  contentChange(context, (document) => {
    const held = named(document, collection);
    const next = moveItem(held, item, to);
    return { document: withCollection(document, held.name, next), message: message('status.data.itemMoved', { collection: held.name, row: next.items.findIndex((one) => one.id === item) + 1 }) };
  }),
);

// ---------------------------------------------------------------- bindings

// The node a binding is written on, and the same node of every instance of its component with the definition's: a
// binding in a repeated item is the component's, as a style is (componentHolders).
function bindingHolders(document: DocumentJson, id: NodeId): { readonly node: DocNode; readonly path: readonly (string | number)[] }[] {
  const holders = componentHolders(document, id);
  if (holders !== null) return holders;
  const found = locate(document, id);
  return found === null ? [] : [{ node: found.node, path: found.path }];
}

// data.bindElement: an element shows a field of its item in one of its parts (its text, an image's source or
// alternative text, a link's address, or the address of the item's own page); an empty field removes the binding of
// that part. Run by the field's menu in the Data panel and by a column dropped on an element there.
export const bindElementCommand = registerHandler('data.bindElement', (context, { node, field, to }): Outcome<never> => {
  const document = context.state.document;
  const found = locate(document, node);
  if (found === null) throw new Error(`data.bindElement: the document has no node ${node}`);
  const locked = lockRefusal(document, node, 'status.locked.edit');
  if (locked !== null) return { kind: 'refused', message: locked };
  const target = to as BindTarget;
  if (!targetsOf(found.node, context.rules).includes(target)) return { kind: 'refused', message: message('status.data.cannotShow', { name: found.node.name, target: { key: `data.target.${target}` as MessageId } }) };
  if (field === ITEM_PAGE && target !== 'link') return { kind: 'refused', message: message('status.data.cannotShow', { name: found.node.name, target: { key: `data.target.${target}` as MessageId } }) };
  // the same field keeps the format it is written in; another field starts plain
  const bound = (held: readonly Bound[] | undefined): readonly Bound[] => {
    const was = (held ?? []).find((b) => b.to === target);
    return [...(held ?? []).filter((b) => b.to !== target), ...(field === '' ? [] : [was?.field === field ? was : { field, to: target }])];
  };
  return rebound(context, node, bound, field === '' ? message('status.data.unbound', { name: found.node.name, target: { key: `data.target.${target}` as MessageId } }) : message('status.data.bound', { name: found.node.name, field: field === ITEM_PAGE ? { key: 'data.itemPage' } : field, target: { key: `data.target.${target}` as MessageId } }));
});

// The bindings of an element changed, on the element and on the same element of every instance of its component.
function rebound<Ui>(context: HandlerContext<Ui>, node: NodeId, change: (held: readonly Bound[] | undefined) => readonly Bound[], said: Message): Outcome<Ui> {
  return contentChange(context, (current) => {
    let working = current;
    for (const holder of bindingHolders(current, node)) {
      const next = change(holder.node.bind);
      const { bind: _old, ...plain } = holder.node;
      void _old;
      const value: DocNode = next.length === 0 ? plain : { ...plain, bind: next };
      working = replaceAt(working, holder.path, value);
    }
    return { document: working, message: said };
  });
}

// The element a binding command names, or the refusal of a locked one.
function boundElement(document: DocumentJson, node: NodeId): { readonly node: DocNode } | { readonly refused: Message } {
  const found = locate(document, node);
  if (found === null) throw new Error(`data: the document has no node ${node}`);
  const locked = lockRefusal(document, node, 'status.locked.edit');
  return locked === null ? { node: found.node } : { refused: locked };
}

// data.formatBinding: how a bound part writes its value (the format menu under its field): a number plain, grouped, as
// a currency (with the currency chosen, else the site's language's) or a percent; a date in a style; a yes/no in a
// pair of words. 'plain' (or an empty format) writes it as the field holds it.
export const formatBindingCommand = registerHandler('data.formatBinding', (context, { node, to, format, currency }): Outcome<never> => {
  const found = boundElement(context.state.document, node);
  if ('refused' in found) return { kind: 'refused', message: found.refused };
  const target = to as BindTarget;
  const held = (found.node.bind ?? []).find((b) => b.to === target);
  if (held === undefined) return { kind: 'refused', message: message('status.data.notBound', { name: found.node.name, target: { key: `data.target.${target}` as MessageId } }) };
  // (the manifest offers the formats and the currencies of the model: core/data/model.ts BIND_FORMATS, CURRENCIES)
  const chosen: BindFormat | undefined = format;
  const code: string | undefined = currency;
  const change = (bound: readonly Bound[] | undefined): readonly Bound[] =>
    (bound ?? []).map((b) => {
      if (b.to !== target) return b;
      const { format: _format, currency: _currency, ...plain } = b;
      void _format;
      void _currency;
      if (chosen === undefined || chosen === 'plain') return plain;
      return { ...plain, format: chosen, ...(chosen === 'currency' && (code ?? b.currency) !== undefined ? { currency: code ?? b.currency } : {}) };
    });
  return rebound(context, node, change, message('status.data.formatted', { name: found.node.name, format: { key: `data.format.${chosen ?? 'plain'}` as MessageId } }));
});

// data.showWhen: the element shows only while a field of its item is set, empty, equal to a value or not (the show
// row of Connect fields); an empty field shows it always again. Works wherever an item fills the element: a list's
// repeated item, a nested list's, a page made for an item.
export const showWhenCommand = registerHandler('data.showWhen', (context, { node, field, when, value }): Outcome<never> => {
  const found = boundElement(context.state.document, node);
  if ('refused' in found) return { kind: 'refused', message: found.refused };
  const asked: ShowWhen = typeof when === 'string' && (SHOW_WHEN as readonly string[]).includes(when) ? (when as ShowWhen) : 'filled';
  const compared = asked === 'eq' || asked === 'neq' ? (typeof value === 'string' ? value.trim() : '') : undefined;
  const change = (bound: readonly Bound[] | undefined): readonly Bound[] => [...(bound ?? []).filter((b) => b.to !== SHOW), ...(field === '' ? [] : [{ field, to: SHOW, when: asked, ...(compared === undefined ? {} : { value: compared }) } satisfies Bound])];
  // the field as a person reads it ("Author › Name"), where an item fills the element; its key elsewhere
  const shown = enclosingCollection(context.state.document, node);
  const label = (shown === undefined ? undefined : bindablePaths(lookupIn(context.state.document), shown).find((one) => one.path === field)?.label) ?? field;
  return rebound(context, node, change, field === '' ? message('status.data.showAlways', { name: found.node.name }) : compared === undefined ? message('status.data.showWhenSet', { name: found.node.name, field: label, when: { key: `data.when.${asked}` as MessageId } }) : message('status.data.showWhenValue', { name: found.node.name, field: label, when: { key: `data.when.${asked}` as MessageId }, value: compared }));
});

// A document with the node at a path (pages/…/tree/children/… or components/…/tree/…) replaced.
function replaceAt(document: DocumentJson, path: readonly (string | number)[], value: DocNode): DocumentJson {
  const put = (at: unknown, rest: readonly (string | number)[]): unknown => {
    if (rest.length === 0) return value;
    const [key, ...more] = rest as [string | number, ...(string | number)[]];
    if (Array.isArray(at)) return at.map((item, i) => (i === key ? put(item, more) : item));
    const record = at as Record<string, unknown>;
    return { ...record, [key]: put(record[key], more) };
  };
  return put(document, path) as DocumentJson;
}

// data.fill (the Data panel's labelled Fill button): the selected element repeats the items of a collection, as many as
// its query shows, inside its parent, each showing its item through the bindings it carries. An element that is not
// an instance yet becomes a component (named after it), its first item; its parent becomes the bound list, which
// follows the collection from now on (derive.ts). Refused, naming what is at fault: an element with no binding, a
// binding to a field the collection does not have, an image no project file answers to, a locked element.
export const fillCommand = registerHandler('data.fill', (context, { node, collection, query, via }): Outcome<never> =>
  contentChange(context, (document, data) => {
    const held = named(document, collection);
    const asked = queryOf(query);
    const refusedQuery = queryRefusal(held, asked);
    if (refusedQuery !== null) throw new DataRefusal(refusedQuery);
    const found = locate(document, node);
    if (found === null) throw new Error(`data.fill: the document has no node ${node}`);
    if (found.parent === null) refuse('status.data.fillRoot', { name: found.node.name });
    const parent = found.parent;
    for (const id of [parent.id, found.node.id]) {
      const locked = lockRefusal(document, id as NodeId, 'status.locked.edit');
      if (locked !== null) throw new DataRefusal(locked);
    }
    if (typeof via === 'string' && via !== '') return nestedFill(document, found.node, parent, held, via, asked);
    // an element that is not an instance becomes one: what components.create refuses (an element inside an instance,
    // one that holds an instance, a locked one) is refused here too
    if (found.node.component === undefined) {
      const refused = createRefusal(document, found.node.id as NodeId);
      if (refused !== null) throw new DataRefusal(refused);
    }
    let working = document;
    let definition: ComponentDefinition | undefined = found.node.component === undefined ? undefined : document.components?.find((c) => c.name === found.node.component);
    if (definition === undefined) {
      // the element becomes a component, named after it, and the list's first item, as components.repeat makes one
      const name = componentName(document, found.node.name);
      const plain = copied(found.node, () => data.ids.next() as NodeId, null);
      const tree = refreshCopiedIdentities(document, [{ source: found.node, copy: plain }], false)[0];
      if (tree === undefined) throw new Error('data.fill: the definition copy is missing');
      definition = { name, tree };
      working = { ...working, components: [...(working.components ?? []), definition], pages: working.pages };
      working = replaceAt(working, found.path, marked(found.node, [], name));
    }
    const bound = boundIn(definition.tree).flatMap((n) => n.bind ?? []);
    if (bound.length === 0) refuse('status.data.noBindings', { name: found.node.name });
    const unknown = bound.find((b) => b.field !== ITEM_PAGE && pathField(lookupIn(document), held, b.field) === undefined);
    if (unknown !== undefined) refuse('status.data.unknownField', { collection: held.name, field: unknown.field });
    const other = parent.dataList;
    if (other !== undefined && (other.via !== undefined || other.component !== definition.name)) refuse('status.data.otherList', { name: parent.name, collection: other.collection });
    const list = { collection: held.name, component: definition.name, query: asked };
    const parentAt = locate(working, parent.id as NodeId);
    if (parentAt === null) throw new Error('data.fill: the parent is missing');
    working = replaceAt(working, parentAt.path, { ...parentAt.node, dataList: list });
    const count = queryItems(held, asked).length;
    return { document: working, message: message('status.data.listFilled', { name: definition.name, collection: held.name, count: { plural: 'data.items', count } }), selection: [found.node.id as NodeId] };
  }),
);

// The collection whose item fills an element: the collection of the bound list one of whose repeated items holds it
// (the nearest), else of the page made for an item it stands in; undefined outside any.
export function enclosingCollection(document: DocumentJson, id: NodeId): Collection | undefined {
  const chain = lineage(document, id);
  let shown: Collection | undefined;
  const root = chain[0];
  if (root?.dataItem !== undefined) shown = collectionNamed(document, root.dataItem.collection);
  chain.forEach((node, i) => {
    const next = chain[i + 1];
    if (node.dataList !== undefined && next !== undefined && repeats(node.dataList, next)) shown = collectionNamed(document, node.dataList.collection);
  });
  return shown;
}

// data.fill with a field (via): a nested list — the selected element repeats, inside its container, the items of the
// collection that a multireference field of the item it stands in names (a post card listing its categories). The
// container holds the element alone (every child of a nested list is one of its items); the list is the same in the
// component's definition and in every instance of it, each instance showing its own item's.
function nestedFill(document: DocumentJson, node: DocNode, parent: DocNode, held: Collection, via: string, query: Query): { readonly document: DocumentJson; readonly message: Message; readonly selection: readonly NodeId[] } {
  const outer = enclosingCollection(document, parent.id as NodeId);
  const field = outer?.fields.find((f) => f.key === via);
  if (outer === undefined || field === undefined || field.type !== 'multireference' || field.collection !== held.name) refuse('status.data.viaField', { field: via, collection: held.name });
  const other = parent.dataList;
  if (other !== undefined && other.via !== via) refuse('status.data.otherList', { name: parent.name, collection: other.collection });
  if (other === undefined && parent.children.length !== 1) refuse('status.data.nestedAlone', { name: node.name, parent: parent.name });
  // the element may show nothing yet: its parts are connected to the nested collection's fields once it repeats it
  const bound = boundIn(node).flatMap((n) => n.bind ?? []);
  const unknown = bound.find((b) => b.field !== ITEM_PAGE && pathField(lookupIn(document), held, b.field) === undefined);
  if (unknown !== undefined) refuse('status.data.unknownField', { collection: held.name, field: unknown.field });
  const list = { collection: held.name, via, query };
  let working = document;
  for (const holder of bindingHolders(document, parent.id as NodeId)) working = replaceAt(working, holder.path, { ...holder.node, dataList: list });
  return { document: working, message: message('status.data.nestedFilled', { name: node.name, collection: held.name, field: field.label }), selection: [node.id as NodeId] };
}

// data.unbind: a bound list stops following its collection; its items stay, ordinary instances of the component.
export const unbindCommand = registerHandler('data.unbind', (context, { node }): Outcome<never> =>
  contentChange(context, (document) => {
    const found = locate(document, node);
    if (found === null) throw new Error(`data.unbind: the document has no node ${node}`);
    // the list element itself, or one of its repeated items
    const listAt = found.node.dataList !== undefined ? found : found.parent?.dataList !== undefined ? locate(document, found.parent.id as NodeId) : null;
    if (listAt === null || listAt.node.dataList === undefined) refuse('status.data.notList', { name: found.node.name });
    const locked = lockRefusal(document, listAt.node.id as NodeId, 'status.locked.edit');
    if (locked !== null) throw new DataRefusal(locked);
    const { dataList } = listAt.node;
    // a nested list is its component's: it stops following on every instance at once
    const holders = dataList.via === undefined ? [{ node: listAt.node, path: listAt.path }] : bindingHolders(document, listAt.node.id as NodeId);
    let working = document;
    for (const holder of holders) {
      const { dataList: _list, ...plain } = holder.node;
      void _list;
      // its items show as they are (a nested list's first item, hidden while it showed none, shows again)
      const children = plain.children.map((child) => {
        const { dataHidden: _hidden, ...shown } = child;
        void _hidden;
        return child.dataHidden === true ? shown : child;
      });
      working = replaceAt(working, holder.path, { ...plain, children });
    }
    return { document: working, message: message('status.data.listUnbound', { name: listAt.node.name, collection: dataList.collection }) };
  }),
);

// ---------------------------------------------------------------- pages from a page

const withPageAfter = (document: DocumentJson, after: number, made: readonly Page[]): DocumentJson => ({ ...document, pages: [...document.pages.slice(0, after + 1), ...made, ...document.pages.slice(after + 1)] });

// Every navigation of the site that links to its pages (a nav holding a link whose address is a page's file) takes a
// link to each page made, at its end, made as its last page link is: pages made from names went into no menu, and the
// person added a link to each on every page by hand.
function linkedInNavigations(document: DocumentJson, made: readonly Page[], nextId: () => NodeId): DocumentJson {
  const files = new Set(document.pages.filter((page) => !made.includes(page) && page.tree.dataItem?.template !== true).map((page) => page.file));
  const taken = new Set(document.pages.flatMap((page) => [...walk(page.tree)].map((node) => node.name)));
  const named = (base: string): string => {
    let name = base;
    for (let n = 2; taken.has(name); n += 1) name = `${base} ${String(n)}`;
    taken.add(name);
    return name;
  };
  const visit = (node: DocNode): DocNode => {
    const children = node.children.map(visit);
    const pageLinks = node.tag === 'nav' ? children.filter((child) => typeof child.attributes.href === 'string' && files.has(child.attributes.href)) : [];
    const model = pageLinks.at(-1);
    if (model === undefined) return children.every((child, i) => child === node.children[i]) ? node : { ...node, children };
    const added = made.map((page): DocNode => {
      const { inline: _inline, ...plain } = model;
      void _inline;
      return { ...plain, id: nextId(), name: named(page.name), text: page.name, attributes: { ...model.attributes, href: page.file }, children: [] };
    });
    return { ...node, children: [...children, ...added] };
  };
  return { ...document, pages: document.pages.map((page) => ({ ...page, tree: visit(page.tree) })) };
}

// pages.fromNames: one page per name (one per line), each a copy of the open page, named and filed as a duplicate is;
// the first opens. Pages made later receive the shared regions that ask for it.
export function pagesFromNamesCommand<Ui extends WithPage>() {
  return registerHandler<'pages.fromNames', Ui>('pages.fromNames', (context, { names }) =>
    contentChange(context, (document, data) => {
      const at = openedPage(context.state);
      const source = document.pages[at] as Page;
      const wanted = names.split(/\r?\n/).map((name) => name.trim()).filter((name) => name !== '');
      if (wanted.length === 0) refuse('status.pages.noNames', { name: source.name });
      const made: Page[] = [];
      for (const name of wanted) made.push(copyPage(withPageAfter(document, at, made), source, name, () => data.ids.next() as NodeId));
      const first = made[0] as Page;
      // a captured page's copies take its residual stylesheet too (files.ts copiedCaptureSheet, the audit's CP1)
      const sheets = made.flatMap((page) => copiedCaptureSheet(document, source, page) ?? []);
      const withPages = linkedInNavigations(withPageAfter(document, at, made), made, () => data.ids.next() as NodeId);
      return {
        document: sheets.length === 0 ? withPages : { ...withPages, files: [...(withPages.files ?? []), ...sheets] },
        message: message('status.pages.madeFromNames', { name: source.name, count: { plural: 'data.pages', count: made.length } }),
        ui: { ...context.state.ui, page: first.id },
        selection: [],
      };
    }),
  );
}

// The page open is not the site's start page (index.html, else the first): the one page that writes its own file and
// is never a template. The Data panel offered "Make Home the template of Products" on Home and refused it once pressed.
const startPageIndex = (document: DocumentJson): number => {
  const home = document.pages.findIndex((page) => page.file === HOME_FILE);
  return home < 0 ? 0 : home;
};
// nor is the collection's template another page already (Contact offered it while About was the Products template)
const otherTemplate = (state: { readonly document: DocumentJson }, page: number, args: unknown): Page | undefined => {
  const collection = (args as { readonly collection?: unknown } | undefined)?.collection;
  const held = typeof collection === 'string' ? templateOf(state.document, collection) : undefined;
  return held !== undefined && held.id !== state.document.pages[page]?.id ? held : undefined;
};
export const openPageNotHome = registerPredicate(
  'openPageNotHome',
  (state, _rules, args) => openedPage(state) !== startPageIndex(state.document) && otherTemplate(state, openedPage(state), args) === undefined,
  (state, _rules, args) => {
    // the start page's own reason first: it holds whatever the collection's template is
    if (openedPage(state) === startPageIndex(state.document)) return message('status.data.templateIsHome', { name: state.document.pages[openedPage(state)]?.name ?? '' });
    const other = otherTemplate(state, openedPage(state), args);
    if (other !== undefined && other.tree.dataItem !== undefined) return message('status.data.templateExists', { collection: other.tree.dataItem.collection, name: other.name });
    return message('status.data.templateIsHome', { name: state.document.pages[openedPage(state)]?.name ?? '' });
  },
);

// pages.fromCollection: the open page becomes the template of a collection's item pages (spec content-data, "one page
// per item"): one page, which the export writes once per item — in the folder of the collection, at the item's slug
// (its slug field, else the words of the field named here) — and which the editor shows with the item chosen
// (pages.previewItem), its collection's first to begin with. Its bindings show that item, and links bound to an
// item's page lead to the item's file. A layout change of the template reaches every item page. Pages copied for
// items before templates existed keep working as they were (DEC: both kinds of item page are read).
export function pagesFromCollectionCommand<Ui extends WithPage>() {
  return registerHandler<'pages.fromCollection', Ui>('pages.fromCollection', (context, { collection, nameField }) =>
    contentChange(context, (document) => {
      const at = openedPage(context.state);
      const source = document.pages[at] as Page;
      const held = named(document, collection);
      if (source.tree.dataItem !== undefined && source.tree.dataItem.template !== true) refuse('status.data.templateIsItemPage', { name: source.name });
      // the site's start page (index.html, else the first page: where the site opens) writes its own file, never one
      // per item: made a template, the site would have no home page (the review's R-3)
      if (at === startPageIndex(document)) refuse('status.data.templateIsHome', { name: source.name });
      const field = held.fields.find((f) => f.key === nameField);
      if (field === undefined) refuse('status.stale');
      const other = templateOf(document, held.name);
      if (other !== undefined && other.id !== source.id) refuse('status.data.templateExists', { collection: held.name, name: other.name });
      const first = held.items[0];
      const shownBefore = source.tree.dataItem?.collection === held.name ? source.tree.dataItem.item : undefined;
      const item = shownBefore ?? first?.id;
      const mark = { collection: held.name, template: true as const, field: field.key, ...(item === undefined ? {} : { item }) };
      return {
        document: { ...document, pages: document.pages.map((page, i) => (i === at ? { ...page, tree: { ...page.tree, dataItem: mark } } : page)) },
        message: message('status.pages.templateMade', { name: source.name, collection: held.name, count: { plural: 'data.pages', count: held.items.length } }),
      };
    }),
  );
}

// pages.previewItem: the item a template page shows in the editor (the menu of the Pages section): its bindings show
// that item's values, as the export writes that item's page.
export function previewItemCommand<Ui extends WithPage>() {
  return registerHandler<'pages.previewItem', Ui>('pages.previewItem', (context, { item }) =>
    contentChange(context, (document) => {
      const at = openedPage(context.state);
      const page = document.pages[at] as Page;
      const mark = page.tree.dataItem;
      if (mark?.template !== true) refuse('status.data.notTemplate', { name: page.name });
      const held = named(document, mark.collection);
      const index = held.items.findIndex((one) => one.id === item);
      const chosen = held.items[index];
      if (chosen === undefined) refuse('status.stale');
      return {
        document: { ...document, pages: document.pages.map((one, i) => (i === at ? { ...one, tree: { ...one.tree, dataItem: { ...mark, item: chosen.id } } } : one)) },
        message: message('status.pages.previewingItem', { name: page.name, item: itemTitle(held, chosen, document.language), row: index + 1 }),
      };
    }),
  );
}

// ---------------------------------------------------------------- shared regions

const pagesList = (value: unknown): readonly string[] => (Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string') : []);

// regions.share (the Shared form of the Data panel): the selected element, directly inside its page's root, is shown
// on the pages chosen (their files) and, with "new" among them, on every page made later.
export const shareRegionCommand = registerHandler('regions.share', (context, { pages }): Outcome<never> =>
  contentChange(context, (document, data) => {
    const node = context.state.selection[0];
    if (node === undefined || context.state.selection.length !== 1) refuse('status.needsSingleSelection');
    const shared = shareRegion(document, node, pagesList(pages), data);
    return { document: shared.document, message: message('status.regions.shared', { name: shared.name, count: { plural: 'data.pages', count: shared.count } }) };
  }),
);

export const detachRegionCommand = registerHandler('regions.detach', (context, { node }): Outcome<never> =>
  contentChange(context, (document) => {
    const page = document.pages.find((p) => [...walk(p.tree)].some((n) => n.id === node));
    const detached = detachRegion(document, node);
    return { document: detached.document, message: message('status.regions.detached', { name: detached.name, page: page?.name ?? '' }) };
  }),
);

export const stopSharingCommand = registerHandler('regions.stopSharing', (context, { component }): Outcome<never> =>
  contentChange(context, (document) => ({ document: stopSharing(document, component), message: message('status.regions.stopped', { name: component }) })),
);
