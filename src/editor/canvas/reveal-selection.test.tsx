// @vitest-environment happy-dom
// The canvas brings a selection made away from it into view, by the press that made the selection: a Layers row's
// leaves the canvas where it is, even when the next press (the Inspector field typed in after choosing the row) lands
// before the editor draws the change; a selection made during a drag is decided when the drag ends.
import { readFileSync } from 'node:fs';
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommandId } from '../../generated/ids.ts';
import { manualClock } from '../../core/ports/clock.ts';
import { sequentialIds } from '../../core/ports/ids.ts';
import { walk, type DocumentJson } from '../../core/document/model.ts';
import { manifest } from '../../manifest/runtime.ts';
import { pointerViews } from '../input/pointer/views.ts';
import { createEditorStore, StoreContext, type EditorStore } from '../store.ts';
import { RevealSelection } from './reveal-selection.tsx';

// the element chosen lies far below the stage: wherever it is measured, it is out of view
vi.mock('./coordinates.ts', () => ({
  canvasFrame: () => ({}),
  nodeBox: () => ({ x: 10, y: 5000, width: 100, height: 40 }),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PAN = manifest.doors.find((d) => d.door.kind === 'canvas-wheel' && 'dx' in d.command.args)?.command.id;
const memory = (): { read(): string | null; write(text: string): void } => {
  let held: string | null = null;
  return { read: () => held, write: (text) => void (held = text) };
};
function storeOf(): EditorStore {
  const document = JSON.parse(readFileSync('manifest/features/fixtures/aurora.json', 'utf8')) as DocumentJson;
  return createEditorStore({ storage: memory(), workspace: memory(), clock: manualClock(1_000_000), ids: sequentialIds('p'), restored: { document, selection: [] }, ports: { readOnly: () => false }, freeze: true });
}
const idOf = (store: EditorStore, name: string): string => {
  for (const page of store.getState().document.pages) for (const node of walk(page.tree)) if (node.name === name) return node.id;
  throw new Error(`no node named ${name}`);
};
const select = (store: EditorStore, id: string) => (store.dispatch as unknown as (command: CommandId, args: unknown) => unknown)('selection.select' as CommandId, { target: id });
// two frames for the reveal, and a third for good measure
const frames = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));

let host: HTMLElement | null = null;
afterEach(() => {
  host?.remove();
  host = null;
});
// the component over a stage holding the page's view (canvas/reveal.ts visiblePage), the pans it asks for counted
function draw(store: EditorStore): { readonly pans: () => number } {
  host = document.createElement('div');
  document.body.append(host);
  const stage = createRef<HTMLDivElement>();
  const dispatch = store.dispatch.bind(store);
  let pans = 0;
  (store as { dispatch: unknown }).dispatch = (command: CommandId, args: unknown) => {
    if (command === PAN) pans += 1;
    return (dispatch as unknown as (c: CommandId, a: unknown) => unknown)(command, args);
  };
  const root = createRoot(host);
  act(() => root.render(<StoreContext.Provider value={store}><div ref={stage} data-canvas-stage><div className="frame__view" /></div><RevealSelection stage={stage} /></StoreContext.Provider>));
  return { pans: () => pans };
}

describe('the canvas brings a selection into view', () => {
  it('for a selection made away from the Layers', async () => {
    const store = storeOf();
    const { pans } = draw(store);
    pointerViews(store).setPressRegion('elsewhere');
    act(() => void select(store, idOf(store, 'Footer')));
    await frames();
    expect(pans()).toBe(1);
  });

  it('never for a Layers row, even when the next press lands before the editor draws the change', async () => {
    const store = storeOf();
    const { pans } = draw(store);
    const views = pointerViews(store);
    views.setPressRegion('layers');
    select(store, idOf(store, 'Footer'));
    // the Inspector's field pressed at once, before any effect or frame
    views.setPressRegion('elsewhere');
    await frames();
    expect(pans()).toBe(0);
  });

  it('for a selection made during a drag, once the drag ends', async () => {
    const store = storeOf();
    const { pans } = draw(store);
    const views = pointerViews(store);
    views.setPressRegion('elsewhere');
    act(() => views.setDrag({} as never));
    act(() => void select(store, idOf(store, 'Footer')));
    await frames();
    expect(pans()).toBe(0);
    act(() => views.setDrag(null));
    await frames();
    expect(pans()).toBe(1);
  });
});
