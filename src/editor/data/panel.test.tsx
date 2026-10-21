// @vitest-environment happy-dom
// The Data panel as it is drawn (spec data-collections, data-import, data-binding, data-pages, shared-regions): every
// control is a door of the manifest's data regions, standing for what its place gives (data-door, data-args); a cell,
// a menu and a form run their command with what they hold; the parts of the selected card are the places a column is
// dropped on; a sheet that cannot be read says its problem; nothing is drawn with a text written in code.
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { CommandId } from '../../generated/ids.ts';
import { manualClock } from '../../core/ports/clock.ts';
import { sequentialIds } from '../../core/ports/ids.ts';
import { walk, type DocumentJson } from '../../core/document/model.ts';
import { readDataFileSafely } from '../../core/data/readers.ts';
import { createEditorStore, StoreContext, type EditorStore } from '../store.ts';
import { DataPanel } from './panel.tsx';
import { domXml } from './read-file.ts';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const memory = (): { read(): string | null; write(text: string): void } => {
  let held: string | null = null;
  return { read: () => held, write: (text) => void (held = text) };
};
function storeOf(fixture: string): EditorStore {
  const document = JSON.parse(readFileSync(`manifest/features/fixtures/${fixture}.json`, 'utf8')) as DocumentJson;
  return createEditorStore({ storage: memory(), workspace: memory(), clock: manualClock(1_000_000), ids: sequentialIds('p'), restored: { document, selection: [] }, ports: { readOnly: () => false }, freeze: true });
}
const run = (store: EditorStore, id: string, args: unknown) => (store.dispatch as unknown as (id: CommandId, args: unknown) => unknown)(id as CommandId, args);
const idOf = (store: EditorStore, name: string): string => {
  for (const page of store.getState().document.pages) for (const node of walk(page.tree)) if (node.name === name) return node.id;
  throw new Error(`no node named ${name}`);
};

let host: HTMLElement | null = null;
afterEach(() => {
  host?.remove();
  host = null;
});
function draw(store: EditorStore): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<StoreContext.Provider value={store}><DataPanel /></StoreContext.Provider>));
  return host;
}
const args = (element: Element | null): unknown => JSON.parse(element?.getAttribute('data-args') ?? 'null');

