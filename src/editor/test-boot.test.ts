// The test boot (test-boot.ts): the project a browser test hands the editor is opened as File › Open opens it, the
// commands that follow run through the store, and a command that does not run as asked is an incident, never a state
// the test silently lacks.
import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearIncidents, incidents } from '../core/incidents.ts';
import { manualClock } from '../core/ports/clock.ts';
import { sequentialIds } from '../core/ports/ids.ts';
import { createEditorStore } from './store.ts';
import { STORED_AT_START, TEST_BOOT_PARAM, TEST_BOOT_URL, fetchTestBoot, noteStoredAtStart, runTestBoot } from './test-boot.ts';

const memory = () => {
  let held: string | null = null;
  return { read: () => held, write: (text: string) => void (held = text) };
};
const store = () => createEditorStore({ storage: memory(), workspace: memory(), ids: sequentialIds('t'), clock: manualClock(), ports: { readOnly: () => false } });
const AURORA = fs.readFileSync('manifest/features/fixtures/aurora.json', 'utf8');

// the feed is the process's: a file before this one in the same worker may have left an incident in it
beforeEach(() => clearIncidents());
afterEach(() => clearIncidents());

describe('the test boot', () => {
  it('opens the project as File › Open does and runs the commands after it, in order', () => {
    const s = store();
    const results = runTestBoot(s, {
      project: AURORA,
      commands: [
        { command: 'selection.select', args: { target: 'n-hero' } },
        { command: 'preferences.setLanguage', args: { locale: 'pt-BR' } },
      ],
    });
    expect(results).toEqual([
      { command: 'project.open', status: 'done' },
      { command: 'selection.select', status: 'done' },
      { command: 'preferences.setLanguage', status: 'done' },
    ]);
    expect(s.getState().document).toEqual(JSON.parse(AURORA));
    expect(s.getState().selection).toEqual(['n-hero']);
    expect(s.getState().ui.preferences.locale).toBe('pt-BR');
    // nothing to undo: the project starts the history, as File › Open starts it
    expect(s.getState().history.past).toEqual([]);
    expect(incidents()).toEqual([]);
  });

  it('records an incident for a command the store does not run as asked', () => {
    const s = store();
    const results = runTestBoot(s, { commands: [{ command: 'selection.select', args: { target: 'no-such-node' } }] });
    expect(results[0]?.status).not.toBe('done');
    expect(incidents().map((one) => one.what)).toEqual([`the test boot's selection.select ended ${results[0]?.status ?? ''}`]);
  });

  it('is fetched once, only when the page was opened for it, and the address loses the parameter', async () => {
    const replaced: string[] = [];
    const asked: string[] = [];
    const page = (search: string) =>
      ({
        location: { href: `http://localhost/${search}` },
        history: { state: null, replaceState: (_: unknown, __: string, url: string) => replaced.push(url) },
        fetch: (url: string) => (asked.push(url), Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ commands: [] }) })),
      }) as unknown as Window;
    expect(await fetchTestBoot(page(''))).toBeNull();
    expect(asked).toEqual([]);
    expect(await fetchTestBoot(page(`?${TEST_BOOT_PARAM}`))).toEqual({ commands: [] });
    expect(asked).toEqual([TEST_BOOT_URL]);
    expect(replaced).toEqual(['/']);
  });

  it('notes what the storage held when the editor starts', () => {
    const target = { localStorage: { length: 2 }, sessionStorage: { length: 0 } } as unknown as Window;
    noteStoredAtStart(target);
    expect((target as unknown as Record<string, unknown>)[STORED_AT_START]).toEqual({ local: 2, session: 0 });
  });
});
