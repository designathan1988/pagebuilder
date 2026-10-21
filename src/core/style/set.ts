// style.set (spec inspector-number-fields): the one writer of a property's value into
// the selected elements' styles. A value belongs to one breakpoint and one state: the base ones until the breakpoint
// and state pickers arrive (view.setBreakpoint, view.setStyleState). Every door that writes one value of one property
// ends here: a field's Enter, the number fields' steps, scrub and unit menu (src/editor/inspector/number-field.ts),
// through `writeStyle`, in one transaction and one undo step, the same value for every selected element.
//  - What was typed is read by the property's codec (src/core/style/codecs.ts) against the units and keywords the
//    property offers (the generated lists), a bare number taking the field's default unit (the codec's, px for a
//    length; never the unit the element held before: spec inspector-number-fields, Problems in Pager 4), and written
//    only when the browser takes it (the CSS support
//    port): anything else is refused with status.value.invalid, which names the field and the text (spec, Problems in
//    Pager 2: never refused without a word), and nothing changes.
//  - A locked element, or one inside a locked element, is refused (lockRefusal of flags.ts) and keeps its value.
//  - The same value records nothing (history.noChange "no-entry"); the status bar says the value either way.
// Every command that writes CSS properties on an element (style.set, a handle's resize, the spacing handles) writes
// them through writeDeclarations, the one writer of an element's declarations at a breakpoint and state, so the
// document keeps one shape: styles → breakpoint → state → property → value, each level created when it is first needed.
// Where they are written (styleHolders, spec shared-style-classes): the selected elements' styles, or, while a class
// every selected element lists is the editor's style target, that class's alone (core/design/classes.ts targetClass);
// the status bar then names the class as .name.
import { IDENTIFIER_SOURCE } from '../text/identifier.ts';
import type { StyleTargetId } from '../../generated/ids.ts';
import { GENERATED_VALUES } from '../../generated/value-lists.ts';
import { message, registerHandler, type HandlerContext, type MessageParam, type Outcome } from '../commands/registry.ts';
import { locate, type DocNode, type DocumentJson, type Location, type NodeId, type Selection, type StoredValue } from '../document/model.ts';
import { classTarget } from '../design/classes.ts';
import { structuredCss } from '../render/output.ts';
import { componentHolders, instanceRootOf } from '../design/instances.ts';
import type { ModelRules } from '../document/validate.ts';
import type { Patch } from '../history/transaction.ts';
import { firstLockRefusal, stateRefusal } from '../nodes/flags.ts';
import { coupledScene } from './couplings.ts';
import { recordStyleWrite } from '../motion/record.ts';
import { deepEqual } from '../history/transaction.ts';
import { clearedRecipes } from './recipes.ts';
import { heldAt, storedValue } from './stored.ts';
import { DEFAULT_UNIT, codecOf, type Codec, type Value, type ValueFacts } from './codecs.ts';
import { keywordOfWord } from './keyword-words.ts';
import { decimalPoint } from './decimal.ts';

type Layers = Record<string, Record<string, Record<string, StoredValue>> | undefined>;
// the path of a page's element: pages, its page, tree, then children and an index down to it
const PAGES = 'pages';
const CHILDREN = 'children';
// the composites that repeat one value per side, corner or axis: one design token stands for each longhand
const SPREAD_CODECS: ReadonlySet<string> = new Set(['box-sides', 'box-corners', 'axis-pair']);

// What a style write of the selection writes into: a node whose styles it writes (an element, or a class read as the
// primary element holding the class's styles, for the couplings and recipes), the path of that node's holder, the
// parent the couplings read, and the name the status bar says.
export interface StyleHolder {
  readonly node: DocNode;
  readonly path: readonly (string | number)[];
  readonly parent: DocNode | null;
  readonly name: string;
}

// The holders of the selected elements' styles (found in the document), or the one class that is the style target.
export function styleHolders<Ui>(context: HandlerContext<Ui>, nodes: readonly Location[]): StyleHolder[] {
  return holdersOf(context.state.document, context.state.selection, context.styleClass ?? null, nodes);
}

