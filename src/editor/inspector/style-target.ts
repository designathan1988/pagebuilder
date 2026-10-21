// The style target (spec shared-style-classes): what the Style tab's writes go to, the
// selected elements themselves (the Element chip) or one class every selected element lists (its chip).
// inspector.setStyleTarget chooses it; it is editor state: nothing in the document changes and nothing is recorded.
//  - A class target holds only while the project has the class and every selected element lists it
//    (core/design/classes.ts classTarget): a class detached or undone away makes the target Element again, and a new
//    selection returns it to Element (followSelection).
//  - The store hands the class to every handler (HandlerContext.styleClass); core/style/set.ts writes into it.
//  - What the Style tab's fields read (styleSource): the primary element, or, while a class is the target, the primary
//    element holding the class's styles; and, with the Element target, the class a value comes from when the element
//    holds none of its own (cascadeSource, in the stylesheet's order; inspector/origin.ts names it).
import { message, registerHandler } from '../../core/commands/registry.ts';
import type { Command } from '../../manifest/schema.ts';
import { classTarget, classesOf, missingClassDefinitions, renameClassCommand } from '../../core/design/classes.ts';
import { locate, type DocNode, type DocumentJson } from '../../core/document/model.ts';
import type { ModelRules } from '../../core/document/validate.ts';
import type { StoreState } from '../../core/store/store.ts';
import { shownValue } from '../../core/style/set.ts';
import type { EditorUi } from '../state.ts';
import { keyframeAtPlayhead } from '../timeline/playhead.ts';
import { activeLayer } from '../view/style-state.ts';

type State = StoreState<EditorUi>;

// the class that is the style target now, or null for the Element target
export const styleClassOf = (state: State): string | null => classTarget(state.document, state.selection, state.ui.styleTarget ?? null)?.styleClass.name ?? null;

const ELEMENT = 'element';

export const setStyleTarget = registerHandler<'inspector.setStyleTarget', EditorUi>(
  'inspector.setStyleTarget',
  ({ state }, { target, className }) => {
    const { styleTarget: _dropped, ...rest } = state.ui;
    void _dropped;
    // A class imported before the project registry existed is still an applied class. Its first
    // target click registers one empty definition as an undoable repair, then selects that target.
    if (target !== ELEMENT && className !== undefined && !classesOf(state.document).some((styleClass) => styleClass.name === className)) {
      const selected = state.selection.map((id) => locate(state.document, id)?.node);
      if (selected.length > 0 && selected.every((node) => node !== undefined && node.classes.includes(className)))
        return { kind: 'change', patches: missingClassDefinitions(state.document, [className]), ui: { ...rest, styleTarget: className }, message: message('status.classes.registered', { name: className }) };
    }
    // a class every selected element lists, else the Element target
    const name = target === ELEMENT || className === undefined ? null : classTarget(state.document, state.selection, className)?.styleClass.name ?? null;
    if (name === (state.ui.styleTarget ?? null)) return { kind: 'change' };
    return { kind: 'change', ui: name === null ? rest : { ...rest, styleTarget: name } };
  },
  (state, args) => {
    const now = styleClassOf(state as State);
    return args.target === ELEMENT ? now === null : now !== null && now === args.className;
  },
);

// A new selection starts with the Element target.
export function targetOffSelection(state: State): EditorUi {
  if (state.ui.styleTarget === undefined) return state.ui;
  const { styleTarget: _dropped, ...rest } = state.ui;
  void _dropped;
  return rest;
}

// The node the Style tab's fields read: the primary selected element, or, while a class is the target, the primary
// element holding the class's styles; null with nothing selected. While the timeline's playhead sits on a keyframe of
// that element, the fields read the keyframe's declarations (spec timeline-keyframes: the inspector edits the
// keyframe's values then, and a badge says so), given the shape a style layer has so every reader of a field's value
// reads it as usual.
export function styleSource(state: State): DocNode | null {
  const primary = state.selection[0];
  const node = primary === undefined ? null : (locate(state.document, primary)?.node ?? null);
  if (node === null) return null;
  const at = keyframeAtPlayhead(state);
  if (at !== null && at.node.id === node.id) {
    const layer = activeLayer(state);
    return { ...node, styles: { [layer.breakpoint]: { [layer.state]: at.keyframe.declarations } } };
  }
  const target = classTarget(state.document, state.selection, state.ui.styleTarget ?? null);
  return target === null ? node : { ...node, styles: target.styleClass.styles };
}

// Where a node's value of a property comes from on the page, as the stylesheet decides it (core/render/output.ts writes
// every class, in the project's order, before the elements): the node's own value at the edited layer or the nearest
// one up the cascade (className null), else the last class it lists that holds one there; with the layer it was found
// at. Null when neither sets it (the node inherits it or takes the default).
// A state's rule outranks every base rule (a class's `.card:hover` beats the element's own base rule; the audit's
// STYLE-9), so the edited state is looked for first, in the node's own values and then the classes', and the base
// state only when no holder sets the property at the edited one.
export function cascadeSource(doc: DocumentJson, node: DocNode, property: string, rules: ModelRules): { readonly breakpoint: string; readonly state: string; readonly className: string | null } | null {
  const holders = [{ styles: node.styles, className: null }, ...[...classesOf(doc)].reverse().flatMap((c) => (node.classes.includes(c.name) ? [{ styles: c.styles, className: c.name }] : []))];
  const states = rules.base.state === rules.baseLayer.state ? [rules.base.state] : [rules.base.state, rules.baseLayer.state];
  for (const state of states)
    for (const holder of holders) {
      // shownValue looks at the edited state and then the base one: a value found at another state waits its turn
      const held = shownValue({ ...node, styles: holder.styles }, property, rules);
      if (held !== undefined && held.state === state) return { breakpoint: held.breakpoint, state: held.state, className: holder.className };
    }
  return null;
}

// The style target follows a class rename (spec shared-style-classes; the interface audit F02): renaming the class the
// Style tab targets moves the target to the renamed class, so the next write still lands on the class instead of
// silently becoming a write on the element. Only a command that changed the document reaches here — a refusal does not.
export function targetFollowsClassRename(state: StoreState<EditorUi>, command: Command, args: Readonly<Record<string, unknown>>): EditorUi {
  if (command.id !== renameClassCommand.command) return state.ui;
  const renamed = typeof args.className === 'string' ? args.className : null;
  const next = typeof args.nextName === 'string' ? args.nextName.trim() : null;
  if (renamed === null || next === null || (state.ui.styleTarget ?? null) !== renamed) return state.ui;
  return { ...state.ui, styleTarget: next };
}
