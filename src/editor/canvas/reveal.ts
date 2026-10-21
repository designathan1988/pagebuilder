// What the person sees of the page on the canvas now, in screen px (DCS-035: the frame is as tall as the page and the
// camera moves it over the stage): the page's view clipped to the stage, below the frame's header of breakpoint tabs
// and badges, which stays pinned to the stage's top while the page's top is above it (shell/canvas.tsx); `hidden` says
// on which sides the page goes on past what is seen. Null with no canvas drawn.
export interface VisiblePage {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly hidden: { readonly left: boolean; readonly top: boolean; readonly right: boolean; readonly bottom: boolean };
}
export function visiblePage(): VisiblePage | null {
  const stage = document.querySelector('[data-canvas-stage]')?.getBoundingClientRect();
  const view = document.querySelector('.frame__view')?.getBoundingClientRect();
  if (stage === undefined || view === undefined) return null;
  const header = document.querySelector('.frame__header')?.getBoundingClientRect();
  const seen = { left: Math.max(stage.left, view.left), top: Math.max(stage.top, view.top, header?.bottom ?? stage.top), right: Math.min(stage.right, view.right), bottom: Math.min(stage.bottom, view.bottom) };
  return { ...seen, hidden: { left: view.left < seen.left - 0.5, top: view.top < seen.top - 0.5, right: view.right > seen.right + 0.5, bottom: view.bottom > seen.bottom + 0.5 } };
}

// The least travel along one axis that brings a box [from, to] inside a view [low, high], its edge `inset` inside the
// view's (canvas/reveal-selection.tsx): 0 while any part of it is already inside; a box above or left of the view
// comes in at the view's start, one below or right of it at the view's end — or at the view's start when it is taller
// than the view holds, so its start (a heading, a label) is what shows.
export function travelInto(from: number, to: number, low: number, high: number, inset: number): number {
  if (to > low && from < high) return 0;
  if (to <= low) return low + inset - from;
  return to - from > high - low - 2 * inset ? low + inset - from : high - inset - to;
}

// The least travel that shows a box [from, to] whole inside a view [low, high], its edges `inset` inside the view's:
// 0 while it is whole inside already; else it comes in at the nearer end — at the view's start when it is taller than
// the view holds, so its start shows. A breakpoint's new width lays the page out anew (canvas/frame.tsx): the selected
// element, partly in view after it, had its top and its label away (DEF-0622).
export function travelWhole(from: number, to: number, low: number, high: number, inset: number): number {
  if (from >= low && to <= high) return 0;
  if (to - from > high - low - 2 * inset || from < low) return low + inset - from;
  return high - inset - to;
}
