// @vitest-environment happy-dom
// The style state follows the selection (the audit's AUD-03; the user's decision of 2026-10-02): a state chosen for one
// element (Visited on a link) and kept while another is selected (a heading) sent nine style writers into a layer the
// validator refuses — in the editor, AUD-01's blank window. The minimal sequences the audit's random probe found are
// replayed on the editor's own store, frozen as in development, where a breach throws.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { DocumentJson } from '../../core/document/model.ts';
import { manualClock } from '../../core/ports/clock.ts';
import { sequentialIds } from '../../core/ports/ids.ts';
import type { CommandArgs } from '../../generated/commands.ts';
import type { CommandId } from '../../generated/ids.ts';
import { createEditorStore } from '../store.ts';
import { messageText } from '../text.ts';

const memory = (): { read(): string | null; write(text: string): void } => {
  let held: string | null = null;
  return { read: () => held, write: (text) => void (held = text) };
};

function openStore(fixture: string) {
  const document = JSON.parse(fs.readFileSync(`manifest/features/fixtures/${fixture}.json`, 'utf8')) as DocumentJson;
  return createEditorStore({ storage: memory(), workspace: memory(), clock: manualClock(1_000_000), ids: sequentialIds('s'), restored: { document, selection: [] }, ports: { readOnly: () => false }, freeze: true });
}

const run = <Id extends CommandId>(store: ReturnType<typeof openStore>, id: Id, args: CommandArgs[Id]) => store.dispatch(id, args);
const said = (store: ReturnType<typeof openStore>) => {
  const m = store.getState().message;
  return m === null || m === undefined ? null : messageText('en', m);
};

describe('the style state and the selection (AUD-03)', () => {
  it('goes back to Base when the selection moves to an element the state does not stand on, and says so', () => {
    const store = openStore('aurora');
    run(store, 'selection.select', { target: 'n-intro' as never });
    run(store, 'element.insert', { entry: 'link' } as never);
    expect(run(store, 'view.setStyleState', { state: 'visited' } as never).status).toBe('done');
    expect(store.getState().ui.styleState).toBe('visited');
    run(store, 'selection.select', { target: 'n-title' as never });
    expect(store.getState().ui.styleState).toBeUndefined();
    expect(said(store)).toBe('Visited does not apply to Heading: editing Base.');
    // the write the audit's path made now goes to the heading's base layer, and the document stays valid
    expect(run(store, 'style.set', { property: 'font-size', value: '40px' } as never).status).toBe('done');
  });

  it('refuses to choose a state the selection does not stand on, with words', () => {
    const store = openStore('aurora');
    run(store, 'selection.select', { target: 'n-title' as never });
    const answer = run(store, 'view.setStyleState', { state: 'visited' } as never);
    expect(answer.status).toBe('refused');
    expect(said(store)).toBe('Visited does not apply to Heading: choose a state it takes, or Base.');
    expect(store.getState().ui.styleState).toBeUndefined();
  });

  // the probe's minimal sequences (.cache/logs/audit/03-C-random.json): each one threw InvalidStateError before
  it('replays the random probe\'s minimal sequences without a breach', () => {
    const sequences: readonly (readonly [CommandId, Readonly<Record<string, unknown>>][])[] = [
      [['view.setStyleState', { state: 'visited' }], ['contextMenu.open', { target: 'contact-title' }], ['style.set', { property: 'align-items', value: 'stretch' }]],
      [['page.openProperties', {}], ['view.setStyleState', { state: 'visited' }], ['motion.setBehaviour', { behaviour: 'sticky', amount: 100, axis: 'x' }]],
      [['page.openProperties', {}], ['view.setStyleState', { state: 'visited' }], ['style.set', { property: 'justify-content', value: 'space-between' }]],
      [['view.setStyleState', { state: 'user-valid' }], ['style.set', { property: 'align-items', value: 'stretch', targets: ['client-title', 'contact-title'] }]],
    ];
    for (const sequence of sequences) {
      const store = openStore('client-site');
      for (const [id, args] of sequence) expect(() => store.dispatch(id, args as never), `${id} ${JSON.stringify(args)}`).not.toThrow();
    }
  });
});

// The states that take words of their own (core/style/state-keys.ts): a child position typed as a formula, a parent
// state named by an ancestor's class
describe('the child positions and the parent states', () => {
  it('takes a formula as typed, in its canonical spelling, and refuses a text that is none, with words', () => {
    const store = openStore('aurora');
    run(store, 'selection.select', { target: 'n-card-c' as never });
    expect(run(store, 'view.setStyleState', { state: 'nth:2N + 1' } as never).status).toBe('done');
    expect(store.getState().ui.styleState).toBe('nth:2n+1');
    expect(said(store)).toBe('Editing the Nth child 2n+1 state.');
    // a formula a state names is that state
    run(store, 'view.setStyleState', { state: 'nth:even' } as never);
    expect(store.getState().ui.styleState).toBe('even');
    expect(run(store, 'view.setStyleState', { state: 'nth:every third' } as never).status).toBe('refused');
    expect(said(store)).toBe('“every third” is not a child position: write a formula such as 2n+1, 3 or odd.');
    expect(store.getState().ui.styleState).toBe('even');
    // a write goes to the formula's layer
    run(store, 'view.setStyleState', { state: 'nth:3n' } as never);
    expect(run(store, 'style.set', { property: 'opacity', value: '50' } as never).status).toBe('done');
    const card = store.getState().document.pages[0]?.tree.children[1]?.children[0]?.children[2];
    expect(card?.styles.desktop?.['nth:3n']).toEqual({ opacity: '0.5' });
  });

  it("names the nearest ancestor's class for a parent state, keeps it when the ancestor state changes, and refuses where no ancestor has one", () => {
    const store = openStore('aurora');
    run(store, 'selection.select', { target: 'n-card-a-title' as never });
    expect(run(store, 'view.setStyleState', { state: 'parent::hover' } as never).status).toBe('done');
    expect(store.getState().ui.styleState).toBe('parent:card:hover');
    expect(said(store)).toBe('Editing the Hover on .card state.');
    run(store, 'view.setStyleState', { state: 'parent::focus-within' } as never);
    expect(store.getState().ui.styleState).toBe('parent:card:focus-within');
    expect(run(store, 'style.set', { property: 'color', value: '#1d4ed8' } as never).status).toBe('done');
    const title = store.getState().document.pages[0]?.tree.children[1]?.children[0]?.children[0]?.children[0];
    expect(title?.styles.desktop?.['parent:card:focus-within']).toEqual({ color: '#1d4ed8' });
    // the hero's intro sits in no element with a class
    run(store, 'view.setStyleState', { state: 'base' } as never);
    run(store, 'selection.select', { target: 'n-intro' as never });
    expect(run(store, 'view.setStyleState', { state: 'parent::hover' } as never).status).toBe('refused');
    expect(said(store)).toBe('No element around Intro has a class: give its parent a class first.');
  });
});
