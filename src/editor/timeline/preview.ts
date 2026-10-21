// The timeline's preview (spec timeline-preview): timeline.play, timeline.pause,
// timeline.stop and timeline.toggleLoop hold `ui.timeline` (playing, loop), and the canvas draws the shown animation at
// the playhead (render.ts `previewTimeline`: the animation properties with the playhead as a negative delay and the
// play state), so Play animates the element from the stored keyframes, Pause freezes it where the playhead is and Stop
// puts the element back to its base styles. Previewing never changes the document and records no undo step.
// While it plays, the canvas frame runs the editor's own loop (installPlayingLoop): the playhead walks the shown
// animation's length so the marker follows, and it stops at the animation's end (or repeats while Loop is on).
import { message, registerHandler } from '../../core/commands/registry.ts';
import { durationMs } from '../../core/animation/animation.ts';
import { systemClock } from '../../core/ports/clock.ts';
import { numberConstant } from '../../manifest/runtime.ts';
import type { StoreState } from '../../core/store/store.ts';
import type { EditorStore } from '../store.ts';
import { PLAYHEAD_DOOR, shownAnimation, timelineOf } from './playhead.ts';
import type { EditorUi } from '../state.ts';

export const playCommand = registerHandler<'timeline.play', EditorUi>('timeline.play', ({ state }) => {
  const shown = shownAnimation(state);
  if (shown === null) return { kind: 'change' };
  // a playhead at the animation's end plays it again from the start (the audit's STYLE-10: the loop's first tick saw
  // the end and paused, so Play did nothing until Stop)
  const timeline = timelineOf(state.ui);
  const duration = durationMs(shown.animation);
  const time = duration > 0 && timeline.time >= duration ? 0 : timeline.time;
  return { kind: 'change', ui: { ...state.ui, timeline: { ...timeline, time, live: true, playing: true } }, message: message('status.timeline.playing', { name: shown.animation.name }) };
});

export const pauseCommand = registerHandler<'timeline.pause', EditorUi>('timeline.pause', ({ state }) => {
  const timeline = timelineOf(state.ui);
  if (timeline.playing !== true) return { kind: 'change' };
  const { playing: _dropped, ...rest } = timeline;
  void _dropped;
  return { kind: 'change', ui: { ...state.ui, timeline: rest }, message: message('status.timeline.paused', { time: Math.round(timeline.time) }) };
});

export const stopCommand = registerHandler<'timeline.stop', EditorUi>('timeline.stop', ({ state }) => {
  const timeline = timelineOf(state.ui);
  const { playing: _playing, live: _live, ...rest } = timeline;
  void _playing;
  void _live;
  return { kind: 'change', ui: { ...state.ui, timeline: { ...rest, time: 0 } }, message: message('status.timeline.stopped') };
});

export const toggleLoopCommand = registerHandler<'timeline.toggleLoop', EditorUi>('timeline.toggleLoop', ({ state }) => {
  const timeline = timelineOf(state.ui);
  const { loop: _dropped, ...rest } = timeline;
  void _dropped;
  const next = timeline.loop === true ? rest : { ...rest, loop: true as const };
  return { kind: 'change', ui: { ...state.ui, timeline: next }, message: message(timeline.loop === true ? 'status.timeline.loopOff' : 'status.timeline.loopOn') };
});

// What the canvas draws while the timeline previews the shown animation (frame.tsx hands it to the renderer's
// previewTimeline): the element, the animation's name, where the playhead sits and whether it plays and loops. Null
// while nothing is previewed (Stop, or no animation shown), when the element draws its own styles.
export function timelinePreview(state: StoreState<EditorUi>): { readonly node: string; readonly animation: string; readonly time: number; readonly playing: boolean; readonly loop: boolean } | null {
  const timeline = timelineOf(state.ui);
  const shown = shownAnimation(state);
  if (shown === null || timeline.live !== true) return null;
  return { node: shown.node.id, animation: shown.animation.name, time: timeline.time, playing: timeline.playing === true, loop: timeline.loop === true };
}

// The walk of the playhead while the shown animation plays, run by the canvas frame (frame.tsx): every
// timeline.playheadTick ms the playhead moves on by what has passed since the last look, and it stops at the
// animation's end (or wraps while Loop is on, as the running animation itself does). Returns its removal.
export function installPlayingLoop(store: EditorStore): () => void {
  if (typeof window === 'undefined') return () => {};
  const dispatch = store.dispatch as (id: string, args: unknown) => unknown;
  const setPlayhead = PLAYHEAD_DOOR?.command.id;
  if (setPlayhead === undefined) return () => {};
  let frame = 0;
  let last = systemClock.now();
  const tick = () => {
    frame = window.requestAnimationFrame(tick);
    const at = systemClock.now();
    const state = store.getState();
    const timeline = timelineOf(state.ui);
    if (timeline.playing !== true) {
      // the clock is read while it does not play too, so a Play never jumps by the time it waited
      last = at;
      return;
    }
    if (at - last < numberConstant('timeline.playheadTick')) return;
    // a gesture holds the store (a drag, an open colour picker): the playhead waits for it, and resumes from where the
    // clock is then — a dispatch now would throw ("a gesture is open") on every frame
    if (store.gestureOpen()) {
      last = at;
      return;
    }
    const shown = shownAnimation(state);
    if (shown === null) return;
    const duration = durationMs(shown.animation);
    if (duration <= 0) return;
    let next = timeline.time + (at - last);
    last = at;
    if (next >= duration) {
      if (timeline.loop === true) next %= duration;
      else {
        dispatch(setPlayhead, { time: duration });
        dispatch(pauseCommand.command, {});
        return;
      }
    }
    dispatch(setPlayhead, { time: Math.round(next) });
  };
  frame = window.requestAnimationFrame(tick);
  return () => window.cancelAnimationFrame(frame);
}
