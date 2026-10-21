// Every ready template of the Insert panel (elements.json entries of kind "template": sections and web components)
// inserts into an empty page and leaves a valid document; the web components keep their data-wc attributes, which the
// export's widgets script (js/widgets.js) reads.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CommandId } from '../../generated/ids.ts';
import { manualClock } from '../../core/ports/clock.ts';
import { sequentialIds } from '../../core/ports/ids.ts';
import { walk, type DocumentJson } from '../../core/document/model.ts';
import { clearIncidents, incidents } from '../../core/incidents.ts';
import { createEditorStore, type EditorStore } from '../store.ts';

type Dispatch = (id: CommandId, args: unknown) => { readonly status: string };
const memory = (): { read(): string | null; write(text: string): void } => {
  let held: string | null = null;
  return { read: () => held, write: (text) => void (held = text) };
};
const empty = JSON.parse(readFileSync('manifest/features/fixtures/aurora.json', 'utf8')) as DocumentJson;
const storeOf = (): EditorStore => createEditorStore({ storage: memory(), workspace: memory(), clock: manualClock(1_000_000), ids: sequentialIds('t'), restored: { document: empty, selection: [] }, ports: { readOnly: () => false }, freeze: true });

interface Entry { readonly id: string; readonly kind: string; readonly template?: unknown }
const groups = (JSON.parse(readFileSync('manifest/elements.json', 'utf8')) as { palette: { id: string; entries: Entry[] }[] }).palette;
const templates = groups.flatMap((group) => group.entries.filter((entry) => entry.kind === 'template').map((entry) => [group.id, entry.id, JSON.stringify(entry.template).includes('"data-wc"')] as const));

describe('ready templates', () => {
  it.each(templates)('%s/%s inserts into a page', (_group, entry, widget) => {
    const store = storeOf();
    clearIncidents();
    const outcome = (store.dispatch as unknown as Dispatch)('element.insert' as CommandId, { entry });
    expect(incidents().map((incident) => JSON.stringify(incident)).join('\n')).toBe('');
    expect(outcome.status).toBe('done');
    if (widget) {
      const nodes = store.getState().document.pages.flatMap((page) => [...walk(page.tree)]);
      expect(nodes.some((node) => node.customAttributes?.['data-wc'] !== undefined)).toBe(true);
    }
  });
});
