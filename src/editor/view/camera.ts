// The camera (spec zoom-keyboard-buttons, zoom-wheel-pan; the owner's request DCS-035): the canvas works as an
// artboard. The frame is as tall as the whole page and never scrolls inside (canvas/frame.tsx); the camera moves the
// frame over the stage, on both axes, and zooms it. The zoom is a workspace preference (ui.preferences.zoom, in
// percent), restored after a reload; absent, the canvas is in Fit mode: the zoom that fits the active breakpoint's
// width in the stage, with the fit margin on both sides, following every change of the stage's size. Any explicit
// zoom leaves Fit mode until Fit is chosen again, which also brings the page back centred with its top at the margin.
// Zooming
// pivots on the middle of the stage (the keys, the buttons, the menu) or on the pointer (Ctrl+wheel, pinch): the page
// point there stays there, on both axes. view.pan moves the page by the pointer's or the wheel's travel, on both axes,
// freely until only zoom.panKeep screen px of the page stay inside the stage along an axis (the decision of DCS-035).
// The handlers need the stage's place and size and the frame's own measures (the page's height, its header of tabs and
// badges), measures of the layout the canvas registers (registerStage, reportFrame) when a command runs; the handlers
// never read the page.
import { viewportWidth, BASE_BREAKPOINT, type Shown } from './breakpoints.ts';
import { message, registerHandler, type Outcome } from '../../core/commands/registry.ts';
import type { StoreState } from '../../core/store/store.ts';
import type { Page } from '../../core/document/model.ts';
import { openedPage } from '../../core/project/pages.ts';
import { numberConstant } from '../../manifest/runtime.ts';
import type { EditorUi } from '../state.ts';

const STEP = numberConstant('zoom.step');
export const ZOOM_MIN = numberConstant('zoom.min');
export const ZOOM_MAX = numberConstant('zoom.max');
export const FIT_MARGIN = numberConstant('zoom.fitMargin');
const PAN_KEEP = numberConstant('zoom.panKeep');

export interface CameraState {
  // the screen px from the stage's centre to the page's centre, across (0: centred, as Fit shows it)
  readonly panX: number;
  // the page px at the top of the view: the page's top stands FIT_MARGIN below the stage's top (under the frame's
  // header) at 0, and moves up by top × zoom; a page px, so a zoom Fit derives anew keeps the same page line on top
  readonly top: number;
  // the page `top` was set on: another page shown reads 0, so a page opened starts at its top
  readonly forPage: string | null;
}

export const INITIAL_CAMERA: CameraState = { panX: 0, top: 0, forPage: null };

// The stage the canvas lays the page out in: its content box (screen px), measured now.
interface Stage {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}
let stageElement: HTMLElement | null = null;
export function registerStage(element: HTMLElement | null): () => void {
  stageElement = element;
  return () => {
    if (stageElement === element) stageElement = null;
  };
}
function measure(): Stage {
  if (stageElement === null) return { left: 0, top: 0, width: 0, height: 0 };
  const box = stageElement.getBoundingClientRect();
  const style = getComputedStyle(stageElement);
  const px = (value: string): number => parseFloat(value) || 0;
  const left = px(style.paddingLeft) + px(style.borderLeftWidth);
  const top = px(style.paddingTop) + px(style.borderTopWidth);
  return { left: box.left + left, top: box.top + top, width: box.width - left - px(style.paddingRight) - px(style.borderRightWidth), height: box.height - top - px(style.paddingBottom) - px(style.borderBottomWidth) };
}

// The frame's own measures, reported by the canvas as they change (shell/canvas.tsx, canvas/frame.tsx): the page's
// height in page px (the breakpoint's screen at least) and the height of the frame's header (its breakpoint tabs and
// badges) in screen px. The handlers bound the pan with them, as the canvas draws with them.
export interface FrameMeasures {
  readonly extent: number;
  readonly header: number;
}
let reported: FrameMeasures = { extent: 0, header: 0 };
export function reportFrame(measures: FrameMeasures): void {
  reported = measures;
}