describe('the Data panel', () => {
  it('draws the collections, the fields, the query and the grid, every control a door', () => {
    const store = storeOf('content-menu-list');
    const panel = draw(store);
    expect(args(panel.querySelector('[data-door="data.select#data-collection-tab"]'))).toEqual({ collection: 'Cardapio' });
    expect(panel.querySelectorAll('[data-door="data.setField#data-field-label"]')).toHaveLength(3);
    expect(panel.querySelectorAll('[data-door="data.setCell#data-cell"]')).toHaveLength(9);
    expect(panel.querySelector('[data-door="data.setQuery#data-sort-first"] select')).not.toBeNull();
    expect(panel.querySelector('[data-door="data.preview#data-import"]')?.textContent).toBe('Import file');
    // every control drawn is a door: a button or a field carries its door, an input of a form the form's submit button
    for (const control of panel.querySelectorAll('button, select, input, textarea')) {
      const door = control.closest('[data-door]') ?? control.closest('form')?.querySelector('button[type="submit"][data-door]') ?? null;
      expect(door, control.outerHTML.slice(0, 120)).not.toBeNull();
    }
  });

  it('keeps a typed cell on Enter, through data.setCell', () => {
    const store = storeOf('content-menu-list');
    const panel = draw(store);
    const cell = panel.querySelector<HTMLFormElement>('[data-door="data.setCell#data-cell"][data-args*="item-2"][data-args*="preco"]');
    const input = cell?.querySelector('input');
    if (cell === null || cell === undefined || input === null || input === undefined) throw new Error('the cell is not drawn');
    act(() => {
      input.value = 'R$ 50';
      cell.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(store.getState().document.collections?.[0]?.items[1]?.values.preco).toBe('R$ 50');
  });

  it('draws the parts of the selected card as the places a column is dropped on, the columns as handles, and a labelled Fill', () => {
    const store = storeOf('content-menu-list');
    run(store, 'selection.select', { target: idOf(store, 'Title 2') });
    const panel = draw(store);
    const parts = [...panel.querySelectorAll('[data-data-target]')].map((part) => args(part));
    expect(parts).toEqual([
      { node: idOf(store, 'Photo 2'), to: 'image' },
      { node: idOf(store, 'Photo 2'), to: 'alt' },
      { node: idOf(store, 'Title 2'), to: 'text' },
      { node: idOf(store, 'Price 2'), to: 'text' },
      { node: idOf(store, 'More 2'), to: 'link' },
      { node: idOf(store, 'More 2'), to: 'text' },
    ]);
    expect([...panel.querySelectorAll('[data-door="data.bindElement#panel-drag-data-column"]')].map((column) => args(column))).toEqual([{ field: 'nome' }, { field: 'preco' }, { field: 'foto' }]);
    const fill = panel.querySelector('[data-door="data.fill#data-fill"]');
    expect(fill?.textContent).toBe('Fill');
    expect(args(fill)).toEqual({ node: idOf(store, 'Card 2'), collection: 'Cardapio', query: {} });
    expect(panel.querySelector('[data-door="data.unbind#data-unbind"]')).not.toBeNull();
    // the preview shows what the first items would show
    expect(panel.querySelector('.data-mapping table')?.textContent).toContain('Filtrado Sul de Minas');
  });

  // the final use's USE-9: three paragraphs of a card were three rows reading "Paragra… text"
  it('tells the parts apart by what each shows now, beside its name', () => {
    const store = storeOf('content-menu-list');
    run(store, 'selection.select', { target: idOf(store, 'Title 2') });
    const panel = draw(store);
    const nodes = new Map(store.getState().document.pages.flatMap((page) => [...walk(page.tree)]).map((node) => [node.id, node]));
    const texts = [...panel.querySelectorAll('[data-data-target]')].filter((part) => (args(part) as { to: string }).to === 'text');
    expect(texts.length).toBeGreaterThan(1);
    const shown = texts.map((part) => part.querySelector('.data-target__shows')?.textContent);
    expect(shown).toEqual(texts.map((part) => nodes.get((args(part) as { node: string }).node)?.text?.trim()));
    expect(new Set(shown).size).toBe(shown.length);
  });

  it("binds a part from its menu, through data.bindElement", () => {
    const store = storeOf('content-menu-list');
    run(store, 'selection.select', { target: idOf(store, 'Card') });
    const panel = draw(store);
    const menu = panel.querySelector<HTMLSelectElement>(`[data-door="data.bindElement#data-bind-field"][data-args*="${idOf(store, 'Price')}"] select`);
    if (menu === null) throw new Error('the menu is not drawn');
    act(() => {
      menu.value = 'nome';
      menu.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(store.getState().document.components?.[0]?.tree.children[2]?.bind).toEqual([{ field: 'nome', to: 'text' }]);
  });

  it('previews a workbook, its sheets as segments, the problem of a sheet that cannot be read', async () => {
    const store = storeOf('content-menu');
    const handed = await readDataFileSafely('cardapio.xlsx', new Uint8Array(readFileSync('manifest/features/fixtures/import/cardapio.xlsx')), domXml);
    run(store, 'data.preview', { file: JSON.stringify(handed) });
    const panel = draw(store);
    expect([...panel.querySelectorAll('[data-door="data.previewSheet#data-preview-sheet"]')].map((segment) => segment.textContent)).toEqual(['Cardapio', 'Notas']);
    expect(panel.querySelectorAll('[data-door="data.previewType#data-preview-type"]')).toHaveLength(5);
    expect(panel.querySelector('[data-door="data.importNew#data-import-new"]')?.closest('form')?.querySelector('input[name="name"]')).not.toBeNull();
    act(() => void run(store, 'data.previewSheet', { sheet: 'Notas' }));
    expect(panel.querySelector('.data-preview [role="alert"]')?.textContent).toBe('Cell A2 of cardapio.xlsx holds a formula with no saved value. Open and save the file in its spreadsheet first.');
  });

  it('offers to share an element directly inside its page with the other pages and the pages made later', () => {
    const store = storeOf('content-site');
    run(store, 'selection.select', { target: idOf(store, 'Header') });
    const panel = draw(store);
    const share = panel.querySelector('[data-door="regions.share#data-share"]')?.closest('form');
    expect([...(share?.querySelectorAll<HTMLInputElement>('input[name="pages"]') ?? [])].map((box) => box.value)).toEqual(['about.html', 'contact.html', 'new']);
    act(() => share?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(store.getState().document.components?.[0]?.shared).toEqual({ newPages: true, at: 'start' });
    expect(panel.querySelectorAll('[data-door="regions.detach#data-shared-detach"]')).toHaveLength(3);
  });
});
