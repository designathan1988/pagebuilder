// The canvas's motion (spec motion-preview): what the canvas frame (src/editor/canvas/frame.tsx) runs inside its
// iframe for motion — the interactions while Run interactions is on, the open timeline at the playhead while the
// Timeline previews — and the walk of the playhead while the preview plays. One hook, called by the frame with a
// reader of its iframe's window and the page it shows: the frame stays the only reader of its iframe (lint rule
// builder/frame-owner), and the runtime is the page's own (canvas.ts).
//  - The frame calls it before its renderer's effect, so this hook's document listener runs first: the runtime is
//    stopped (the page put back as it was) before the renderer applies a change, and started again after it, so it
//    never holds an element the renderer replaced. Another page shown starts it anew.
//  - A problem the runtime meets is said in the status bar in the person's words (motion.runtime.<code>): a media the
//    browser would not play, a clipboard it refused, a Lottie file or a timeline not in the project. An action that
//    failed is a defect as well, and the incident feed (core/incidents.ts) records it; nothing is swallowed.
import { useEffect } from 'react';
import { message } from '../../core/commands/registry.ts';
import { reportError } from '../../core/incidents.ts';
import type { MessageId } from '../../generated/ids.ts';
import { camel } from './ui/options.ts';
import { locate, walk } from '../../core/document/model.ts';
import { motionsOf } from '../../core/motion/document.ts';
import { systemClock } from '../../core/ports/clock.ts';
import type { EditorStore } from '../store.ts';
import { layeredRules, useStore } from '../store.ts';
import { canvasSelector, previewOnCanvas, runOnCanvas } from './canvas.ts';
import type { MotionController } from './runtime/start.ts';
import { motionUiOf, nextPreviewTime, shownTimeline } from './state.ts';
import { MOTION_DOORS, motionDoor } from './ui/doors.ts';

// the runtime's problem that is a defect of the application, not of the page or the browser
const ACTION_FAILED = 'action-failed';

// the commands the walk of the playhead runs, read from their doors (the ruler's drag, the preview's Pause)
const commandOf = (door: string): string => motionDoor(door).command.id;

// The runtime of the canvas for the store's state now: run mode, the preview, or nothing.
function start(store: EditorStore, view: Window | null): MotionController | null {
  if (view === null || view.document.body === null) return null;
  const state = store.getState();
  const motion = motionUiOf(state.ui);
  const report = (problem: { readonly code: string; readonly detail: string }) => {
    store.notice(message(`motion.runtime.${camel(problem.code)}` as MessageId, { detail: problem.detail }));
    if (problem.code === ACTION_FAILED) reportError(`motion ${problem.code}`, problem.detail);
  };
  const rules = layeredRules(state);
  if (motion.running === true) return runOnCanvas(view, state.document, rules, report);
  if (motion.previewing !== true) return null;
  const controller = previewOnCanvas(view, state.document, rules, report);
  draw(store, view, controller);
  return controller;
}

// The open timeline drawn at the playhead: on every element that plays it, else on the selected element.
function draw(store: EditorStore, view: Window | null, controller: MotionController | null): void {
  if (controller === null || view === null) return;
  const state = store.getState();
  const name = shownTimeline(state);
  if (name === null) return;
  const primary = state.selection[0];
  const selected = primary === undefined || locate(state.document, primary) === null ? null : view.document.querySelector(canvasSelector(primary));
  const plays = state.document.pages.some((page) => [...walk(page.tree)].some((node) => motionsOf(node).some((motion) => motion.timeline === name)));
  controller.preview(name, motionUiOf(state.ui).time, plays ? null : selected);
}

export function useCanvasMotion(frameWindow: () => Window | null, page: unknown): void {
  const store = useStore();
  useEffect(() => {
    let controller: MotionController | null = null;
    let mode = '';
    const modeOf = (): string => {
      const motion = motionUiOf(store.getState().ui);
      return motion.running === true ? 'run' : motion.previewing === true ? `preview:${shownTimeline(store.getState()) ?? ''}` : '';
    };
    const restart = (): void => {
      controller?.dispose();
      controller = start(store, frameWindow());
      mode = modeOf();
    };
    // the canvas renders a document change: the runtime lets go first, and starts again on what it rendered
    const stopDocument = store.subscribeDocument(() => {
      if (controller === null) return;
      controller.dispose();
      controller = null;
      queueMicrotask(restart);
    });
    let time = motionUiOf(store.getState().ui).time;
    const stopState = store.subscribe(() => {
      if (modeOf() !== mode) {
        restart();
        return;
      }
      const now = motionUiOf(store.getState().ui).time;
      if (now !== time && mode.startsWith('preview:')) draw(store, frameWindow(), controller);
      time = now;
    });
    restart();
    // the playhead walks while the preview plays, and stops at the timeline's end
    let last = systemClock.now();
    let tick = 0;
    const walk = (): void => {
      tick = window.requestAnimationFrame(walk);
      const at = systemClock.now();
      const elapsed = at - last;
      last = at;
      if (store.gestureOpen()) return;
      const next = nextPreviewTime(store.getState(), elapsed);
      if (next === null) return;
      const dispatch = store.dispatch as (id: string, args: unknown) => unknown;
      dispatch(commandOf(MOTION_DOORS.playhead), { time: next.time });
      // a one-time show of an effect just picked stops at its end (the element back to its own styles); a play of the
      // Timeline holds its last frame
      const once = motionUiOf(store.getState().ui).showing === true;
      if (next.ended) dispatch(commandOf(MOTION_DOORS.preview(once ? 'stop' : 'pause')), { operation: once ? 'stop' : 'pause' });
    };
    tick = window.requestAnimationFrame(walk);
    return () => {
      window.cancelAnimationFrame(tick);
      stopDocument();
      stopState();
      controller?.dispose();
    };
    // a new page shown is a new runtime
  }, [frameWindow, store, page]);
}
