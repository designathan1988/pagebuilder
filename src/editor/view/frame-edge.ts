// The frame's edge (spec breakpoints-switch, the plan's stage 2): dragged, the width of the screen the canvas shows
// follows the pointer. The frame stays centred on the stage, so its edge keeps under the pointer when the width
// changes by twice the travel over the zoom; the zoom is the one at the press (a step naming no size starts from the
// width shown; the zoom is read at the press's width, `size`, never at the width the drag shows now, and the canvas
// holds that zoom while the drag lasts: pointer/effects.ts holdZoom, read by shell/canvas.tsx; at Fit it fits again at
// the release). The width is clamped to the screens the canvas shows; the breakpoint that holds it is the one the
// fields edit. Nothing in the document changes.
import { registerHandler } from '../../core/commands/registry.ts';
import { MAX_BREAKPOINT_WIDTH } from '../../core/document/breakpoints.ts';
import type { EditorUi } from '../state.ts';
import { MIN_VIEWPORT_WIDTH, showingWidth, viewportWidth } from './breakpoints.ts';
import { zoomShowing } from './camera.ts';

export const resizeViewport = registerHandler<'view.resizeViewport', EditorUi>('view.resizeViewport', ({ state }, { size, distance }) => {
  const from = size ?? viewportWidth(state);
  const zoom = zoomShowing(state, from);
  const width = Math.round(from + (2 * distance) / (zoom > 0 ? zoom : 1));
  return showingWidth(state, Math.min(MAX_BREAKPOINT_WIDTH, Math.max(MIN_VIEWPORT_WIDTH, width)));
});
