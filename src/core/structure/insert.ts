// element.insert: a new element of a palette entry, placed where the arguments say
// or, without them, where the selection says (spec palette-click-insert, "Hit zones"): with nothing selected, the last
// child of the shown page's root; with a container selected, its last child; with a leaf selected, right after it in
// its parent. The placement follows the content model (src/core/elements/content-model.ts): a parent that does not
// accept the element refuses it and nothing changes, never wrapped in another element (spec, Problems 1 and 2), and so
// does a Link Block, or an element inside one, for an interactive element (spec elements-structure, Problems 5); so
// does a locked parent or one inside a locked element (spec lock-element). The
// new element is named by its type in the person's language, with a number when a node already has that name, holds
// its default text and styles (elements.json), and becomes the selection.
import type { NodeId } from '../../generated/commands.ts';
import type { ElementType, MessageId } from '../../generated/ids.ts';
import type { TemplateNode } from '../../manifest/schema.ts';
import type { WrapperId } from '../document/validate.ts';
import { message, registerHandler, registerPredicate, type HandlerContext, type Message, type Outcome } from '../commands/registry.ts';
import { pageLanguage } from '../export/names.ts';
import { allNodes, locate, walk, type DocNode, type DocumentJson, type Location, type Selection, type Styles } from '../document/model.ts';
import { releaseReferencesPatch } from '../document/tree.ts';
import type { ModelRules } from '../document/validate.ts';
import { placementRefusal } from '../elements/content-model.ts';
import { lockRefusal } from '../nodes/flags.ts';
import { pageShown } from '../project/pages.ts';
import { startingParts } from '../elements/table.ts';
import { COLUMNS_PROPERTY, tracksForChildren } from '../style/tracks.ts';
import { registerReferenceKind } from '../store/references.ts';
import { newElement, nodeMaker, type NodeMaker } from './node-maker.ts';

