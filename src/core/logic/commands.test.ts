// The application layer's commands keep the code whole (the logic audit's LOGIC-3, LOGIC-12, LOGIC-13 and LOGIC-14): a
// rename rewrites every reference and nothing else, a removal that would leave code naming what is gone is refused
// with where, a binding is never renamed over another, and a logic.* command writes the element its typing began on.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CommandId } from '../../generated/ids.ts';
import { createEditorStore } from '../../editor/store.ts';
import { manualClock } from '../ports/clock.ts';
import { sequentialIds } from '../ports/ids.ts';
import type { DocNode, DocumentJson } from '../document/model.ts';
import { renameComponent, renameScript, renameTable, renameVariable, usesScript, usesVariable } from './references.ts';

const memory = () => {
  let held: string | null = null;
  return { read: () => held, write: (text: string) => void (held = text) };
};

const FIXTURE = JSON.parse(readFileSync('manifest/features/fixtures/app-logic.json', 'utf8')) as DocumentJson;

// the fixture with the Title element's logic and the project's scripts replaced
function project(logic: DocNode['logic'], scripts?: readonly { name: string; code: string }[]): DocumentJson {
  const page = FIXTURE.pages[0];
  if (page === undefined) throw new Error('the fixture has a page');
  const children = page.tree.children.map((child) => (child.name === 'Title' ? { ...child, logic } : child)) as DocNode[];
  return {
    ...FIXTURE,
    pages: [{ ...page, tree: { ...page.tree, children } }],
    app: { ...FIXTURE.app, ...(scripts === undefined ? {} : { scripts }) },
  } as DocumentJson;
}

function storeOf(document: DocumentJson, selection: readonly string[] = []) {
  const store = createEditorStore({
    storage: memory(), workspace: memory(), clock: manualClock(1_000_000), ids: sequentialIds('t'),
    restored: { document, selection: selection as never },
    ports: { readOnly: () => false }, freeze: true,
  });
  const run = (id: string, args: Record<string, unknown>) => (store.dispatch as unknown as (id: CommandId, a: unknown) => { status: string })(id as CommandId, args);
  const node = (name: string) => store.getState().document.pages[0]?.tree.children.find((child) => child.name === name);
  return { store, run, node };
}

describe('the rename rewriter', () => {
  it('renames a variable wherever state names it, and nothing that is not state', () => {
    const rename = renameVariable('count', 'clicks');
    expect(rename("state.count + state['count'] + state?.count + state [ \"count\" ]")).toBe("state.clicks + state['clicks'] + state?.clicks + state [ \"clicks\" ]");
    expect(rename('history.state.count + $event.state.count + state.counter')).toBe('history.state.count + $event.state.count + state.counter');
    expect(rename('const { count, other } = state;')).toBe('const { clicks: count, other } = state;');
    expect(rename('const { count: n } = state;')).toBe('const { clicks: n } = state;');
    expect(renameVariable('price$', 'cost$')('state.price$ * 2 + state.price$x')).toBe('state.cost$ * 2 + state.price$x');
  });

  it('reads a variable where state names it, and not elsewhere', () => {
    expect(usesVariable('todos')('state.todos.map((one) => one)')).toBe(true);
    expect(usesVariable('todos')("state['todos']")).toBe(true);
    expect(usesVariable('todos')('const { todos } = state')).toBe(true);
    expect(usesVariable('todos')('history.state.todos')).toBe(false);
  });

  it('renames a script in fn and in its import specifiers, a component in its specifiers, a table in app.db calls', () => {
    expect(renameScript('utils', 'helpers')("import { x } from '@app/script/utils';\nfn.utils.x(); fn['utils']; fn.utilsMore")).toBe(
      "import { x } from '@app/script/helpers';\nfn.helpers.x(); fn['helpers']; fn.utilsMore",
    );
    expect(renameComponent('Card', 'Tile')('import Card from "@app/component/Card";')).toBe('import Card from "@app/component/Tile";');
    expect(renameTable('posts', 'articles')("app.db.list('posts', { limit: 3 }); app.db.add(\"posts\", row); x.app.db.get('posts'); app.db.list('postsOld')")).toBe(
      "app.db.list('articles', { limit: 3 }); app.db.add(\"articles\", row); x.app.db.get('posts'); app.db.list('postsOld')",
    );
  });

  it('reads a script in fn, in its specifier and in a function only it exports', () => {
    expect(usesScript('util', [])('fn.util.answer')).toBe(true);
    expect(usesScript('util', [])("import { a } from '@app/script/util'")).toBe(true);
    expect(usesScript('util', ['answer'])('fn.answer + 1')).toBe(true);
    expect(usesScript('util', [])('fn.answer + 1')).toBe(false);
  });
});

