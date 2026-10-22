// The style state the editor edits (spec state-styles): one of properties.json's
// `states`, a child position by a formula (`nth:2n+1`) or a parent state (`parent:card:hover`), the keys of
// core/style/state-keys.ts; Base while none is chosen. The State menu chooses it (view.setStyleState), and the
// selector bar's fields beside it choose a child position's formula and a parent state's class and state; style
// writes go to its layer at the active breakpoint (the store's `layer`), and the canvas draws the selected elements
// with that state applied. Editor state, not a preference: a reload goes back to Base. Choosing it records nothing.
import { message, registerHandler, type MessageParam } from '../../core/commands/registry.ts';
import { lineage, locate, type DocNode, type DocumentJson, type NodeId } from '../../core/document/model.ts';
import type { Followed, StoreState } from '../../core/store/store.ts';
import { nthKey, openParentState, parentKey, stateKind, stateSelector, type StateTable } from '../../core/style/state-keys.ts';
import type { MessageId } from '../../generated/ids.ts';
import { manifest } from '../../manifest/runtime.ts';
import type { EditorUi } from '../state.ts';
import { activeBreakpoint, type Shown } from './breakpoints.ts';

export const STATES = manifest.properties.states;
const FIRST = STATES[0];
if (FIRST === undefined) throw new Error('properties.json declares no state');
export const BASE_STATE = FIRST;
const BASE: StyleState = FIRST;

// the states of properties.json as the state keys read them
export const STATE_TABLE: StateTable = new Map(STATES.map((s) => [s.id, { pseudo: s.pseudo, elements: s.elements, ancestor: s.ancestor === true }] as const));
// the states an ancestor may be in (a parent state's second half), in the manifest's order
export const ANCESTOR_STATES = STATES.filter((s) => s.ancestor === true);

// A style state as the editor shows it: its key (`id`), its name in the catalogues with the words it takes (a child
// position's formula, a parent state's class and state), the selector piece it writes (`pseudo`, null for Base) and
// the element types it stands on (null for every one).
export interface StyleState {
  readonly id: string;
  readonly labelKey: string;
  readonly labelParams?: Readonly<Record<string, MessageParam>>;
  readonly pseudo: string | null;
  readonly elements: readonly string[] | null;
}

// the catalogue keys of the states a key builds (en.json, pt-BR.json)
const NTH_LABEL = 'styleState.nthChildOf';
// what a child position's key starts with: the selector bar's formula field hands it with the text typed
export const NTH_STATE = 'nth:';
const NTH_PREFIX = NTH_STATE;
const PARENT_LABEL = 'styleState.parentOf';

// The state a key stands for; Base for no key or a key that is no state. One object per key, so a view that reads the
// edited state (useEditorState) sees the same one until it changes.
const BUILT = new Map<string, StyleState>();
export function styleStateOf(key: string | undefined): StyleState {
  if (key === undefined) return BASE;
  const built = BUILT.get(key);
  if (built !== undefined) return built;
  const made = buildState(key);
  BUILT.set(key, made);
  return made;
}
function buildState(key: string): StyleState {
  const kind = stateKind(key, STATE_TABLE);
  if (kind === null) return BASE;
  if (kind.kind === 'fixed') return STATES.find((s) => s.id === kind.id) ?? BASE;
  if (kind.kind === 'nth') return { id: key, labelKey: NTH_LABEL, labelParams: { formula: kind.formula }, pseudo: `:nth-child(${kind.formula})`, elements: null };
  const ancestor = STATES.find((s) => s.id === kind.state);
  return {
    id: key,
    labelKey: PARENT_LABEL,
    labelParams: { name: kind.className, state: { key: (ancestor?.labelKey ?? BASE.labelKey) as MessageId } },
    pseudo: `.${kind.className}${ancestor?.pseudo ?? ''}`,
    elements: null,
  };
}

// A state's name in the interface language ("Hover", "Nth child 2n+1", "Hover on .card")
export const stateName = (state: StyleState, t: (key: MessageId, params?: Readonly<Record<string, MessageParam>>) => string): string => t(state.labelKey as MessageId, state.labelParams);

// the state the editor edits now
export const activeState = (ui: EditorUi): StyleState => styleStateOf(ui.styleState);

// The selector a class's rule of the edited state writes (".btn:hover", ".card:hover .title"): what the class bar says
// the writes land in.
export const stateRuleOf = (selector: string, state: StyleState): string => (state.id === BASE.id ? selector : (stateSelector(selector, state.id, STATE_TABLE) ?? selector));

// the layer style writes go to and the fields read: the active breakpoint and the active state
export const activeLayer = (shown: Shown): { readonly breakpoint: string; readonly state: string } => ({ breakpoint: activeBreakpoint(shown).id, state: activeState(shown.ui).id });

// Whether a state stands on an element of this type (elements.json ids; null for every element): the State menu
// hides the ones it does not, and no field edit or export writes a rule a browser would ignore (A3.36).
function stateAppliesTo(state: StyleState, type: string): boolean {
  return state.elements === null || state.elements.includes(type);
}

// The state a door stands for (its arguments), or null for a door that is no state: a child position or a parent
// state whose class is still to be chosen stands for every element
export const stateOf = (args: Readonly<Record<string, unknown>>): StyleState | null => {
  if (typeof args.state !== 'string') return null;
  if (openParentState(args.state, STATE_TABLE) !== null || args.state.startsWith(NTH_PREFIX)) return { ...BASE, id: args.state, elements: null };
  return stateKind(args.state, STATE_TABLE) === null ? null : styleStateOf(args.state);
};

