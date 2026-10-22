import { describe, expect, it } from 'vitest';
import type { DocumentJson } from '../../core/document/model.ts';
import { documentOf, node } from '../../core/testing/handlers.ts';
import { manualClock } from '../../core/ports/clock.ts';
import { anyCss } from '../../core/ports/css.ts';
import { sequentialIds } from '../../core/ports/ids.ts';
import { createEditorStore, type EditorStore } from '../store.ts';
import { motionContext, motionUiOf, nextPreviewTime, recordTarget, shownTimeline } from './state.ts';
import { motionDragArgs, motionPress } from './pointer.ts';

// A project with a timeline the Hero plays, keyed: opacity from 0 at 0 s to 1 at 0.6 s, a marker at 1 s.
function project(): DocumentJson {
  return documentOf({
    pages: [{ id: 'p', name: 'Home', file: 'index.html', tree: node('root', 'page', 'body', { name: 'Page', children: [node('hero', 'section', 'section', { name: 'Hero', motions: [{ id: 'm', trigger: { kind: 'click' }, timeline: 'Intro', control: 'play' }] })] }) }],
    motionTimelines: [
      {
        id: 't',
        name: 'Intro',
        markers: [{ id: 'mk', name: 'Peak', time: 1000 }],
        actions: [
          { id: 'a', target: { kind: 'self' }, start: 0, duration: 600, effect: { kind: 'animate', tracks: [{ id: 'o', property: 'opacity', keyframes: [{ id: 'k0', time: 0, value: '0' }, { id: 'k1', time: 600, value: '1' }] }] } },
          { id: 'b', target: { kind: 'self' }, start: 800, duration: 400, effect: { kind: 'wait' } },
        ],
      },
      { id: 't2', name: 'Spare', markers: [], actions: [] },
    ],
  });
}

function store(): EditorStore {
  return createEditorStore({ storage: { read: () => null, write: () => undefined }, ids: sequentialIds('n'), clock: manualClock(), restored: { document: project(), selection: ['hero'] }, ports: { readOnly: () => false, css: anyCss } });
}
const run = (made: EditorStore, id: string, args: Record<string, unknown> = {}) => (made.dispatch as (id: string, args: unknown) => { status: string })(id, args);