// The same, for a document, its selection and the class the editor names as the style target: what the editor's
// readers ask (replacedDeclarations), so what they show is read where the writers write.
function holdersOf(document: DocumentJson, selection: Selection, styleClass: string | null, nodes: readonly Location[]): StyleHolder[] {
  const primary = nodes[0];
  const target = classTarget(document, selection, styleClass);
  if (target !== null && primary !== undefined) return [{ node: { ...primary.node, styles: target.styleClass.styles }, path: ['classes', target.index], parent: primary.parent, name: `.${target.styleClass.name}` }];
  // an element of an instance writes into its component's definition and every instance's same element
  // (core/design/components.ts); each holder once
  const seen = new Set<string>();
  return nodes.flatMap((found) =>
    (componentHolders(document, found.node.id as NodeId) ?? [found]).flatMap((held) => {
      const key = held.path.join('/');
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ node: held.node, path: held.path, parent: held.parent, name: found.node.name }];
    }),
  );
}

// The patches that write these values on a node (a null value removes its property), at a breakpoint and state; empty
// when the node already holds them all.
// The layer an element's own rule stands for (the active breakpoint and state), replaced whole by these declarations,
// through the one writer of declarations and the holders every style write goes to (a class that is the style
// target, an instance's component and its copies): the code pane's rule and the custom declarations write so (the
// audit's OW1: a patch of their own left empty layers and wrote an instance's element alone).
export function replaceLayer<Ui>(context: HandlerContext<Ui>, at: Location, wanted: Readonly<Record<string, StoredValue>>): Patch[] {
  const layer = context.rules.base;
  return styleHolders(context, [at]).flatMap((held) => {
    const current = (held.node.styles as Layers)[layer.breakpoint]?.[layer.state] ?? {};
    const cleared = Object.fromEntries(Object.keys(current).filter((property) => !(property in wanted)).map((property) => [property, null]));
    return writeDeclarations(held.node, held.path, layer, { ...cleared, ...keptStructures(current, wanted, context.rules) });
  });
}

// The declarations a whole-rule write (replaceLayer: the code pane's rule, the custom declarations) replaces: the
// layer of the first holder it writes (the class that is the style target, an instance's component, else the element)
// at that layer. The one reader of them, so the code pane and the declarations field show exactly what Apply replaces,
// and the commands compare what was typed with it (the audit's STYLE-1: they showed the element at Desktop/Base and
// replaced the targeted class, or the active breakpoint's layer).
export function replacedDeclarations(
  document: DocumentJson,
  selection: Selection,
  styleClass: string | null,
  at: Location,
  layer: { readonly breakpoint: string; readonly state: string },
): Readonly<Record<string, StoredValue>> {
  const held = holdersOf(document, selection, styleClass, [at])[0];
  return held === undefined ? {} : ((held.node.styles as Layers)[layer.breakpoint]?.[layer.state] ?? {});
}

// The declarations wanted, a structured value whose CSS is what the held one writes kept as it is held: a rule's text
// shows a shadow as its CSS, which leaves its hidden layers out, so a rule applied unchanged keeps them.
function keptStructures(current: Readonly<Record<string, StoredValue>>, wanted: Readonly<Record<string, StoredValue>>, rules: ModelRules): Record<string, StoredValue> {
  return Object.fromEntries(
    Object.entries(wanted).map(([property, value]): [string, StoredValue] => {
      const fields = rules.structures.get(property);
      const held = current[property];
      if (fields === undefined || held === undefined || typeof held === 'string' || typeof value === 'string') return [property, value];
      return structuredCss(held, fields) === structuredCss(value, fields) ? [property, held] : [property, value];
    }),
  );
}

