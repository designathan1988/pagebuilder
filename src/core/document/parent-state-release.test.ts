// A parent state (`parent:card:hover`) naming a class no rule registered — an imported page's element wears it — lasts
// as long as an element wears that class. Deleting, cutting or unwrapping the last one was refused as an invalid change
// (validate.ts orphanParentStates); the change now releases those parent states in the same undo step
// (tree.ts releasedParentStates, read by the store's commit).
import { describe, expect, it } from 'vitest';
import { createEditorStore } from '../../editor/store.ts';
import { manualClock } from '../ports/clock.ts';
import { sequentialIds } from '../ports/ids.ts';
import { anyCss } from '../ports/css.ts';
import { documentOf, node } from '../testing/handlers.ts';
import type { DocNode, DocumentJson } from './model.ts';

const memory = (): { read(): string | null; write(text: string): void } => {
  let held: string | null = null;
  return { read: () => held, write: (text) => void (held = text) };
};

const styles = (value: Record<string, Record<string, Record<string, string>>>): DocNode['styles'] => value as DocNode['styles'];

// Card (wears the unregistered class card) holds Title; Aside, outside it, and the registered class title hold
// parent states naming card, beside a state of their own.
function project(cards: number): DocumentJson {
  const card = (id: string, inner: DocNode[]): DocNode => node(id, 'div', 'div', { classes: ['card'], children: inner });
  const title = node('Title', 'heading', 'h2', { text: 'Hi', classes: ['title'], styles: styles({ desktop: { 'parent:card:hover': { color: '#ff0000' } } }) });
  const aside = node('Aside', 'paragraph', 'p', { text: 'x', styles: styles({ desktop: { 'parent:card:hover': { color: '#00ff00' }, hover: { color: '#0000ff' } } }) });
  const cardNodes = [card('Card', [title]), ...(cards > 1 ? [card('Other', [])] : [])];
  return documentOf({
    pages: [{ id: 'home', name: 'Home', file: 'index.html', tree: node('Page', 'page', 'body', { children: [...cardNodes, aside] }) }],
    classes: [{ name: 'title', styles: styles({ desktop: { 'parent:card:hover': { color: '#123456' } } }) }] as NonNullable<DocumentJson['classes']>,
  });
}

function storeOf(document: DocumentJson, selected: string) {
  return createEditorStore({
    storage: memory(),
    workspace: memory(),
    clock: manualClock(1_000_000),
    ids: sequentialIds('v'),
    restored: { document, selection: [selected as never] },
    ports: { css: anyCss, readOnly: () => false, downloads: { deliver: () => undefined }, clipboard: { write: () => undefined } as never },
    freeze: true,
  });
}

const page = (document: DocumentJson): DocNode => document.pages[0]?.tree as DocNode;
const named = (document: DocumentJson, name: string): DocNode | undefined => page(document).children.find((one) => one.name === name);

describe('a parent state goes with the last element wearing its unregistered class', () => {
  it('a delete of the last card releases the parent states naming it, and an undo gives them back', () => {
    const before = project(1);
    const store = storeOf(before, 'Card');
    expect(store.dispatch('element.delete', {}).status).toBe('done');
    const after = store.getState().document;
    expect(named(after, 'Card')).toBeUndefined();
    expect(named(after, 'Aside')?.styles).toEqual({ desktop: { hover: { color: '#0000ff' } } });
    // a breakpoint left with no state goes too
    expect(after.classes?.[0]?.styles).toEqual({});
    // one undo step takes the delete and the release back
    expect(store.dispatch('history.undo', {}).status).toBe('done');
    expect(store.getState().document).toEqual(before);
    expect(store.dispatch('history.redo', {}).status).toBe('done');
    expect(store.getState().document).toEqual(after);
  });

  it('a cut of the last card releases them the same way', () => {
    const before = project(1);
    const store = storeOf(before, 'Card');
    expect(store.dispatch('clipboard.cut', {}).status).toBe('done');
    const after = store.getState().document;
    expect(named(after, 'Card')).toBeUndefined();
    expect(named(after, 'Aside')?.styles).toEqual({ desktop: { hover: { color: '#0000ff' } } });
    expect(store.dispatch('history.undo', {}).status).toBe('done');
    expect(store.getState().document).toEqual(before);
  });

  it('an unwrap of the last card releases the parent state its lifted child holds', () => {
    const store = storeOf(project(1), 'Card');
    expect(store.dispatch('element.unwrap', {}).status).toBe('done');
    const after = store.getState().document;
    expect(named(after, 'Title')?.styles).toEqual({});
    expect(named(after, 'Aside')?.styles).toEqual({ desktop: { hover: { color: '#0000ff' } } });
  });

  it('the style state editing a parent state of the class goes back to Base, and an undo gives it back', () => {
    const store = storeOf(project(1), 'Card');
    expect(store.dispatch('view.setStyleState', { state: 'parent:card:hover' } as never).status).toBe('done');
    expect(store.getState().ui.styleState).toBe('parent:card:hover');
    expect(store.dispatch('element.delete', {}).status).toBe('done');
    expect(store.getState().ui.styleState).toBeUndefined();
    // the delete's own words stay, so its toast offers Undo
    expect(store.getState().message?.key).toBe('status.deleted');
    expect(store.dispatch('history.undo', {}).status).toBe('done');
    expect(store.getState().ui.styleState).toBe('parent:card:hover');
    // the redone delete gives back no state naming the class it takes away
    expect(store.dispatch('history.redo', {}).status).toBe('done');
    expect(store.getState().ui.styleState).toBeUndefined();
  });

  it('while another element wears the class, its parent states stay', () => {
    const store = storeOf(project(2), 'Card');
    expect(store.dispatch('element.delete', {}).status).toBe('done');
    const after = store.getState().document;
    expect(named(after, 'Aside')?.styles).toEqual({ desktop: { 'parent:card:hover': { color: '#00ff00' }, hover: { color: '#0000ff' } } });
    expect(after.classes?.[0]?.styles).toEqual({ desktop: { 'parent:card:hover': { color: '#123456' } } });
  });

  it('a registered class keeps its parent states when its last element goes', () => {
    const base = project(1);
    const registered = documentOf({ ...base, classes: [...(base.classes ?? []), { name: 'card', styles: {} }] as NonNullable<DocumentJson['classes']> });
    const store = storeOf(registered, 'Card');
    expect(store.dispatch('element.delete', {}).status).toBe('done');
    expect(named(store.getState().document, 'Aside')?.styles).toEqual({ desktop: { 'parent:card:hover': { color: '#00ff00' }, hover: { color: '#0000ff' } } });
  });
});