// A name no node of the document has: the base itself, else the base followed by the first free number from 2.
export function uniqueName(document: DocumentJson, base: string): string {
  const taken = new Set<string>();
  for (const node of allNodes(document)) taken.add(node.name);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

// The tree a template inserts (elements.json palette entries of kind "template"; features templates-layout,
// templates-content, templates-sections, templates-components): each node a new element of its type, then given the
// template's tag, name and text (catalogue keys, in the person's language), the styles of its wrapper (the wrap
// commands' Row, Column, Container and Grid, so a template's layout is the wrap commands' layout) and its own, its
// attributes, and its children (when the template names none, the parts a new element of its type starts with: a
// table's head and body, else its natural children). The root is named by the template's label. A wrapper that lays
// one equal track per child (the grid) writes grid-template-columns for the children it holds, with its breakpoint
// overrides (the same rule the wrap command writes: tracksForChildren, the user's real-use audit item A1.4).
function templateElement(make: NodeMaker, spec: TemplateNode, rootNameKey?: MessageId): DocNode {
  const { rules } = make;
  const nameKey = (spec.nameKey as MessageId | undefined) ?? rootNameKey;
  const base = newElement(make, spec.element, spec.children === undefined ? startingParts(spec.element) : (m) => (spec.children ?? []).map((child) => templateElement(m, child)), nameKey);
  const wrapper = spec.wrapper === undefined ? undefined : rules.wrappers.get(spec.wrapper as WrapperId);
  const perChild = wrapper?.perChildTracks === true ? tracksForChildren(base.children.length, rules) : null;
  const styles = { ...(rules.elements.get(spec.element as ElementType)?.defaultStyles ?? {}), ...(wrapper?.styles ?? {}), ...(spec.styles ?? {}), ...(perChild === null ? {} : { [perChild.property]: perChild.columns }) };
  const layer = (held: Readonly<Record<string, unknown>>): Record<string, Readonly<Record<string, unknown>>> => ({ [rules.baseLayer.state]: held });
  const all = {
    ...(Object.keys(styles).length > 0 ? { [rules.baseLayer.breakpoint]: layer(styles) } : {}),
    ...Object.fromEntries(Object.entries(perChild?.layers ?? {}).map(([breakpoint, columns]) => [breakpoint, layer({ [perChild?.property ?? '']: columns })])),
  } as Styles;
  return {
    ...base,
    tag: spec.tag ?? base.tag,
    text: spec.textKey === undefined ? base.text : make.pageWords(spec.textKey as MessageId),
    styles: all,
    attributes: { ...base.attributes, ...(spec.attributes ?? {}), ...Object.fromEntries(Object.entries(spec.attributeKeys ?? {}).map(([name, key]) => [name, make.pageWords(key as MessageId)])) } as DocNode['attributes'],
    ...(spec.customAttributes === undefined && spec.customDaysAhead === undefined ? {} : { customAttributes: { ...spec.customAttributes, ...daysAhead(make, spec.customDaysAhead ?? {}) } }),
  };
}

// A template's dated attributes (customDaysAhead): each the moment that many days after the element is placed, as
// ISO 8601 in UTC (what a page's script reads with Date). A maker without a moment (one that only names nodes) is a
// defect of its caller: the date would be the epoch's.
const DAY_MS = 86_400_000;
function daysAhead(make: NodeMaker, days: Readonly<Record<string, number>>): Record<string, string> {
  const entries = Object.entries(days);
  if (entries.length === 0) return {};
  if (make.now === undefined) throw new Error('a template with a dated attribute is placed by a node maker without the moment (nodeMaker now)');
  const now = make.now;
  return Object.fromEntries(entries.map(([name, count]) => [name, new Date(now + count * DAY_MS).toISOString()]));
}

// element.createNaturalChild (feature natural-child-command): a new natural child inside the one selected element
// (elements.json naturalChild), where HTML's permitted order puts it (after the children that come before it or with
// it, so the last of its kind): the first of its natural children that the element may hold only once and lacks (a
// figure's caption), else the first it may hold many of (a list's item, a table body's row); refused when it has none
// (status.naturalChild.none) or holds every one it may hold once and no other (status.naturalChild.present: a details'
// summary). One undo step; the new child becomes the selection; a locked element refuses. The context menu's label
// names the tag it creates ("Create <li> inside").
function naturalChildToCreate(state: { readonly document: DocumentJson; readonly selection: Selection }, rules: ModelRules): { readonly at: Location; readonly type: string | null } | null {
  const [only, ...others] = state.selection;
  if (only === undefined || others.length > 0) return null;
  const at = locate(state.document, only);
  const natural = at === null ? [] : (rules.elements.get(at.node.type)?.naturalChildren ?? []);
  if (at === null || natural.length === 0) return null;
  const tagOf = (type: string) => rules.elements.get(type as ElementType)?.tags[0] ?? '';
  const holds = (type: string) => at.node.children.some((child) => child.type === type);
  const once = natural.filter((type) => rules.contentModel.unique(at.node.tag ?? '', tagOf(type)));
  const missing = once.find((type) => !holds(type));
  const many = natural.find((type) => !once.includes(type));
  return { at, type: missing ?? many ?? null };
}

// why the selected element takes no new natural child: it has none, or it holds each of them it may hold once
function naturalRefusal(state: { readonly document: DocumentJson; readonly selection: Selection }, rules: ModelRules): Message {
  const [only] = state.selection;
  const at = only === undefined ? null : locate(state.document, only);
  const natural = at === null ? [] : (rules.elements.get(at.node.type)?.naturalChildren ?? []);
  if (at === null || natural.length === 0) return message('status.naturalChild.none', { name: at?.node.name ?? '' });
  const first = rules.elements.get(natural[0] as ElementType)?.tags[0] ?? '';
  return message('status.naturalChild.present', { parent: at.node.name, child: `<${first}>` });
}

export const hasNaturalChild = registerPredicate(
  'hasNaturalChild',
  (state, rules) => naturalChildToCreate(state, rules)?.type != null,
  (state, rules) => naturalRefusal(state, rules),
);

export const createNaturalChildCommand = registerHandler(
  'element.createNaturalChild',
  ({ state, rules, ids, words }): Outcome<never> => {
    const found = naturalChildToCreate(state, rules);
    if (found === null || found.type === null) return { kind: 'refused', message: naturalRefusal(state, rules) };
    const { at, type } = found;
    const locked = lockRefusal(state.document, at.node.id, 'status.locked.insert');
    if (locked !== null) return { kind: 'refused', message: locked };
    const node = newElement(nodeMaker(state.document, rules, ids, words), type);
    const index = rules.contentModel.slotIn(at.node.tag ?? '', at.node.children.map((c) => c.tag ?? ''), node.tag ?? '');
    return {
      kind: 'change',
      patches: [{ op: 'add', path: [...at.path, 'children', index], value: node }],
      selection: [node.id],
      message: message('status.placed', { element: node.name, parent: at.node.name, position: index + 1, count: at.node.children.length + 1 }),
    };
  },
);
createNaturalChildCommand.labelParams = (state, rules) => {
  const type = naturalChildToCreate(state, rules)?.type;
  const tag = type == null ? '' : (rules.elements.get(type as ElementType)?.tags[0] ?? '');
  return { tag: tag === '' ? '' : `<${tag}>` };
};

// Whether a new element is of a selected element's own kind, so it goes beside it rather than inside: the same type,
// other than a plain container (a container clicked in a container is a nested one, the layouts' way)
const PLAIN_CONTAINER = 'div';
const sameKind = (selected: DocNode, incoming: DocNode): boolean => selected.type === incoming.type && incoming.type !== PLAIN_CONTAINER;

// Where the new element goes: the parent and the index among its children; null when the parent given is no node.
// With nothing selected the element goes at the end of the root of the page the editor shows (openedPage, its one
// owner), never of the project's first page: an insert with another page open lands on that page; a page that ends
// with its footer takes it right before that footer (pageEnd). A page block coming
// in (`incoming`: a section, a header, a footer; elements.json pageBlock) lands right after the page block that is or
// holds the selection, so a page is built by clicking its blocks in order (spec palette-click-insert, Problems 4).
export function placement(
  state: { readonly document: DocumentJson; readonly ui?: unknown },
  selection: Selection,
  rules: ModelRules,
  parent: NodeId | undefined,
  index: number | undefined,
  incoming?: DocNode
): { readonly parent: Location; readonly index: number } | null {
  const document = state.document;
  const root = pageShown(state)?.tree ?? null;
  if (parent !== undefined) {
    const at = locate(document, parent);
    if (!at) return null;
    const count = at.node.children.length;
    return { parent: at, index: index === undefined ? count : Math.max(0, Math.min(index, count)) };
  }
  const primary = selection[0] === undefined ? null : locate(document, selection[0]);
  const isBlock = (node: DocNode): boolean => rules.elements.get(node.type)?.pageBlock === true;
  if (primary && incoming !== undefined && isBlock(incoming)) {
    let at: Location | null = primary;
    while (at !== null && !isBlock(at.node)) at = at.parent === null ? null : locate(document, at.parent.id);
    const up = at?.parent ? locate(document, at.parent.id) : null;
    if (at && up) return { parent: up, index: at.index + 1 };
  }
  // an element of the selected one's own kind, other than a plain container, lands right after it, as its sibling: a
  // card clicked while a card is selected is the next card, never one inside it (the audit of 2026-10-05: Card clicked
  // three times nested each card in the one before)
  if (primary?.parent && incoming !== undefined && sameKind(primary.node, incoming)) {
    const up = locate(document, primary.parent.id);
    if (up) return { parent: up, index: primary.index + 1 };
  }
  if (primary && rules.elements.get(primary.node.type)?.content === 'children') {
    // a selected container that does not take the new element (a list takes only its items) is followed by it, as a
    // leaf is, where its parent takes it: a table clicked with a list selected was refused, "<ul> only accepts <li>"
    // (DEF-0601); a saved component is placed by this same rule (components.insertInstance, USE-7)
    const up = incoming !== undefined && primary.parent ? locate(document, primary.parent.id) : null;
    if (up && incoming !== undefined && placementRefusal(document, rules, primary.node.id, [incoming]) !== null && placementRefusal(document, rules, up.node.id, [incoming]) === null) {
      return { parent: up, index: primary.index + 1 };
    }
    // the page root selected takes the element at the page's end, as with nothing selected (pageEnd)
    return { parent: primary, index: primary.parent === null ? pageEnd(primary.node, rules, incoming) : primary.node.children.length };
  }
  if (primary?.parent) {
    const up = locate(document, primary.parent.id);
    // a leaf whose parent does not take the new element (a select's option, a list's item) is followed by it after the
    // nearest ancestor whose parent takes it: a select clicked with an option selected was refused, "<select> only
    // accepts <option>…", and the person had to find the select's parent first
    if (up && incoming !== undefined && placementRefusal(document, rules, up.node.id, [incoming]) !== null) {
      for (let child: Location = up, above = up.parent ? locate(document, up.parent.id) : null; above !== null; child = above, above = above.parent ? locate(document, above.parent.id) : null) {
        if (placementRefusal(document, rules, above.node.id, [incoming]) === null) return { parent: above, index: child.index + 1 };
      }
    }
    if (up) return { parent: up, index: primary.index + 1 };
  }
  const at = root === null ? null : locate(document, root.id);
  return at === null ? null : { parent: at, index: pageEnd(at.node, rules, incoming) };
}

// Whether an element is a page's footer landmark: a <footer>, or an element given the footer's role (contentinfo)
const isFooter = (node: DocNode): boolean => node.tag === 'footer' || node.customAttributes?.role === 'contentinfo';

// Whether an element is out of the page's flow (its base style positions it fixed or absolute: a floating WhatsApp
// button, a cookie notice), so it does not take a place at the page's end
function outOfFlow(node: DocNode, rules: ModelRules): boolean {
  const base = (node.styles as Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, unknown>>>>>>)[rules.baseLayer.breakpoint]?.[rules.baseLayer.state];
  return base?.position === 'fixed' || base?.position === 'absolute';
}

// Where the page's end is for a new element (the real-use audit's V-8, decided by the owner: a ready section inserted
// with nothing selected landed below the footer, and the published page showed the footer above it): right before the
// footer that closes the page (the root's last child that is a footer landmark, only out-of-flow elements after it),
// else after the root's last child. A footer coming in goes at the very end, after the page's own footer.
function pageEnd(root: DocNode, rules: ModelRules, incoming: DocNode | undefined): number {
  const count = root.children.length;
  if (incoming !== undefined && isFooter(incoming)) return count;
  for (let i = count - 1; i >= 0; i -= 1) {
    const child = root.children[i] as DocNode;
    if (isFooter(child)) return i;
    if (!outOfFlow(child, rules)) return count;
  }
  return count;
}

// Where element.insert puts a new node (the one rule every door that inserts a palette entry follows, and the Insert
// panel's line that says where a click lands, G3): `placement`, then, placed at a grid's end or beside an element of
// its kind in a grid with no place asked for, the grid's first empty cell, which the node takes (`cell`, emptyCell).
export function insertLanding(
  state: { readonly document: DocumentJson; readonly selection: Selection; readonly ui?: unknown },
  rules: ModelRules,
  node: DocNode,
  parent: NodeId | undefined,
  index: number | undefined
): { readonly parent: Location; readonly index: number; readonly cell: boolean } | null {
  const at = placement(state, state.selection, rules, parent, index, node);
  if (at === null) return null;
  const receiver = at.parent.node;
  const selected = state.selection[0] === undefined ? null : locate(state.document, state.selection[0]);
  const beside = parent === undefined && selected !== null && selected.parent?.id === receiver.id && sameKind(selected.node, node);
  const cell = index === undefined && (at.index === receiver.children.length || beside) ? emptyCell(receiver, rules) : -1;
  return cell >= 0 ? { parent: at.parent, index: cell, cell: true } : { parent: at.parent, index: at.index, cell: false };
}

// The new node of a palette entry (elements.json palette): a template's tree, else a new element of the entry's type
// with the parts it starts with; an input tile's node takes its kind of input (the attribute inputType, written type).
export function paletteNode(make: NodeMaker, entry: string): DocNode {
  const item = make.rules.palette.get(entry);
  // every door offers an entry of the palette, so an unknown one is a defect of the door
  if (item === undefined || make.rules.elements.get(item.element) === undefined) throw new Error(`the palette has no entry ${entry}`);
  const made = item.template === null ? newElement(make, item.element, startingParts(item.element)) : withFreeHtmlIds(templateElement(make, item.template, item.labelKey), make.htmlIds);
  if (item.inputType === null) return made;
  // a field placed says what it takes, in the page's language (an empty box asked nothing: the real-use pass of
  // 2026-10-22, an Email field placed was a blank white box)
  const hint = INPUT_PLACEHOLDERS[item.inputType];
  return { ...made, attributes: { ...made.attributes, inputType: item.inputType, ...(hint === undefined ? {} : { placeholder: make.pageWords(hint) }) } };
}

// the placeholder a new field of a kind starts with (the kinds a visitor types into)
const INPUT_PLACEHOLDERS: Readonly<Record<string, MessageId>> = {
  text: 'input.placeholder.text',
  email: 'input.placeholder.email',
  password: 'input.placeholder.password',
  number: 'input.placeholder.number',
  tel: 'input.placeholder.tel',
  url: 'input.placeholder.url',
  search: 'input.placeholder.search',
};

// A template's HTML ids, each renamed off the ids the document already holds ("features" → "features-2"), and its
// links to them ("#features") following: a template placed twice (the Full landing page) never makes two elements
// of one id, and its menu still goes to its own sections.
function withFreeHtmlIds(tree: DocNode, occupied: ReadonlySet<string>): DocNode {
  const renamed = new Map<string, string>();
  const taken = new Set(occupied);
  for (const node of walk(tree)) {
    const id = node.attributes.id;
    if (typeof id !== 'string' || !taken.has(id)) continue;
    let free = `${id}-2`;
    for (let n = 3; taken.has(free); n += 1) free = `${id}-${n}`;
    taken.add(free);
    renamed.set(id, free);
  }
  if (renamed.size === 0) return tree;
  // a popup's opener names its dialog by id (data-wc-open, js/widgets.js): it follows the renamed dialog, or the second
  // Modal placed opened the first one's dialog
  const OPENS = 'data-wc-open';
  const repair = (node: DocNode): DocNode => {
    const { id, href } = node.attributes;
    const attributes = {
      ...node.attributes,
      ...(typeof id === 'string' && renamed.has(id) ? { id: renamed.get(id) as string } : {}),
      ...(typeof href === 'string' && href.startsWith('#') && renamed.has(href.slice(1)) ? { href: `#${renamed.get(href.slice(1)) as string}` } : {}),
    };
    const opens = node.customAttributes?.[OPENS];
    const customAttributes = opens !== undefined && renamed.has(opens) ? { customAttributes: { ...node.customAttributes, [OPENS]: renamed.get(opens) as string } } : {};
    return { ...node, attributes, ...customAttributes, children: node.children.map(repair) };
  };
  return repair(tree);
}

// A new element takes the classes every sibling of its kind already shares (the plan's stage 7, "a new element inherits
// its siblings' look"; journey C3: a new link in a menu of styled links came out plain): the classes common to all the
// receiver's children of the same type, when there is at least one such child and they share any.
function withSiblingClasses(node: DocNode, siblings: readonly DocNode[]): DocNode {
  const kin = siblings.filter((one) => one.type === node.type);
  if (kin.length === 0 || node.classes.length > 0) return node;
  const [first, ...rest] = kin as [DocNode, ...DocNode[]];
  const shared = first.classes.filter((name) => rest.every((one) => one.classes.includes(name)));
  return shared.length === 0 ? node : { ...node, classes: shared };
}

// The first empty cell of a grid, which an element placed at the grid's end takes instead (the audit's AUD-20: Insert ›
// Grid, then Insert › Card, left the grid's three empty cells above the card): a child of a parent that writes its
// columns (a grid: the Grid template's, the grid wrapper's) that is a container holding nothing, untouched — no styles,
// classes or attributes of its own, neither locked, hidden nor a component's. -1 when the parent has none.
function emptyCell(parent: DocNode, rules: ModelRules): number {
  const base = (parent.styles as Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, unknown>>>>>>)[rules.baseLayer.breakpoint]?.[rules.baseLayer.state];
  if (base?.[COLUMNS_PROPERTY] === undefined) return -1;
  const untouched = (child: DocNode): boolean =>
    rules.elements.get(child.type)?.content === 'children' &&
    child.children.length === 0 &&
    Object.keys(child.styles).length === 0 &&
    child.classes.length === 0 &&
    Object.keys(child.attributes).length === 0 &&
    child.locked !== true &&
    child.hidden !== true &&
    child.component === undefined &&
    child.componentPart === undefined;
  return parent.children.findIndex(untouched);
}

// The words of the page a new element goes into (the page of the node it is placed by, else the page shown): its own
// language, else the project's, as the export writes its <html lang> (export/names.ts pageLanguage), so a palette
// element placed into an English page while the editor speaks Portuguese says its texts in English (the audit's TPL-3).
export function pageWordsAt(context: Pick<HandlerContext<unknown>, 'state' | 'words' | 'pageWords'>, near: NodeId | undefined): (key: MessageId) => string {
  const { state, pageWords } = context;
  if (pageWords === undefined) return (key) => context.words(key);
  const placed = near === undefined ? null : locate(state.document, near);
  const page = placed === null ? pageShown(state) : (state.document.pages[placed.page] ?? null);
  const language = pageLanguage(page?.tree.attributes['pageLanguage' as keyof DocNode['attributes']], state.document.language);
  return (key) => pageWords(language, key);
}

export const insertCommand = registerHandler('element.insert', (context, { entry, parent, index }): Outcome<never> => {
  const { state, ids, rules, words, clock } = context;
  const near = parent ?? state.selection[0];
  const node = paletteNode(nodeMaker(state.document, rules, ids, words, clock.now(), pageWordsAt(context, near)), entry);
  const at = insertLanding(state, rules, node, parent, index);
  if (at === null) throw new Error(`element.insert: the document has no node ${String(parent)}`);
  const receiver = at.parent.node;
  // a locked parent, or one inside a locked element, takes no new child (spec lock-element)
  const locked = lockRefusal(state.document, receiver.id, 'status.locked.insert');
  if (locked !== null) return { kind: 'refused', message: locked };
  // the one rule of where elements may go (content-model.ts placementRefusal): the same for every door that inserts
  const refused = placementRefusal(state.document, rules, receiver.id, [node]);
  if (refused !== null) return { kind: 'refused', message: refused };
  const placed = withSiblingClasses(node, receiver.children);
  // the grid's first empty cell (insertLanding): the node takes its place
  if (at.cell) {
    const cell = at.index;
    const path = [...at.parent.path, 'children', cell];
    // the cell leaves: what pointed at it lets go in the same change (the audit's RF2), as a delete releases it
    const replaced = receiver.children[cell];
    const leaving = new Set(replaced === undefined ? [] : [...walk(replaced)].map((one) => one.id as NodeId));
    return {
      kind: 'change',
      patches: [...releaseReferencesPatch(state.document, leaving), { op: 'remove', path }, { op: 'add', path, value: placed }],
      selection: [node.id],
      message: message('status.placed', { element: node.name, parent: receiver.name, position: cell + 1, count: receiver.children.length }),
    };
  }
  return {
    kind: 'change',
    patches: [{ op: 'add', path: [...at.parent.path, 'children', at.index], value: placed }],
    selection: [node.id],
    message: message('status.placed', { element: node.name, parent: receiver.name, position: at.index + 1, count: receiver.children.length + 1 }),
  };
});

// an entry of the palette an argument names (manifest refers: palette-entry)
registerReferenceKind('palette-entry', (_document, entry, rules) => rules.palette.has(entry));