// A layer's declarations as CSS text, one "property: value" each, a structured value (a shadow's layers) as the page
// writes it: what the code pane's rule and the declarations field show.
export function declarationTexts(declarations: Readonly<Record<string, StoredValue>>, rules: ModelRules): readonly string[] {
  return Object.entries(declarations).map(([property, value]) => `${property}: ${typeof value === 'string' ? value : structuredCss(value, rules.structures.get(property) ?? [])};`);
}

export function writeDeclarations(
  node: DocNode,
  path: readonly (string | number)[],
  layer: { readonly breakpoint: string; readonly state: string },
  values: Readonly<Record<string, StoredValue | null>>,
): Patch[] {
  const byBreakpoint = (node.styles as Layers)[layer.breakpoint];
  const current = byBreakpoint?.[layer.state] ?? {};
  const written = Object.entries(values);
  // a property written keeps its place; a new one comes last
  const next: Record<string, StoredValue> = Object.fromEntries([
    ...Object.entries(current).flatMap(([property, value]): [string, StoredValue][] => {
      if (!(property in values)) return [[property, value]];
      const now = values[property];
      return now === null || now === undefined ? [] : [[property, now]];
    }),
    ...written.filter((entry): entry is [string, StoredValue] => entry[1] !== null && !(entry[0] in current)),
  ]);
  const same = Object.keys(current).length === Object.keys(next).length && Object.entries(next).every(([p, v]) => deepEqual(current[p], v));
  if (same) return [];
  // one patch: the node's styles with that layer written; a state left with nothing, and a breakpoint left with no
  // state, go (a node that holds no value holds no empty layers)
  const styles = node.styles as Layers;
  const { [layer.state]: _state, ...otherStates } = byBreakpoint ?? {};
  void _state;
  const states = Object.keys(next).length > 0 ? { ...otherStates, [layer.state]: next } : otherStates;
  const { [layer.breakpoint]: _breakpoint, ...otherBreakpoints } = styles;
  void _breakpoint;
  return [{ op: 'replace', path: [...path, 'styles'], value: Object.keys(states).length > 0 ? { ...otherBreakpoints, [layer.breakpoint]: states } : otherBreakpoints }];
}

// The patches that write these values into a keyframe's declarations (a null value removes its property); empty when it
// already holds them. The one writer of a keyframe's declarations, beside writeDeclarations for an element's layer.
export function writeKeyframeDeclarations(
  node: DocNode,
  path: readonly (string | number)[],
  animationName: string,
  offset: number,
  values: Readonly<Record<string, StoredValue | null>>,
): Patch[] {
  const animationIndex = (node.animations ?? []).findIndex((a) => a.name === animationName);
  const animation = animationIndex < 0 ? undefined : node.animations?.[animationIndex];
  const keyframeIndex = animation?.keyframes.findIndex((k) => k.offset === offset) ?? -1;
  if (animation === undefined || animationIndex < 0 || keyframeIndex < 0) return [];
  const current = animation.keyframes[keyframeIndex]?.declarations ?? {};
  const next: Record<string, StoredValue> = Object.fromEntries([
    ...Object.entries(current).flatMap(([property, value]): [string, StoredValue][] => {
      if (!(property in values)) return [[property, value]];
      const now = values[property];
      return now === null || now === undefined ? [] : [[property, now]];
    }),
    ...Object.entries(values).filter((entry): entry is [string, StoredValue] => entry[1] !== null && !(entry[0] in current)),
  ]);
  const same = Object.keys(current).length === Object.keys(next).length && Object.entries(next).every(([p, v]) => deepEqual((current as Record<string, StoredValue>)[p], v));
  if (same) return [];
  return [{ op: 'replace', path: [...path, 'animations', animationIndex, 'keyframes', keyframeIndex, 'declarations'], value: next }];
}

