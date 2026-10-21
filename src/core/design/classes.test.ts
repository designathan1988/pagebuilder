// Moving styles into a class and applying a class to every similar element (spec class-moves): the refusals the
// inspector's buttons never meet, since they are drawn only while their command can run.
import { describe, expect, it } from 'vitest';
import type { NodeId } from '../../generated/commands.ts';
import { manifest } from '../../manifest/runtime.ts';
import type { HandlerContext } from '../commands/registry.ts';
import type { DocNode, DocumentJson } from '../document/model.ts';
import { rulesFromManifest, validateDocument } from '../document/validate.ts';
import { EMPTY_HISTORY } from '../history/history.ts';
import { applyPatches } from '../history/transaction.ts';
import { manualClock } from '../ports/clock.ts';
import { anyCss } from '../ports/css.ts';
import { sequentialIds } from '../ports/ids.ts';
import { noLayout } from '../ports/layout.ts';
import { applyToSimilarCommand, deleteClassCommand, moveIntoClassCommand, renameClassCommand } from './classes.ts';

const RULES = rulesFromManifest(manifest.elements, manifest.properties, manifest.html);
const node = (id: string, fields: Partial<DocNode> = {}): DocNode => ({ id: id as NodeId, type: 'article' as DocNode['type'], name: id, tag: 'article', attributes: {}, classes: [], styles: {}, text: null, children: [], ...fields });
const context = (document: DocumentJson, selection: readonly string[]): HandlerContext<never> => ({
  state: { document, selection: selection as never, history: EMPTY_HISTORY, message: null, ui: undefined as never },
  clock: manualClock(),
  ids: sequentialIds('x'),
  rules: RULES,
  words: (key) => key,
  layout: noLayout,
  css: anyCss,
});
const project = (children: readonly DocNode[]): DocumentJson => ({
  version: 4,
  pages: [{ id: 'p', name: 'Home', file: 'index.html', tree: { ...node('Page', { children: [...children] }), type: 'page' as DocNode['type'], tag: 'body' } }],
  classes: [{ name: 'card', styles: { desktop: { base: { 'padding-top': '16px' } } } }],
});

describe('class moves', () => {
  it('moves the element’s own styles into the class, over its values, and leaves the element clean', () => {
    const document = project([node('A', { classes: ['card'], styles: { desktop: { base: { 'padding-top': '24px', color: '#111111' } } } })]);
    const outcome = moveIntoClassCommand.run(context(document, ['A']), { className: 'card' });
    if (outcome.kind !== 'change') throw new Error(JSON.stringify(outcome));
    const next = applyPatches(document, outcome.patches ?? []).document;
    expect(validateDocument(next, [], RULES)).toEqual([]);
    expect(next.classes?.[0]?.styles).toEqual({ desktop: { base: { 'padding-top': '24px', color: '#111111' } } });
    expect(next.pages[0]?.tree.children[0]?.styles).toEqual({});
  });

  it('refuses an element with nothing of its own, and a class the project lacks', () => {
    const document = project([node('A', { classes: ['card'] })]);
    expect(moveIntoClassCommand.run(context(document, ['A']), { className: 'card' }).kind).toBe('refused');
    expect(moveIntoClassCommand.run(context(project([node('A', { styles: { desktop: { base: { color: '#111111' } } } })]), ['A']), { className: 'nope' }).kind).toBe('refused');
  });

  it('applies the class to every element of the type without it, and refuses when none is left', () => {
    const document = project([node('A', { classes: ['card'] }), node('B'), node('C')]);
    const outcome = applyToSimilarCommand.run(context(document, ['A']), { className: 'card' });
    if (outcome.kind !== 'change') throw new Error(JSON.stringify(outcome));
    const next = applyPatches(document, outcome.patches ?? []).document;
    expect(next.pages[0]?.tree.children.map((child) => child.classes)).toEqual([['card'], ['card'], ['card']]);
    expect(applyToSimilarCommand.run(context(next, ['A']), { className: 'card' }).kind).toBe('refused');
  });
});

// The audit of 2026-10-21 (STRUCT-11, STYLE-6): an interaction or a motion that names a class by its name follows the
// class renamed, and keeps it from being deleted.
describe('a class an interaction or a motion names', () => {
  const bound = (): DocumentJson => ({
    ...project([
      node('Btn', { classes: ['card'], interactions: [{ trigger: 'click', action: 'toggle-class', target: 'Nav' as NodeId, className: 'card', scope: 'card' }], motions: [{ id: 'm1', trigger: { kind: 'click' }, timeline: 'Intro', control: 'play', scope: 'card' }] }),
      node('Nav'),
    ]),
    motionTimelines: [{ id: 't1', name: 'Intro', markers: [], actions: [{ id: 'a1', target: { kind: 'class', className: 'card' }, start: 0, duration: 0, effect: { kind: 'class', operation: 'toggle', className: 'card' } }] }],
  });
  const result = (document: DocumentJson, outcome: ReturnType<typeof renameClassCommand.run>): DocumentJson => {
    if (outcome.kind !== 'change') throw new Error(JSON.stringify(outcome));
    const next = applyPatches(document, outcome.patches ?? []).document;
    expect(validateDocument(next, [], RULES)).toEqual([]);
    return next;
  };
  it('follows the class renamed', () => {
    const next = result(bound(), renameClassCommand.run(context(bound(), []), { className: 'card', nextName: 'tile' }));
    const button = next.pages[0]?.tree.children[0];
    expect(button?.interactions?.[0]).toMatchObject({ scope: 'tile', className: 'tile' });
    expect(button?.motions?.[0]?.scope).toBe('tile');
    expect(next.motionTimelines?.[0]?.actions[0]).toMatchObject({ target: { className: 'tile' }, effect: { className: 'tile' } });
  });
  it('refuses the class deleted while one names it', () => {
    const outcome = deleteClassCommand.run({ ...context(bound(), []), confirmed: true }, { className: 'card' });
    expect(outcome).toMatchObject({ kind: 'refused', message: { key: 'status.classes.inUseByInteractions' } });
  });
});
