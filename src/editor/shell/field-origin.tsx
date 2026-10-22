// A Style field's detailed origin note (spec inspector-provenance-reset, Problems in Pager 6): shown under the focused
// field, while field-face.tsx carries the compact badge at rest. The note's legend colour and source come from the one
// rule of inspector/origin.ts: set at the edited breakpoint (away from the base layer), from a larger breakpoint or the
// base state, from a class, inherited from an ancestor (named). Nothing for a value of the target's own at the base
// layer nor for the default, whose placeholder already wears the Default colour. While the field holds the focus and
// its value comes from elsewhere, a second line says where typing writes: the target (the element, or the class while
// it is the target) at the edited breakpoint and state.
import { useEffect, useState } from 'react';
import type { DoorEntry } from '../../manifest/runtime.ts';
import { editedProperties } from '../inspector/sections.ts';
import { valueOrigin } from '../inspector/origin.ts';
import { styleClassOf } from '../inspector/style-target.ts';
import { locate } from '../../core/document/model.ts';
import { layeredRules, useEditorState } from '../store.ts';
import { useT } from '../text.ts';
import { breakpointById, breakpointName as nameOf } from '../../core/document/breakpoints.ts';
import { stateName, styleStateOf } from '../view/style-state.ts';

// whether the focus is inside the field whose door is this one (the focus is the page's, not the store's)
const focusInside = (ref: string) => document.activeElement instanceof Element && document.activeElement.closest(`[data-door="${CSS.escape(ref)}"]`) !== null;
function useFocusWithin(ref: string): boolean {
  const [focused, setFocused] = useState(() => focusInside(ref));
  useEffect(() => {
    const update = () => setFocused(focusInside(ref));
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, [ref]);
  return focused;
}

export function FieldOrigin({ entry, target }: { readonly entry: DoorEntry; readonly target: string | null }) {
  const t = useT();
  // the origin as one text, so the hook's answer is stable while nothing changes
  const said = useEditorState((s) => {
    if (target === null) return '';
    const origin = valueOrigin(s, editedProperties(target), layeredRules(s));
    if (origin === null) return '';
    if (origin.kind === 'class') return `class|${origin.name}`;
    if (origin.kind === 'inherited') return `inherited|${origin.from}`;
    if (origin.kind === 'default') return 'default';
    const rules = layeredRules(s);
    const atBase = origin.kind === 'here' && rules.base.breakpoint === rules.baseLayer.breakpoint && rules.base.state === rules.baseLayer.state;
    return atBase ? 'own' : `${origin.kind}|${origin.breakpoint}|${origin.state}`;
  });
  // where typing writes: the target and the edited layer
  const writes = useEditorState((s) => {
    const rules = layeredRules(s);
    const cls = styleClassOf(s);
    const primary = s.selection[0];
    const name = cls !== null ? `.${cls}` : primary === undefined ? '' : (locate(s.document, primary)?.node.name ?? '');
    return `${name}|${rules.base.breakpoint}|${rules.base.state}|${rules.baseLayer.state}`;
  });
  const focused = useFocusWithin(entry.ref);
  const [kind = '', first = '', second = ''] = said.split('|');
  const table = useEditorState((s) => s.document.breakpoints);
  const breakpointName = (id: string) => {
    const found = breakpointById({ breakpoints: table }, id);
    return found === undefined ? id : nameOf(found, t);
  };
  // a state of properties.json, a child position or a parent state, by its name (view/style-state.ts)
  const nameOfState = (id: string) => stateName(styleStateOf(id), t);
  const note =
    kind === 'here'
      ? t('inspector.origin.here', { breakpoint: breakpointName(first) })
      : kind === 'breakpoint' || kind === 'state'
        ? t('inspector.origin.from', { source: kind === 'state' ? `${breakpointName(first)} · ${nameOfState(second)}` : breakpointName(first) })
        : kind === 'class'
          ? t('inspector.fromClass', { name: first })
          : kind === 'inherited'
            ? t('inspector.origin.inherited', { name: first })
            : null;
  const elsewhere = kind === 'breakpoint' || kind === 'state' || kind === 'class' || kind === 'inherited';
  const [writer = '', breakpoint = '', state = '', baseState = ''] = writes.split('|');
  const layer = state === baseState ? breakpointName(breakpoint) : `${breakpointName(breakpoint)} · ${nameOfState(state)}`;
  return (
    <>
      {note !== null ? (
        <div className={`field-origin${focused ? ' is-focused' : ''}`} data-origin={kind} data-field={entry.ref}>
          {note}
        </div>
      ) : null}
      {focused && elsewhere && writer !== '' ? (
        <div className="field-writes" data-field={entry.ref}>
          {t('inspector.origin.writes', { target: writer, layer })}
        </div>
      ) : null}
    </>
  );
}