// What a field shows for a property at the layer the editor edits (rules.base; spec breakpoint-overrides,
// state-styles):
// the value set there, else the one it inherits, desktop first: the same state at each larger breakpoint in turn, then
// the base state from the active breakpoint up; with where it was found. Undefined when no layer sets it.
export function shownValue(node: DocNode, property: string, rules: ModelRules): { readonly value: StoredValue; readonly breakpoint: string; readonly state: string } | undefined {
  const breakpoints = [...rules.breakpoints];
  const at = breakpoints.indexOf(rules.base.breakpoint);
  const upward = (at < 0 ? breakpoints.slice(0, 1) : breakpoints.slice(0, at + 1)).reverse();
  const states = rules.base.state === rules.baseLayer.state ? [rules.base.state] : [rules.base.state, rules.baseLayer.state];
  for (const state of states)
    for (const breakpoint of upward) {
      const value = heldAt(node, property, { ...rules, base: { breakpoint, state } });
      if (value !== undefined) return { value, breakpoint, state };
    }
  return undefined;
}

// The text a field shows for a property at the edited layer (shownValue's), or undefined.
export function shownText(node: DocNode, property: string, rules: ModelRules): string | undefined {
  const shown = shownValue(node, property, rules)?.value;
  return typeof shown === 'string' ? shown : undefined;
}

// The width of each line (a border side, the outline, the column rule) and its style: an edited property named
// <line>-width whose <line>-style is edited too. A line's width computes to 0px while its style is none (spec
// inspector-provenance-reset, Problems in Pager 4; the canvas reads it so: src/editor/canvas/coordinates.ts).
const LINES = new WeakMap<ModelRules, ReadonlyMap<string, string>>();
export function lineStyles(rules: ModelRules): ReadonlyMap<string, string> {
  const known = LINES.get(rules);
  if (known !== undefined) return known;
  const WIDTH = '-width';
  const map = new Map([...rules.propertyFacts.keys()].flatMap((p) => (p.endsWith(WIDTH) && rules.propertyFacts.has(`${p.slice(0, -WIDTH.length)}-style`) ? [[p, `${p.slice(0, -WIDTH.length)}-style`] as const] : [])));
  LINES.set(rules, map);
  return map;
}

// The text a field shows for a property or a composite from the values of its longhands, in order (spec
// inspector-provenance-reset, Problems in Pager 4): the composite's shorthand as written (its codec's compose), else
// the one value they share, else them in order.
export function composedText(property: string, values: readonly string[], rules: ModelRules): string {
  const composed = codecFor(property, rules)?.compose?.(values);
  if (composed !== null && composed !== undefined) return composed;
  return new Set(values).size === 1 ? (values[0] ?? '') : values.join(' ');
}

// Whether the longhands of a composite with a shorthand of its own (a border's sides) differ so no shorthand writes
// them: the field says Mixed then, as for several elements that differ, never their values strung together (a header's
// bottom border alone read "  1px    solid    #eadfce ": the audit of 2026-10-05).
export function composesNot(property: string, values: readonly string[], rules: ModelRules): boolean {
  const compose = codecFor(property, rules)?.compose;
  return compose !== undefined && new Set(values).size > 1 && (compose(values) ?? null) === null;
}

// What a refused edit typed, as the refusal quotes it once (spec inspector-number-fields, Problems in Pager 3): a text
// as it is, the values an edit names one after the other (a filter's { blur: "2" } is 2), never JSON.
export function typedText(typed: unknown): string {
  if (typeof typed === 'string') return typed;
  if (Array.isArray(typed)) return typed.map(typedText).filter((t) => t !== '').join(' ');
  if (typed !== null && typeof typed === 'object') return Object.values(typed).map(typedText).filter((t) => t !== '').join(' ');
  return typed === undefined || typed === null ? '' : String(typed);
}

// A value read for a property, and the CSS text it is written as.
export interface ReadValue {
  readonly value: Value;
  readonly css: string;
}

// The codec of a property or of a composite, or null for one whose codec is not registered yet (no door writes it).
function codecFor(property: string, rules: ModelRules): Codec | null {
  const facts = rules.propertyFacts.get(property) ?? rules.compositeFacts.get(property) ?? rules.recipeFacts.get(property);
  return facts === undefined ? null : codecOf(facts.codec);
}

