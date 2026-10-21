// The pointer owner's gesture state machine and how a press finds its door, from the manifest's data.
import { describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD, IDLE, clickDoor, step, type Machine, type Press } from './pointer.ts';

const node: Press = { on: 'node', node: 'n1', root: false };
const root: Press = { on: 'node', node: 'n0', root: true };
const stage: Press = { on: 'stage' };

describe('the gesture state machine', () => {
  it('opens a gesture on a press and commits it on the release', () => {
    const down = step(IDLE, { type: 'down', pointer: 1, at: { x: 10, y: 10 }, press: node });
    expect(down.effect).toBe('press');
    expect(down.machine.phase).toBe('pressed');
    const up = step(down.machine, { type: 'up', pointer: 1 });
    expect(up).toEqual({ machine: IDLE, effect: 'commit' });
  });

  it('stays a click below drag.threshold and becomes a drag at it', () => {
    expect(DRAG_THRESHOLD).toBe(4);
    const pressed = step(IDLE, { type: 'down', pointer: 1, at: { x: 0, y: 0 }, press: node }).machine;
    const small = step(pressed, { type: 'move', pointer: 1, at: { x: 2, y: 3 } });
    expect(small).toEqual({ machine: pressed, effect: null });
    const far = step(pressed, { type: 'move', pointer: 1, at: { x: 0, y: 4 } });
    expect(far.effect).toBe('drag');
    expect(far.machine.phase).toBe('dragging');
    // once dragging, further moves start nothing new, and the release commits the one gesture
    const on = step(far.machine, { type: 'move', pointer: 1, at: { x: 50, y: 50 } });
    expect(on.effect).toBeNull();
    expect(step(on.machine, { type: 'up', pointer: 1 }).effect).toBe('commit');
  });

  it('cancels an open gesture, and a cancel with none open does nothing', () => {
    const pressed = step(IDLE, { type: 'down', pointer: 1, at: { x: 0, y: 0 }, press: node }).machine;
    expect(step(pressed, { type: 'cancel' })).toEqual({ machine: IDLE, effect: 'cancel' });
    expect(step(IDLE, { type: 'cancel' })).toEqual({ machine: IDLE, effect: null });
  });

  it('restarts on another pointer pressed while a gesture is open (DEF-0556), ignores its moves and releases, and moves and releases with none open', () => {
    const pressed: Machine = step(IDLE, { type: 'down', pointer: 1, at: { x: 0, y: 0 }, press: node }).machine;
    expect(step(pressed, { type: 'down', pointer: 2, at: { x: 9, y: 9 }, press: stage })).toEqual({ machine: { phase: 'pressed', pointer: 2, press: stage, start: { x: 9, y: 9 } }, effect: 'restart' });
    expect(step(pressed, { type: 'move', pointer: 2, at: { x: 90, y: 90 } })).toEqual({ machine: pressed, effect: null });
    expect(step(pressed, { type: 'up', pointer: 2 })).toEqual({ machine: pressed, effect: null });
    expect(step(IDLE, { type: 'move', pointer: 1, at: { x: 1, y: 1 } })).toEqual({ machine: IDLE, effect: null });
    expect(step(IDLE, { type: 'up', pointer: 1 })).toEqual({ machine: IDLE, effect: null });
  });
});

describe('the door of a press', () => {
  it('finds each canvas click by its target, button, count and modifier', () => {
    expect(clickDoor(node, 'primary', 1, null)?.ref).toBe('selection.select#canvas-click-element-or-page');
    expect(clickDoor(root, 'primary', 1, null)?.ref).toBe('selection.select#canvas-click-element-or-page');
    expect(clickDoor(stage, 'primary', 1, null)?.ref).toBe('selection.clear#canvas-click-stage-outside-page');
    expect(clickDoor(node, 'primary', 1, 'Shift')?.ref).toBe('selection.add#canvas-click-element-shift');
    expect(clickDoor(node, 'primary', 1, 'Ctrl')?.ref).toBe('selection.toggle#canvas-click-element-ctrl');
    expect(clickDoor(node, 'secondary', 1, null)?.ref).toBe('contextMenu.open#canvas-right-click-element-or-page');
  });

  it('finds none where no door takes the press', () => {
    // the page root is no "element": Shift on the page adds nothing
    expect(clickDoor(root, 'primary', 1, 'Shift')).toBeNull();
    expect(clickDoor(stage, 'secondary', 1, null)).toBeNull();
    expect(clickDoor(node, 'primary', 1, 'several')).toBeNull();
  });
});