// The first selected element a state does not stand on, or null (the state stands on all of them)
function standsApart(state: Pick<StoreState<EditorUi>, 'document' | 'selection'>, chosen: StyleState): DocNode | null {
  for (const id of state.selection) {
    const node = locate(state.document, id)?.node;
    if (node !== undefined && !stateAppliesTo(chosen, node.type)) return node;
  }
  return null;
}

const nameOf = (chosen: StyleState): MessageParam => ({ key: chosen.labelKey as MessageId, ...(chosen.labelParams === undefined ? {} : { params: chosen.labelParams }) });

const apart = (chosen: StyleState, node: DocNode, key: 'status.styleState.reset' | 'status.styleState.notApplicable') =>
  message(key, { state: nameOf(chosen), element: { key: ELEMENT_LABELS.get(node.type) ?? ('styleState.base' as MessageId) } });

const ELEMENT_LABELS = new Map(manifest.elements.elements.map((e) => [e.id, e.labelKey as MessageId] as const));

// The classes the ancestors of an element wear, nearest first, each once: the classes a parent state may name
export function ancestorClasses(document: DocumentJson, id: NodeId | undefined): readonly string[] {
  if (id === undefined || locate(document, id) === null) return [];
  const names: string[] = [];
  for (const node of lineage(document, id).slice(0, -1).reverse()) for (const name of node.classes) if (!names.includes(name)) names.push(name);
  return names;
}

// The style state follows the selection (the audit's AUD-03; the user's decision of 2026-10-02): a selection that holds
// an element the state does not stand on (Visited, then a heading) brings the editor back to Base and says so, so no
// write can go to a state the element does not take. Read after every new selection and every command (a tag switch
// changes what an element is).
export function styleStateFollows(state: StoreState<EditorUi>): Followed<EditorUi> {
  const chosen = activeState(state.ui);
  if (chosen.id === BASE_STATE.id) return { ui: state.ui };
  const node = standsApart(state, chosen);
  if (node === null) return { ui: state.ui };
  const { styleState: _was, ...rest } = state.ui;
  void _was;
  return { ui: rest, message: apart(chosen, node, 'status.styleState.reset') };
}

// The key a door's state names, as the editor stands now: a child position's formula as typed (the selector bar's
// field hands its text, `nth:` and what was typed), and a parent state whose class is still to be chosen given the
// class of the parent state edited now, else of the nearest ancestor of the selection that wears one. A refusal's words
// when it names none.
function chosenKey(state: StoreState<EditorUi>, wanted: string): { readonly key: string } | { readonly refused: ReturnType<typeof message> } {
  if (wanted.startsWith(NTH_PREFIX) && stateKind(wanted, STATE_TABLE) === null) {
    const typed = wanted.slice(NTH_PREFIX.length);
    const key = nthKey(typed, STATE_TABLE);
    return key === null ? { refused: message('status.styleState.badFormula', { text: typed.trim() }) } : { key };
  }
  const ancestorState = openParentState(wanted, STATE_TABLE);
  if (ancestorState === null) return { key: wanted };
  const edited = stateKind(activeState(state.ui).id, STATE_TABLE);
  const primary = state.selection[0];
  const className = edited?.kind === 'parent' ? edited.className : ancestorClasses(state.document, primary)[0];
  const key = className === undefined ? null : parentKey(className, ancestorState, STATE_TABLE);
  if (key !== null) return { key };
  const node = primary === undefined ? undefined : locate(state.document, primary)?.node;
  return { refused: message('status.styleState.noParentClass', { element: node === undefined ? '' : node.name }) };
}

export const setStyleState = registerHandler<'view.setStyleState', EditorUi>(
  'view.setStyleState',
  ({ state }, args) => {
    const picked = chosenKey(state, args.state);
    if ('refused' in picked) return { kind: 'refused', message: picked.refused };
    if (stateKind(picked.key, STATE_TABLE) === null) throw new Error(`view.setStyleState: no state ${args.state}`);
    const chosen = styleStateOf(picked.key);
    // a state the selection does not stand on is not chosen (the State menu offers only the ones it does)
    const node = standsApart(state, chosen);
    if (node !== null) return { kind: 'refused', message: apart(chosen, node, 'status.styleState.notApplicable') };
    const { styleState: _was, ...rest } = state.ui;
    void _was;
    const ui: EditorUi = chosen.id === BASE.id ? rest : { ...rest, styleState: chosen.id };
    return { kind: 'change', ui, message: message('status.styleStateActive', { state: nameOf(chosen) }) };
  },
  // a menu item stands for its state being the one edited: the Nth child item for any child position, the Parent
  // state item for any parent state
  (state, args) => sameChoice(activeState(state.ui).id, args.state),
);

function sameChoice(edited: string, door: unknown): boolean {
  if (typeof door !== 'string') return false;
  if (edited === door) return true;
  const kind = stateKind(edited, STATE_TABLE);
  if (kind?.kind === 'nth') return door.startsWith(NTH_PREFIX);
  if (kind?.kind === 'parent') return openParentState(door, STATE_TABLE) !== null;
  return false;
}