// The longhand values a composite's value stands for (an axis pair: the first for x, the second for y), in its
// longhands' order; null for a property that is no composite.
export function longhandValues(property: string, value: Value, rules: ModelRules): Readonly<Record<string, string>> | null {
  const composite = rules.compositeFacts.get(property);
  if (composite === undefined) return null;
  // a longhand the text leaves out (the colour of a border typed as 2px solid) is not written
  if (value.kind === 'longhands') return Object.fromEntries(composite.longhands.flatMap((p, i) => (value.values[i] ? [[p, value.values[i]] as const] : [])));
  const [x, y] = composite.longhands;
  if (value.kind !== 'pair' || x === undefined || y === undefined) return null;
  return { [x]: value.first, [y]: value.second };
}

// What a text means for a property in the fields of the selection: read by its codec against what the property offers,
// a bare number in the field's default unit (the codec's; Problems in Pager 4); null when it means nothing the
// property takes or the browser does not take it.
export function readValue<Ui>(context: HandlerContext<Ui>, property: string, typedText: string): ReadValue | null {
  const { state, rules, css } = context;
  // a variable named without var() ("--brand", as a person types it in any field; the plan's stage 3) is var(--brand)
  const bare = new RegExp(`^\\s*--(${IDENTIFIER_SOURCE})\\s*$`, 'u').exec(typedText);
  // one number with a decimal comma ("1,5px", ",5rem": pt-BR's decimal separator, which the numpad of an ABNT2
  // keyboard types) is that number with a point, through the one decimal reader (decimal.ts; the audits' L10N1 and
  // INPUT-9); a list ("a, b") or anything else keeps its commas
  const text = bare === null ? decimalPoint(typedText) : `var(--${bare[1] ?? ''})`;
  // a design token of the project, named as a CSS variable, is kept as written (spec css-variables-tokens, Problems in
  // Pager 4); one the project does not have is no value
  const token = new RegExp(`^\\s*var\\(\\s*--(${IDENTIFIER_SOURCE})\\s*\\)\\s*$`, 'u').exec(text);
  if (token !== null) {
    const held = (state.document.tokens ?? []).find((t) => t.name === token[1]);
    if (held === undefined) return null;
    const written = text.trim();
    // a structured value (a shadow's layers) is stored as its layers, never as one text: a token is no value for it
    if (rules.structures.has(property)) return null;
    // the value the variable holds must be one the property takes, as typed in its field (the audit's STYLE-12: a
    // colour variable as a width was stored, and the page dropped the declaration at computed-value time); a variable
    // holding another variable is judged by what that one holds, each once
    if (!tokenTaken(context, property, held.value, new Set([held.name]))) return null;
    const composite = rules.compositeFacts.get(property);
    if (composite === undefined) return { value: { kind: 'expression', text: written }, css: written };
    // a composite is stored as its longhands (journey03 J1: var(--line) as a border colour wrote the shorthand
    // border-color, which the model refuses): a variable holding one value is every longhand's value where the
    // composite repeats one value per side, corner or axis; anything else is no value for it
    return SPREAD_CODECS.has(composite.codec) && !/\s/u.test(held.value.trim()) ? { value: { kind: 'longhands', values: composite.longhands.map(() => written), text: written }, css: written } : null;
  }
  const codec = codecFor(property, rules);
  if (codec === null) return null;
  const { units, keywords, axes } = factsOf(property, rules);
  // a keyword typed in the person's language ("automático") is that keyword (keyword-words.ts)
  const typed = keywordOfWord(text, keywords, context.words) ?? text;
  const value = codec.read(typed, { units, keywords, defaultUnit: DEFAULT_UNIT, ...(axes === undefined ? {} : { axes }) });
  if (value === null) return null;
  const written = codec.write(value);
  // a recipe is stored by its id and written out as its declarations (output.ts): the browser must take every one of
  // them, the value typed in each that names none of its own
  const recipe = rules.recipeFacts.get(property);
  if (recipe !== undefined) return recipe.declarations.every((d) => css.supports(d.property, d.value ?? written)) ? { value, css: written } : null;
  const longhands = longhandValues(property, value, rules);
  if (longhands !== null) return Object.entries(longhands).every(([p, v]) => css.supports(p, v)) ? { value, css: written } : null;
  return css.supports(property, written) ? { value, css: written } : null;
}

