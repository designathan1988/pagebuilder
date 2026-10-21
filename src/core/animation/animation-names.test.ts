// Family UQ1 of the code audit (2026-10-04): an animation's @keyframes name is the document's once (one sheet holds
// every animation), so a copy takes a free name and its own interactions follow it. Duplicate, paste and a page
// duplicated kept the names: editing the copy's keyframes changed how the original moved in the export.
import { describe, expect, it } from 'vitest';
import type { DocNode, DocumentJson } from '../document/model.ts';
import { walk } from '../document/model.ts';
import { RULES, documentOf, node, runHandler } from '../testing/handlers.ts';
import { deleteAnimationCommand, keyframesCss, renameAnimationCommand } from './animation.ts';
import { duplicateCommand } from '../structure/duplicate.ts';
import { duplicatePageCommand } from '../project/pages.ts';
import { pasteCommand } from '../clipboard/clipboard.ts';

const animation = { name: 'fade', settings: {}, keyframes: [{ offset: 0, easing: '', declarations: {} }, { offset: 100, easing: '', declarations: {} }] };
const animated = (): DocumentJson =>
  documentOf({ pages: [{ id: 'home', name: 'Home', file: 'index.html', tree: node('Page', 'page', 'body', { children: [node('Card', 'div', 'div', { animations: [animation], interactions: [{ trigger: 'click', action: 'play-animation', animation: 'fade' }] })] }) }] });
const names = (document: DocumentJson): string[] => document.pages.flatMap((page) => [...walk(page.tree)].flatMap((one: DocNode) => (one.animations ?? []).map((a) => a.name)));

describe('a copy takes a free @keyframes name (UQ1)', () => {
  it('Duplicate names the copy\'s animation anew, its click following it', () => {
    const ran = runHandler(duplicateCommand, animated(), {}, { selection: ['Card'] });
    expect(new Set(names(ran.document)).size).toBe(2);
    const copy = [...walk(ran.document.pages[0]?.tree as DocNode)].find((one) => one.id !== 'Card' && one.animations !== undefined);
    expect(copy?.interactions?.[0]?.animation).toBe(copy?.animations?.[0]?.name);
  });

  it('a page duplicated names its animations anew', () => {
    const ran = runHandler(duplicatePageCommand, animated(), { page: 'home' });
    expect(new Set(names(ran.document)).size).toBe(2);
  });

  it('a pasted copy names its animations anew', () => {
    const copied = JSON.stringify({ format: 'builder/elements', nodes: [{ type: 'div', name: 'Card', tag: 'div', attributes: {}, classes: [], styles: {}, text: null, children: [], animations: [animation], copiedFrom: 'Card' }] });
    const ran = runHandler(pasteCommand, animated(), { clipboard: { status: 'read', text: copied, html: null, markup: null } });
    expect(new Set(names(ran.document)).size).toBe(2);
  });
});

describe('the motion actions that play an animation follow it (the audit\'s STYLE-7)', () => {
  const playing = (): DocumentJson => ({
    ...animated(),
    motionTimelines: [{ id: 't1', name: 'Intro', actions: [{ id: 'a1', target: { kind: 'self' }, start: 0, duration: 0, effect: { kind: 'css-animation', operation: 'play', animation: 'fade' } }], markers: [] }],
  });
  const played = (document: DocumentJson) => document.motionTimelines?.[0]?.actions.map((action) => (action.effect.kind === 'css-animation' ? action.effect.animation : null));
  it('a rename renames the action\'s animation; a delete takes the action away', () => {
    const renamed = runHandler(renameAnimationCommand, playing(), { animation: 'fade', name: 'reveal' }, { selection: ['Card'] });
    expect(played(renamed.document)).toEqual(['reveal']);
    const deleted = runHandler(deleteAnimationCommand, playing(), { animation: 'fade' }, { selection: ['Card'] });
    expect(played(deleted.document)).toEqual([]);
  });
});

describe('a keyframe\'s easing is written in its @keyframes block (the audit\'s STYLE-4)', () => {
  it('as the timing function of the segment it starts, also on a keyframe holding nothing else', () => {
    const eased = { name: 'fade', settings: {}, keyframes: [{ offset: 0, easing: 'ease-in', declarations: { opacity: '0' } }, { offset: 50, easing: 'linear', declarations: {} }, { offset: 100, easing: '', declarations: { opacity: '1' } }] };
    expect(keyframesCss(eased, RULES.output, 'line')).toBe('@keyframes fade { 0% { opacity: 0; animation-timing-function: ease-in; } 50% { animation-timing-function: linear; } 100% { opacity: 1; } }');
  });
});