describe('the Timeline\'s editor state', () => {
  it('shows the timeline it names, else the one the selected element plays', () => {
    const made = store();
    expect(shownTimeline(made.getState())).toBe('Intro');
    run(made, 'motion.openTimeline', { timeline: 'Spare' });
    expect(shownTimeline(made.getState())).toBe('Spare');
    expect(run(made, 'motion.openTimeline', { timeline: 'Ghost' }).status).toBe('refused');
  });

  it('moves the playhead, zooms about it, selects bars and keyframes, adding with Shift', () => {
    const made = store();
    run(made, 'motion.setPlayhead', { time: 1500.4 });
    expect(motionUiOf(made.getState().ui)).toMatchObject({ time: 1500, previewing: true });
    run(made, 'motion.zoomTimeline', { factor: 2 });
    expect(motionUiOf(made.getState().ui).pixelsPerSecond).toBe(400);
    run(made, 'motion.select', { timeline: 'Intro', at: 0 });
    run(made, 'motion.select', { timeline: 'Intro', at: 1, add: true });
    expect(motionUiOf(made.getState().ui).selectedActions).toEqual(['a', 'b']);
    run(made, 'motion.select', { timeline: 'Intro', at: 0, add: true });
    expect(motionUiOf(made.getState().ui).selectedActions).toEqual(['b']);
    run(made, 'motion.select', { timeline: 'Intro', at: 0, property: 'opacity', keyframeAt: 1 });
    expect(motionUiOf(made.getState().ui)).toMatchObject({ selectedActions: [], selectedKeyframes: [{ action: 'a', track: 'o', keyframe: 'k1' }] });
  });

  it('copies the selected keyframes, records, snaps, previews and runs, none of it an undo step', () => {
    const made = store();
    run(made, 'motion.select', { timeline: 'Intro', at: 0, property: 'opacity', keyframeAt: 0 });
    run(made, 'motion.select', { timeline: 'Intro', at: 0, property: 'opacity', keyframeAt: 1, add: true });
    run(made, 'motion.copyKeyframes');
    expect(motionUiOf(made.getState().ui).clipboard).toEqual([{ property: 'opacity', offset: 0, value: '0' }, { property: 'opacity', offset: 600, value: '1' }]);
    run(made, 'motion.toggleRecord');
    run(made, 'motion.setPlayhead', { time: 300 });
    expect(recordTarget(made.getState())).toEqual({ timeline: 'Intro', time: 300, action: null });
    expect(motionContext(made.getState())).toEqual({ playhead: 300, recording: { timeline: 'Intro', time: 300, action: null } });
    run(made, 'motion.toggleSnap');
    expect(motionUiOf(made.getState().ui).snapOff).toBe(true);
    run(made, 'motion.preview', { operation: 'play' });
    expect(nextPreviewTime(made.getState(), 500)).toEqual({ time: 800, ended: false });
    expect(nextPreviewTime(made.getState(), 5000)).toEqual({ time: 1200, ended: true });
    // Play with the playhead at the end plays again from the start
    run(made, 'motion.preview', { operation: 'pause' });
    run(made, 'motion.setPlayhead', { time: 1200 });
    run(made, 'motion.preview', { operation: 'play' });
    expect(motionUiOf(made.getState().ui)).toMatchObject({ time: 0, playing: true });
    run(made, 'motion.preview', { operation: 'stop' });
    expect(motionUiOf(made.getState().ui)).toMatchObject({ time: 0 });
    expect(motionUiOf(made.getState().ui).previewing).toBeUndefined();
    run(made, 'motion.toggleRun');
    expect(motionUiOf(made.getState().ui).running).toBe(true);
    expect(made.getState().history.past).toHaveLength(0);
  });

  it('records an inspector change into the timeline at the playhead, one undo step', () => {
    const made = store();
    run(made, 'motion.select', { timeline: 'Intro', at: 0 });
    run(made, 'motion.toggleRecord');
    run(made, 'motion.setPlayhead', { time: 300 });
    run(made, 'style.set', { property: 'opacity', value: '50%' });
    const effect = made.getState().document.motionTimelines?.[0]?.actions[0]?.effect;
    expect(effect?.kind === 'animate' ? effect.tracks[0]?.keyframes.map((keyframe) => [keyframe.time, keyframe.value]) : null).toEqual([[0, '0'], [300, '0.5'], [600, '1']]);
    expect(made.getState().history.past).toHaveLength(1);
  });
});

describe('the Timeline\'s drags, for the pointer owner', () => {
  it('turns a bar\'s travel into a snapped delta of the selected bars it belongs to', () => {
    const made = store();
    run(made, 'motion.select', { timeline: 'Intro', at: 0 });
    run(made, 'motion.select', { timeline: 'Intro', at: 1, add: true });
    const press = motionPress('motion-bar', { timeline: 'Intro', at: 1, action: 'b' }, 100, 300);
    // 39 px is 195 ms: the group's leading edge (0) lands on the grid at 200
    expect(motionDragArgs(press, made.getState(), 339, false)).toEqual({ timeline: 'Intro', actions: ['a', 'b'], delta: 200, distance: 39 });
    // Alt held: no snapping
    expect(motionDragArgs(press, made.getState(), 339, true)).toMatchObject({ delta: 195 });
  });

  it('resizes an edge to the marker it comes near, moves a keyframe, a marker and the playhead', () => {
    const made = store();
    const end = motionPress('motion-bar-end', { timeline: 'Intro', at: 1, action: 'b' }, 0, 0);
    // the end at 1.2 s dragged 39 px back (195 ms) to 1.005 s: within 6 px of the marker at 1 s
    expect(motionDragArgs(end, made.getState(), -39, false)).toEqual({ timeline: 'Intro', action: 'b', edge: 'end', delta: -200, distance: -39 });
    const keyframe = motionPress('motion-keyframe', { timeline: 'Intro', keyframe: { action: 'a', track: 'o', keyframe: 'k1' } }, 0, 0);
    expect(motionDragArgs(keyframe, made.getState(), -20, false)).toMatchObject({ keyframes: [{ action: 'a', track: 'o', keyframe: 'k1' }], delta: -100 });
    const marker = motionPress('motion-marker', { timeline: 'Intro', marker: 'mk' }, 0, 0);
    expect(motionDragArgs(marker, made.getState(), 40, false)).toMatchObject({ marker: 'mk', delta: 200 });
    const playhead = motionPress('motion-playhead', {}, 50, 0);
    expect(motionDragArgs(playhead, made.getState(), 170, false)).toEqual({ time: 600, distance: 170 });
  });
});