// Whether the value a variable holds is one a property takes (readValue's reading of it), following a variable that
// holds another; a variable met twice (a loop) or one the project lacks is none.
function tokenTaken<Ui>(context: HandlerContext<Ui>, property: string, value: string, seen: Set<string>): boolean {
  const named = new RegExp(`^\\s*var\\(\\s*--(${IDENTIFIER_SOURCE})\\s*\\)\\s*$`, 'u').exec(value)?.[1];
  if (named === undefined) return readValue(context, property, value) !== null;
  const next = (context.state.document.tokens ?? []).find((t) => t.name === named);
  if (next === undefined || seen.has(next.name)) return false;
  seen.add(next.name);
  return tokenTaken(context, property, next.value, seen);
}

// What a property's codec reads a text against: the units and keywords it offers (a composite offers what its first
// longhand offers when it has no list of its own) and a composite's axes, the keywords each longhand names
// (properties.json subsets, else their generated lists); the field's unit is the codec's default.
export function factsOf(property: string, rules: ModelRules): ValueFacts {
  const composite = rules.compositeFacts.get(property);
  const offered = GENERATED_VALUES[property as StyleTargetId] ?? GENERATED_VALUES[(composite?.longhands[0] ?? property) as StyleTargetId];
  const axes = composite === undefined ? undefined : (composite.axes ?? composite.longhands.map((l) => GENERATED_VALUES[l as StyleTargetId]?.keywords ?? []));
  return { units: offered?.units ?? [], keywords: offered?.keywords ?? [], defaultUnit: DEFAULT_UNIT, ...(axes === undefined ? {} : { axes }) };
}

// The declarations a value read for a property writes: a composite's longhands, else the property itself.
export function declarationsOf(property: string, read: ReadValue, rules: ModelRules): Readonly<Record<string, string>> {
  return longhandValues(property, read.value, rules) ?? { [property]: read.css };
}

// The CSS text of a value for a property (its codec's), or null for a property no codec writes yet.
export function writeValue(property: string, value: Value, rules: ModelRules): string | null {
  return codecFor(property, rules)?.write(value) ?? null;
}

// The label a message names a property by (properties.json), as a catalogue key the status bar translates.
export function propertyName(property: string, rules: ModelRules): MessageParam {
  const facts = rules.propertyFacts.get(property) ?? rules.compositeFacts.get(property) ?? rules.recipeFacts.get(property);
  return facts === undefined ? property : { key: facts.labelKey };
}

