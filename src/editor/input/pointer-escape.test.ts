// @vitest-environment happy-dom
// Escape during a drag that writes the editor's own state (a splitter's size, the width the frame's edge sets) puts
// that state back as it was at the press, and the release that follows keeps it there: a cancelled gesture restores
// the document, the selection and the history only, so the pointer owner puts the drag back itself (effects.ts
// endCancelled). The key goes through the real keymap, in the drag key context the open gesture gives it.
import { afterEach, describe, expect, it } from 'vitest';
import { createEditorStore } from '../store.ts';
import { manualClock } from '../../core/ports/clock.ts';
import { sequentialIds } from '../../core/ports/ids.ts';
import { incidents, clearIncidents } from '../../core/incidents.ts';
import { manifest } from '../../manifest/runtime.ts';
import { splitterSize } from '../workspace/layout.ts';
import { viewportWidth } from '../view/breakpoints.ts';
import { installPointer } from './pointer.ts';
import { installKeymap } from './keymap.ts';

const store = () => createEditorStore({ storage: { read: () => null, write: () => undefined }, ids: sequentialIds('n'), clock: manualClock() });
const door = (source: string) => {
  const found = manifest.doors.find((d) => d.door.kind === 'panel-drag' && d.door.source === source);
  if (found === undefined) throw new Error(`no panel drag door from ${source}`);
  return found;
};
const pointer = (type: string, x: number) => new PointerEvent(type, { pointerId: 1, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: 300, bubbles: true, cancelable: true });
const settled = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
  document.body.replaceChildren();
});

// presses the element, drags it 120 px, presses Escape with the button still down, then moves on and releases
async function dragThenEscape(element: HTMLElement, read: () => number | null): Promise<{ before: number | null; during: number | null; escaped: number | null; released: number | null }> {
  const before = read();
  element.dispatchEvent(pointer('pointerdown', 500));
  element.dispatchEvent(pointer('pointermove', 560));
  element.dispatchEvent(pointer('pointermove', 620));
  const during = read();
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
  await settled();
  const escaped = read();
  element.dispatchEvent(pointer('pointermove', 680));
  element.dispatchEvent(pointer('pointerup', 680));
  await settled();
  return { before, during, escaped, released: read() };
}

describe('Escape during a drag of the editor state', () => {
  it('puts a splitter back at the size it had at the press, and the release keeps it', async () => {
    clearIncidents();
    const editor = store();
    cleanups.push(installPointer(editor, window), installKeymap(editor, window));
    const splitter = document.createElement('div');
    splitter.setAttribute('data-door', door('splitter').ref);
    splitter.setAttribute('data-args', JSON.stringify({ splitter: 'inspector-width' }));
    document.body.append(splitter);
    const sizes = await dragThenEscape(splitter, () => splitterSize(editor.getState().ui, 'inspector-width'));
    expect(sizes.during).not.toBe(sizes.before);
    expect(sizes.escaped).toBe(sizes.before);
    expect(sizes.released).toBe(sizes.before);
    expect(editor.getState().history.past).toHaveLength(0);
    expect(editor.getState().message?.key).toBe('status.drag.cancelled');
    expect(incidents()).toEqual([]);
  });

  it('puts the frame edge back at the width the canvas showed at the press', async () => {
    clearIncidents();
    const editor = store();
    cleanups.push(installPointer(editor, window), installKeymap(editor, window));
    const edge = document.createElement('div');
    edge.setAttribute('data-door', door('frame-edge').ref);
    document.body.append(edge);
    const widths = await dragThenEscape(edge, () => viewportWidth(editor.getState()));
    expect(widths.during).not.toBe(widths.before);
    expect(widths.escaped).toBe(widths.before);
    expect(widths.released).toBe(widths.before);
    expect(editor.getState().message?.key).toBe('status.drag.cancelled');
    expect(incidents()).toEqual([]);
  });
});