describe('the commands of the application layer', () => {
  it('rewrites the app.db calls of the code when a table is renamed (LOGIC-12)', () => {
    const { run, node } = storeOf(project({ on: [{ event: 'click', code: "await app.db.list('posts')" }] }));
    expect(run('app.setTable', { previous: 'posts', name: 'articles' }).status).toBe('done');
    expect(node('Title')?.logic?.on?.[0]?.code).toBe("await app.db.list('articles')");
  });

  it('rewrites the import specifiers of the other modules when a script is renamed (LOGIC-12)', () => {
    const scripts = [{ name: 'util', code: 'export const answer = 42;\n' }, { name: 'main', code: "import { answer } from '@app/script/util';\nexport const twice = answer * 2;\n" }];
    const { store, run } = storeOf(project({ text: 'fn.util.answer' }, scripts));
    expect(run('app.setModule', { kind: 'script', previous: 'util', name: 'helpers' }).status).toBe('done');
    expect(store.getState().document.app?.scripts?.find((one) => one.name === 'main')?.code).toContain("'@app/script/helpers'");
  });

  it('keeps a persisted variable under the name visitors saved it as across renames, and only a persisted one (LOGIC-12)', () => {
    const { store, run } = storeOf(project({ text: 'state.count' }));
    const variable = (name: string) => store.getState().document.app?.variables?.find((one) => one.name === name);
    expect(run('app.setVariable', { previous: 'title', name: 'heading' }).status).toBe('done');
    expect(variable('heading')?.kept).toBeUndefined();
    expect(run('app.setVariable', { name: 'count', persist: true }).status).toBe('done');
    expect(run('app.setVariable', { previous: 'count', name: 'clicks' }).status).toBe('done');
    expect(variable('clicks')?.kept).toBe('count');
    expect(run('app.setVariable', { previous: 'clicks', name: 'taps' }).status).toBe('done');
    expect(variable('taps')?.kept).toBe('count');
    expect(run('app.setVariable', { previous: 'taps', name: 'count' }).status).toBe('done');
    expect(variable('count')).toEqual({ name: 'count', type: 'number', initial: 0, persist: true });
    expect(run('app.setVariable', { previous: 'count', name: 'clicks' }).status).toBe('done');
    // a new persisted variable under the name the renamed one is kept as would write its visitors' values
    expect(run('app.setVariable', { name: 'count', type: 'number', persist: true }).status).toBe('refused');
    expect(store.getState().message).toMatchObject({ key: 'status.app.keptTaken', params: { name: 'count', stored: 'count', other: 'clicks' } });
    expect(run('app.setVariable', { name: 'count', type: 'number' }).status).toBe('done');
  });

  it('refuses to remove a variable the code still reads, naming where, and removes it once nothing reads it (LOGIC-13)', () => {
    const used = storeOf(project({ text: 'state.title' }));
    expect(used.run('app.removeVariable', { name: 'title' }).status).toBe('refused');
    expect(used.store.getState().message).toMatchObject({ key: 'status.app.inUse', params: { name: 'title', where: 'Title' } });
    const free = storeOf(project({ text: 'state.count' }));
    expect(free.run('app.removeVariable', { name: 'title' }).status).toBe('done');
  });

  it('refuses to remove a script the code still calls, and removes one nothing calls (LOGIC-13)', () => {
    const scripts = [{ name: 'util', code: 'export function greet(name) { return name; }\n' }];
    const called = storeOf(project({ on: [{ event: 'click', code: "fn.greet('x')" }] }, scripts));
    expect(called.run('app.removeModule', { kind: 'script', name: 'util' }).status).toBe('refused');
    expect(called.store.getState().message).toMatchObject({ key: 'status.app.inUse', params: { name: 'util', where: 'Title' } });
    const free = storeOf(project({ text: 'state.title' }, scripts));
    expect(free.run('app.removeModule', { kind: 'script', name: 'util' }).status).toBe('done');
  });

  it('refuses to rename a binding to the name another binding of the element has (LOGIC-14)', () => {
    const { run, node } = storeOf(project({ binds: { 'class:active': 'state.on', 'class:big': 'state.count > 2' } }), ['n1']);
    expect(run('logic.setBinding', { previous: 'class:active', binding: 'class:big', value: 'state.on' }).status).toBe('refused');
    expect(node('Title')?.logic?.binds).toEqual({ 'class:active': 'state.on', 'class:big': 'state.count > 2' });
  });

  it('writes the element the typing began on, whatever is selected when it is kept (LOGIC-3)', () => {
    const { run, node } = storeOf(project({ text: 'state.title' }), ['n2']);
    expect(run('logic.set', { field: 'show', value: 'state.count > 0', target: 'n1' }).status).toBe('done');
    expect(node('Title')?.logic?.show).toBe('state.count > 0');
    expect(node('Box')?.logic).toBeUndefined();
  });
});