// Writes one CSS text for a property into every selected element, at the base breakpoint and state, in one
// transaction; a locked element refuses it. The status bar names the property, the element (or how many) and the value.
export function writeStyle<Ui>(context: HandlerContext<Ui>, property: string, css: string, longhands: Readonly<Record<string, StoredValue>> | null = null): Outcome<Ui> {
  const { state, rules } = context;
  const nodes = state.selection.map((id) => locate(state.document, id)).filter((found) => found !== null);
  const primary = nodes[0];
  if (primary === undefined) return { kind: 'change' };
  const locked = firstLockRefusal(state.document, nodes.map((found) => found.node.id as NodeId), 'status.locked.edit');
  if (locked !== null) return { kind: 'refused', message: locked };
  // While the motion Timeline records (spec motion-keyframes), the value becomes a keyframe of the timeline it shows,
  // at its playhead, for the primary selected element: the same read, the same one undo step, another holder.
  const recorded = recordStyleWrite(context, primary.node, property, css, longhands ?? { [property]: css });
  if (recorded !== null) return recorded;
  // While the timeline's playhead sits on a keyframe of the primary selected element, the value goes into that
  // keyframe's declarations (spec timeline-keyframes): the same read, the same one undo step, another holder. The
  // couplings and recipes act on an element's styles, not on a keyframe's, so a keyframe holds the declarations the
  // field wrote, exactly.
  const keyframe = context.keyframe ?? null;
  if (keyframe !== null && primary !== undefined && keyframe.node === primary.node.id) {
    const values = longhands ?? { [property]: css };
    const patches = writeKeyframeDeclarations(primary.node, primary.path, keyframe.animation, keyframe.keyframe, values);
    const name = propertyName(property, rules);
    return {
      kind: 'change',
      patches,
      message: message('status.keyframe.value', { property: name, name: primary.node.name, animation: keyframe.animation, offset: String(keyframe.keyframe), value: css }),
    };
  }
  // the state the editor edits must stand on every element written (the audit's AUD-03: Visited written on a heading
  // left a document the validator refused)
  const misplaced = stateRefusal(state.document, nodes.map((found) => found.node.id as NodeId), rules);
  if (misplaced !== null) return { kind: 'refused', message: misplaced };
  const { breakpoint, state: base } = rules.base;
  // a composite writes its longhands, the others their own property; the couplings the write triggers change it
  // (couplings.ts), element by element
  // (a structured value, a shadow's layers, is written as it is: the couplings and recipes act on CSS text)
  const values = longhands ?? { [property]: css };
  const plain = Object.fromEntries(Object.entries(values).filter((e): e is [string, string] => typeof e[1] === 'string'));
  const structured = Object.fromEntries(Object.entries(values).filter(([, v]) => typeof v !== 'string'));
  const via = rules.compositeFacts.has(property) ? property : null;
  const holders = styleHolders(context, nodes);
  const layer = { breakpoint, state: base };
  const patches: Patch[] = [];
  for (const held of holders) {
    // an element of a page is measured where it lies now (keepVisualPlace) and its parent takes the declarations the
    // couplings make of it (setParentValue); a class or a definition is measured nowhere and writes no parent
    const onPage = held.path[0] === PAGES && held.path.at(-2) === CHILDREN;
    const place = onPage ? (within: 'parent' | 'viewport') => context.layout.place(held.node.id as NodeId, within) : () => null;
    const written = coupledScene(held.node, held.parent, plain, via, rules, place);
    patches.push(...writeDeclarations(held.node, held.path, layer, { ...clearedRecipes(held.node, written.own, rules), ...structured }));
    // a parent that is itself written by this write takes its own values, never the ones its child's couplings make of
    // it from the document before the write (the audit's LU1: parent and child made absolute left the parent relative)
    const parentHeld = held.parent !== null && holders.some((one) => one.node.id === held.parent?.id);
    if (onPage && held.parent !== null && !parentHeld && Object.keys(written.parent).length > 0) {
      const parentLocked = firstLockRefusal(state.document, [held.parent.id as NodeId], 'status.locked.edit');
      if (parentLocked !== null) return { kind: 'refused', message: parentLocked };
      patches.push(...writeDeclarations(held.parent, held.path.slice(0, -2), layer, written.parent));
    }
  }
  const name = propertyName(property, rules);
  // a write on an element of an instance reaches the component and its copies: the status names them (the user's
  // real-use audit, item A3.12), so the person is told what the write changed beyond the element they picked
  const component = componentHolders(state.document, primary.node.id as NodeId);
  const root = instanceRootOf(state.document, primary.node.id as NodeId);
  const copies = component === null || root?.component === undefined ? null : { name: root.component, count: component.length - 1 };
  const said =
    copies !== null
      ? copies.count === 1
        ? message('status.style.setComponent', { property: name, name: primary.node.name, value: css, component: copies.name })
        : message('status.style.setComponentMany', { property: name, name: primary.node.name, value: css, component: copies.name, count: copies.count })
      : holders.length === 1
        ? message('status.style.set', { property: name, name: holders[0]?.name ?? primary.node.name, value: css })
        : message('status.style.setMany', { property: name, count: holders.length, value: css });
  return { kind: 'change', patches, message: said };
}

