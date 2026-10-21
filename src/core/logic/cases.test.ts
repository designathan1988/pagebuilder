// The outcomes the app-logic scenarios were written from (tools/gen/content/app-logic.computed.json): each case run
// through the store as the editor runs it must still end the same way. APP_LOGIC_WRITE=1 rewrites the file instead,
// for the generator (tools/gen/content/app-logic.py) to write the scenarios from.
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { CommandId } from '../../generated/ids.ts';
import { manualClock } from '../ports/clock.ts';
import { sequentialIds } from '../ports/ids.ts';
import type { DocumentJson } from '../document/model.ts';
import { createEditorStore } from '../../editor/store.ts';
import { textOf } from '../../editor/text.ts';

const CASES = 'tools/gen/content/app-logic.cases.json';
const COMPUTED = 'tools/gen/content/app-logic.computed.json';

const memory = () => {
  let held: string | null = null;
  return { read: () => held, write: (text: string) => void (held = text) };
};

type Case = [id: string, fixture: string, selection: string[], command: string, args: Record<string, unknown>];

function run([, fixture, selection, command, args]: Case): unknown {
  const document = fixture === 'empty' ? undefined : (JSON.parse(readFileSync(`manifest/features/fixtures/${fixture}.json`, 'utf8')) as DocumentJson);
  const store = createEditorStore({
    storage: memory(), workspace: memory(), clock: manualClock(1_000_000), ids: sequentialIds('t'),
    ...(document ? { restored: { document, selection: selection as never } } : {}),
    ports: { readOnly: () => false }, freeze: true,
  });
  const result = (store.dispatch as unknown as (id: CommandId, a: unknown) => { status: string })(command as CommandId, args);
  const state = store.getState();
  const message = state.message;
  return {
    status: result.status,
    app: state.document.app ?? null,
    nodes: state.document.pages[0]?.tree.children.map((child) => ({ name: child.name, logic: child.logic ?? null })),
    message: message === null ? null : { key: message.key, params: message.params, en: textOf('en', message.key, message.params) },
  };
}

it('every app-logic case still ends as its scenario says', () => {
  const cases = JSON.parse(readFileSync(CASES, 'utf8')) as Case[];
  const now = Object.fromEntries(cases.map((one) => [one[0], run(one)]));
  if (process.env['APP_LOGIC_WRITE'] === '1') writeFileSync(COMPUTED, `${JSON.stringify(now, null, 1)}\n`);
  else expect(now).toEqual(JSON.parse(readFileSync(COMPUTED, 'utf8')));
});