// the zoom that fits a page this wide (the active breakpoint's width: view/breakpoints.ts) in a stage this wide, within
// the camera's range — and never above 100 %: Fit shows a page at most at its real size, a phone frame is not blown up
// (the owner's decision D-4, the page builders' and the browsers' responsive views alike; the zoom menu goes further)
export const fitZoom = (width: number, page: number = BASE_BREAKPOINT.width): number => (width > 0 && page > 0 ? Math.min(1, ZOOM_MAX / 100, Math.max(ZOOM_MIN / 100, (width - 2 * FIT_MARGIN) / page)) : 1);

// the zoom the canvas shows, as a factor: the chosen one, or the one that fits the stage
export const zoomOf = (shown: Shown, width: number = measure().width): number => (shown.ui.preferences.zoom !== undefined ? shown.ui.preferences.zoom / 100 : fitZoom(width, viewportWidth(shown)));

// the page the camera's top belongs to: the shown page's id
type Paged = Shown & { readonly document: { readonly pages: readonly Page[] } };
const pageKey = (state: Paged): string | null => state.document.pages[openedPage(state)]?.id ?? null;

// the least of the page an axis keeps inside the stage: zoom.panKeep, or the whole page where it is smaller
const keepOf = (page: number): number => Math.max(0, Math.min(PAN_KEEP, page));
const within = (value: number, low: number, high: number): number => (low <= high ? Math.min(high, Math.max(low, value)) : (low + high) / 2);

// The page's centre's offset from the stage's centre at a zoom, held so that at least the kept part of the page stays
// inside the stage across.
function panXOf(panX: number, page: number, stageWidth: number): number {
  if (stageWidth <= 0) return panX;
  const reach = stageWidth / 2 + page / 2 - keepOf(page);
  return within(panX, -reach, reach);
}

// The frame's left edge from the stage's content box, in screen px, at a zoom (shell/canvas.tsx draws it there).
export function frameLeftOf(shown: Shown, zoom: number, stageWidth: number = measure().width): number {
  const page = viewportWidth(shown) * zoom;
  return Math.round(stageWidth / 2 - page / 2 + panXOf(shown.ui.camera.panX, page, stageWidth));
}

// The page px at the view's top, held so that at least the kept part of the page stays inside the stage down the
// stage: the page's top (FIT_MARGIN + header − top × zoom from the stage's top) above the stage's bottom less the kept
// part, its bottom below the stage's top plus the header pinned there and the kept part (the kept part is seen).
// Unbounded until the canvas has measured its stage and its page (no stage drawn: the Code view, a test's store).
function topWithin(top: number, zoom: number, stageHeight: number, measures: FrameMeasures): number {
  if (!(zoom > 0) || stageHeight <= 0 || measures.extent <= 0) return top;
  const page = measures.extent * zoom;
  const keep = keepOf(page);
  const start = FIT_MARGIN + measures.header;
  return within(top, (start - (stageHeight - keep)) / zoom, (start + page - measures.header - keep) / zoom);
}

// The camera's top for the page shown (0 on a page it was not set on), held within the bounds.
export function topOf(shown: Paged, zoom: number, stageHeight: number = measure().height, measures: FrameMeasures = reported): number {
  const camera = shown.ui.camera;
  return topWithin(camera.forPage === pageKey(shown) ? camera.top : 0, zoom, stageHeight, measures);
}

// The frame's top from the stage's content box, in screen px (its header first, then the page's view).
export const frameTopOf = (top: number, zoom: number): number => Math.round(FIT_MARGIN - top * zoom);

const clamp = (percent: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(percent)));

// the state zoomed to a percent, the page point under the pivot (a screen point; the middle of the stage without one)
// kept there on both axes
function zoomTo(state: StoreState<EditorUi>, percent: number, pivot: { readonly x: number; readonly y: number } | null = null): Outcome<EditorUi> {
  const stage = measure();
  const before = zoomOf(state, stage.width);
  const after = percent / 100;
  const at = pivot !== null ? { x: pivot.x - stage.left, y: pivot.y - stage.top } : { x: stage.width / 2, y: stage.height / 2 };
  const page = viewportWidth(state);
  // across: the page point under the pivot, and the centre offset that puts it back under the pivot at the new zoom
  const pageX = (at.x - frameLeftOf(state, before, stage.width)) / before;
  const panX = at.x - pageX * after - (stage.width / 2 - (page * after) / 2);
  // down: the same, the page's top FIT_MARGIN + header below the stage's top less top × zoom
  const start = FIT_MARGIN + reported.header;
  const pageY = (at.y - (start - topOf(state, before, stage.height) * before)) / before;
  const top = pageY - (at.y - start) / after;
  const camera: CameraState = { panX: panXOf(panX, page * after, stage.width), top: topWithin(top, after, stage.height, reported), forPage: pageKey(state) };
  return { kind: 'change', ui: { ...state.ui, preferences: { ...state.ui.preferences, zoom: percent }, camera }, message: message('status.zoom.set', { zoom: percent }) };
}