// Writing a property from text: the one path of every writer that hands a whole property (style.set, and the colour
// picker's channel writes, which take it so a colour written into a composite — a border's colour — lands on the
// composite's longhands exactly as a typed one does). A text the property does not take is refused naming it.
export function writePropertyText<Ui>(context: HandlerContext<Ui>, property: string, value: string): Outcome<Ui> {
  const read = readValue(context, property, value);
  if (read === null) return { kind: 'refused', message: message('status.value.invalid', { property: propertyName(property, context.rules), value }) };
  return writeStyle(context, property, read.css, longhandValues(property, read.value, context.rules));
}

// The context a style write of a field runs in: a field left by a press that selected another element names the
// elements its value was typed for (`targets`), and the value goes to them, those still in the document, never to what
// the press selected; null when none of them is left. Every field's command takes it (the audit's FD1: the border,
// the radius, an image, a shadow, a filter, a transform lost the typing instead).
export function withTargets<Ui>(given: HandlerContext<Ui>, targets: unknown): HandlerContext<Ui> | null {
  if (!Array.isArray(targets)) return given;
  const named = targets.filter((id): id is string => typeof id === 'string' && locate(given.state.document, id as NodeId) !== null);
  return named.length === 0 ? null : { ...given, state: { ...given.state, selection: named as NodeId[] } };
}

export const setStyleCommand = registerHandler('style.set', (given, { property, value, targets }) => {
  if (typeof property !== 'string' || typeof value !== 'string') throw new Error('style.set: a door hands a property and the text of its value');
  const context = withTargets(given, targets);
  if (context === null) return { kind: 'change' as const };
  // a recipe (line-clamp) writes its own declarations (display, overflow): one the element already holds as its own
  // would be drawn twice, so the write is refused naming it (the user's real-use audit, item A3.31)
  const recipe = context.rules.recipeFacts.get(property);
  if (recipe !== undefined) {
    const primary = context.state.selection[0] === undefined ? null : locate(context.state.document, context.state.selection[0]);
    const clash = primary === null ? undefined : recipe.declarations.find((d) => storedValue(primary.node, d.property, context.rules) !== undefined);
    if (clash !== undefined) return { kind: 'refused', message: message('status.recipe.conflict', { recipe: propertyName(property, context.rules), property: propertyName(clash.property, context.rules) }) };
  }
  // An Enter in a field the elements hold no value of their own in (the text empty, nothing typed) asks for nothing:
  // nothing is written and nothing is said. It was refused as '"" is not a value this field takes' (DEF-0605). A text
  // emptied where a value is held keeps the refusal (decisoes.md, DCS-031). On a keyframe, what is held is the
  // keyframe's (the audit's STYLE-5).
  if (value.trim() === '' && nothingHeld(context, property)) return { kind: 'change' as const };
  return writePropertyText(context, property, value);
});

// whether none of the elements a write goes to (their holders: a class targeted, a component) holds a value of the
// property, or of its longhands, in the layer edited; while the playhead sits on a keyframe of the primary element (a
// write goes to it: writeStyle), whether that keyframe holds none
function nothingHeld<Ui>(context: HandlerContext<Ui>, property: string): boolean {
  const nodes = context.state.selection.map((id) => locate(context.state.document, id)).filter((found) => found !== null);
  const parts = [property, ...(context.rules.compositeFacts.get(property)?.longhands ?? [])];
  const keyframe = context.keyframe ?? null;
  const primary = nodes[0];
  if (keyframe !== null && primary !== undefined && keyframe.node === primary.node.id) {
    const declarations = (primary.node.animations ?? []).find((a) => a.name === keyframe.animation)?.keyframes.find((k) => k.offset === keyframe.keyframe)?.declarations ?? {};
    return parts.every((one) => !(one in declarations));
  }
  return styleHolders(context, nodes).every((held) => parts.every((one) => heldAt(held.node, one, context.rules) === undefined));
}
