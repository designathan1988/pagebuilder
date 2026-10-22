// The style states a value is stored under (spec state-styles): the one owner of what a state key is and of the
// selector it writes. A key is one of three kinds:
// - a state of properties.json (`hover`, `odd`, `placeholder`, `current`…), written as its pseudo-class,
//   pseudo-element or attribute test after the element's selector;
// - a child position by a formula, `nth:<An+B>` ("nth:3n+1"), written `:nth-child(3n+1)`; the formula is stored in its
//   one canonical spelling (nthFormula), and a formula a state of properties.json already names (odd, even) is that
//   state, never a key of its own;
// - a parent state, `parent:<class>:<state>` ("parent:card:hover"): the element styled while an ancestor wearing the
//   class is in a state that may be an ancestor's (properties.json `ancestor`), written `.card:hover <selector>`.
// The validator, the writers' arguments, the canvas, the export and the import read keys here, so a key the document
// holds always writes the rule it stands for. Old projects hold only states of properties.json: nothing to migrate.
import { isIdentifier } from '../text/identifier.ts';

// what a key reads of the states of properties.json: by id, their pseudo-class (or pseudo-element, or attribute test),
// the element types they stand on, and whether they may be an ancestor's
export type StateTable = ReadonlyMap<string, { readonly pseudo: string | null; readonly elements: readonly string[] | null; readonly ancestor?: boolean }>;

export type StateKind =
  | { readonly kind: 'fixed'; readonly id: string; readonly pseudo: string | null }
  | { readonly kind: 'nth'; readonly formula: string }
  | { readonly kind: 'parent'; readonly className: string; readonly state: string };

const NTH = 'nth:';
const PARENT = 'parent:';
const NTH_CHILD = ':nth-child';
// at most four digits for A and B: a page has no child farther than that
const AN_B = /^([+-]?)(\d{0,4})n(?:([+-])(\d{1,4}))?$/;
const INTEGER = /^([+-]?)(\d{1,4})$/;
const KEYWORDS: ReadonlySet<string> = new Set(['odd', 'even']);

// The canonical spelling of an An+B formula (CSS Syntax 3, "The An+B microsyntax"): "odd", "even", "3", "n", "-n+3",
// "2n+1", "4n-2"; spaces and letter case read as CSS reads them. Null for a text that is no formula.
export function nthFormula(text: string): string | null {
  const t = text.replace(/\s+/g, '').toLowerCase();
  if (KEYWORDS.has(t)) return t;
  const integer = INTEGER.exec(t);
  if (integer !== null) return String((integer[1] === '-' ? -1 : 1) * Number(integer[2]) || 0);
  const formula = AN_B.exec(t);
  if (formula === null) return null;
  const a = (formula[1] === '-' ? -1 : 1) * (formula[2] === '' || formula[2] === undefined ? 1 : Number(formula[2]));
  const b = formula[3] === undefined ? 0 : (formula[3] === '-' ? -1 : 1) * Number(formula[4]);
  if (a === 0) return String(b);
  const step = a === 1 ? 'n' : a === -1 ? '-n' : `${a}n`;
  return b === 0 ? step : `${step}${b > 0 ? '+' : '-'}${Math.abs(b)}`;
}

// the state of properties.json a formula is (":nth-child(odd)" is Odd), or undefined
const fixedOf = (formula: string, table: StateTable): string | undefined => [...table].find(([, s]) => s.pseudo === `${NTH_CHILD}(${formula})`)?.[0];

// The key of a child position typed as a formula: the state of properties.json that names it, else `nth:<formula>`;
// null for a text that is no formula.
export function nthKey(text: string, table: StateTable): string | null {
  const formula = nthFormula(text);
  if (formula === null) return null;
  return fixedOf(formula, table) ?? `${NTH}${formula}`;
}

// The key of a parent state, or null when the class is no class name or the state is none an ancestor may be in.
export function parentKey(className: string, state: string, table: StateTable): string | null {
  return isIdentifier(className) && table.get(state)?.ancestor === true ? `${PARENT}${className}:${state}` : null;
}

// What a key stands for, or null for a key that is no style state.
export function stateKind(key: string, table: StateTable): StateKind | null {
  const fixed = table.get(key);
  if (fixed !== undefined) return { kind: 'fixed', id: key, pseudo: fixed.pseudo };
  if (key.startsWith(NTH)) {
    const written = key.slice(NTH.length);
    const formula = nthFormula(written);
    return formula !== null && formula === written && fixedOf(formula, table) === undefined ? { kind: 'nth', formula } : null;
  }
  if (key.startsWith(PARENT)) {
    const rest = key.slice(PARENT.length);
    const colon = rest.lastIndexOf(':');
    if (colon <= 0) return null;
    const className = rest.slice(0, colon);
    const state = rest.slice(colon + 1);
    return parentKey(className, state, table) === key ? { kind: 'parent', className, state } : null;
  }
  return null;
}

export const isStyleState = (key: string, table: StateTable): boolean => stateKind(key, table) !== null;

// What a door may hand view.setStyleState: a style state, a child position as typed (`nth:` and the field's text,
// which the handler reads and refuses with words when it is no formula), or a parent state whose class is still to be
// chosen (`parent::hover`: the nearest ancestor's class, editor/view/style-state.ts).
export function stateArgumentFits(value: string, table: StateTable): boolean {
  if (isStyleState(value, table) || value.startsWith(NTH)) return true;
  if (!value.startsWith(`${PARENT}:`)) return false;
  return table.get(value.slice(PARENT.length + 1))?.ancestor === true;
}

// The ancestor state of an unchosen parent state (`parent::hover` → hover), or null.
export function openParentState(value: string, table: StateTable): string | null {
  if (!value.startsWith(`${PARENT}:`)) return null;
  const state = value.slice(PARENT.length + 1);
  return table.get(state)?.ancestor === true ? state : null;
}

// The selector of the rule a key writes for an element written as `selector`: `.btn:hover`, `.row:nth-child(3n+1)`,
// `.field::placeholder`, `.nav__link[aria-current="page"]`, `.card:hover .title`. Null for a key that is no state.
export function stateSelector(selector: string, key: string, table: StateTable): string | null {
  const kind = stateKind(key, table);
  if (kind === null) return null;
  if (kind.kind === 'fixed') return `${selector}${kind.pseudo ?? ''}`;
  if (kind.kind === 'nth') return `${selector}${NTH_CHILD}(${kind.formula})`;
  return `.${kind.className}${table.get(kind.state)?.pseudo ?? ''} ${selector}`;
}

// Whether a key writes a pseudo-element (::before, ::placeholder, ::marker…): what it styles is always drawn, never a
// state the canvas forces on the element.
export function isPseudoElement(key: string, table: StateTable): boolean {
  const kind = stateKind(key, table);
  return kind?.kind === 'fixed' && kind.pseudo !== null && kind.pseudo.startsWith('::');
}

// The keys of one breakpoint's states in the order their rules are written: the states of properties.json in its
// order, then the child positions, then the parent states, each in the order the document holds them (a later rule of
// the same weight wins, as the person's last choice should).
export function orderedStates(held: readonly string[], table: StateTable): readonly string[] {
  const fixed = [...table.keys()].filter((id) => held.includes(id));
  const kinds = held.map((key) => [key, stateKind(key, table)] as const);
  return [...fixed, ...kinds.filter(([, k]) => k?.kind === 'nth').map(([key]) => key), ...kinds.filter(([, k]) => k?.kind === 'parent').map(([key]) => key)];
}