// one step in or out, from the zoom shown (Fit's included); at the limit the step is refused and says so
function step(state: StoreState<EditorUi>, by: number): Outcome<EditorUi> {
  const now = Math.round(zoomOf(state) * 100);
  const next = clamp(now + by);
  if (next === now) return { kind: 'refused', message: message('status.zoom.limit') };
  return zoomTo(state, next);
}

export const zoomIn = registerHandler<'view.zoomIn', EditorUi>('view.zoomIn', ({ state }) => step(state, STEP));
export const zoomOut = registerHandler<'view.zoomOut', EditorUi>('view.zoomOut', ({ state }) => step(state, -STEP));
export const zoomReset = registerHandler<'view.zoomReset', EditorUi>('view.zoomReset', ({ state }) => zoomTo(state, 100));

// a level of the zoom menu stands for the zoom chosen at that level
export const zoomToLevel = registerHandler<'view.zoomTo', EditorUi>(
  'view.zoomTo',
  ({ state }, { percent }) => zoomTo(state, clamp(percent)),
  (state, args) => state.ui.preferences.zoom === args.percent,
);

// Fit: back to Fit mode, the page centred with its top at the fit margin; the status bar says the zoom it fitted to
export const zoomFit = registerHandler<'view.zoomFit', EditorUi>(
  'view.zoomFit',
  ({ state }) => {
    const { zoom: _chosen, ...rest } = state.ui.preferences;
    void _chosen;
    return { kind: 'change', ui: { ...state.ui, preferences: rest, camera: { panX: 0, top: 0, forPage: pageKey(state) } }, message: message('status.zoom.fitted', { zoom: Math.round(fitZoom(measure().width, viewportWidth(state)) * 100) }) };
  },
  (state) => state.ui.preferences.zoom === undefined,
);

// Ctrl+wheel: the zoom times the wheel's factor, around the pointer; a notch past the limit is refused and says so
export const zoomAt = registerHandler<'view.zoomAt', EditorUi>('view.zoomAt', ({ state }, { factor, point }) => {
  const now = zoomOf(state) * 100;
  const next = clamp(now * factor);
  if (next === Math.round(now)) return (factor > 1 && next === ZOOM_MAX) || (factor < 1 && next === ZOOM_MIN) ? { kind: 'refused', message: message('status.zoom.limit') } : { kind: 'change' };
  return zoomTo(state, next, point);
});

// The screen travel the camera made between two states at one zoom: what a pan really moved under its bounds, so Esc
// during a pan gives back exactly that (input/pointer/common.ts cancelPan).
export function cameraTravel(before: Paged, after: Paged): { readonly x: number; readonly y: number } {
  const stage = measure();
  const zoom = zoomOf(after, stage.width);
  return { x: frameLeftOf(after, zoom, stage.width) - frameLeftOf(before, zoom, stage.width), y: (topOf(before, zoom, stage.height) - topOf(after, zoom, stage.height)) * zoom };
}

// the page moved by (dx, dy) screen px, on both axes, held within the bounds (the kept part of the page in the stage)
export const pan = registerHandler<'view.pan', EditorUi>('view.pan', ({ state }, { dx, dy }) => {
  const stage = measure();
  const zoom = zoomOf(state, stage.width);
  const page = viewportWidth(state) * zoom;
  const panX = panXOf(panXOf(state.ui.camera.panX, page, stage.width) + dx, page, stage.width);
  const top = zoom > 0 ? topWithin(topOf(state, zoom, stage.height) - dy / zoom, zoom, stage.height, reported) : 0;
  return { kind: 'change', ui: { ...state.ui, camera: { panX, top, forPage: pageKey(state) } } };
});
