// The context an undone or redone change was made in, given back to the editor (decisoes.md, DCS-009 and DCS-016): the
// breakpoint (the one recorded, else the project's base when it is gone), the style state, the class the Style tab
// targets, and — when the change was made on a keyframe — the Timeline open on that keyframe. A change made off every
// keyframe leaves the Timeline as the person has it. The core store asks this on every undo and redo through its
// restoreContext option (src/core/store/store.ts), so the editor shows the layer the step changed.
import type { EditContext, StoreState } from '../../core/store/store.ts';
import { baseBreakpointOf, breakpointById } from '../../core/document/breakpoints.ts';
import type { EditorUi } from '../state.ts';
import { atKeyframe } from '../timeline/playhead.ts';
import { activeBreakpoint, choosing } from './breakpoints.ts';
import { BASE_STATE, goneParentClass } from './style-state.ts';

export function restoreEditContext(state: StoreState<EditorUi>, context: EditContext): EditorUi {
  let ui = state.ui;
  if (context.layer !== undefined) {
    const breakpoint = breakpointById(state.document, context.layer.breakpoint) ?? baseBreakpointOf(state.document);
    if (activeBreakpoint({ document: state.document, ui }).id !== breakpoint.id) {
      // a width typed for the viewport goes with the breakpoint it was typed on, as view.setBreakpoint drops it
      const { viewportWidth: _width, ...rest } = ui;
      void _width;
      ui = { ...rest, preferences: choosing(ui, breakpoint) };
    }
    const { styleState: _state, ...stateless } = ui;
    void _state;
    // a parent state whose class the step took out of the project (a redone delete of its last element) gives Base
    ui = context.layer.state === BASE_STATE.id || goneParentClass(state.document, context.layer.state) !== null ? stateless : { ...stateless, styleState: context.layer.state };
  }
  if ('styleClass' in context) {
    const { styleTarget: _target, ...untargeted } = ui;
    void _target;
    ui = context.styleClass === null || context.styleClass === undefined ? untargeted : { ...untargeted, styleTarget: context.styleClass };
  }
  if (context.keyframe !== null && context.keyframe !== undefined) ui = atKeyframe({ ...state, ui }, context.keyframe) ?? ui;
  return ui;
}
