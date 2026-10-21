// Family CB1 of the code audit (2026-10-04, second reading): a paste read the editor's element format and style format
// from any clipboard text (another version of the editor, another project's breakpoints, a page that writes
// builder/elements), and what it held reached the validator only after the patches: a refused commit, which the store
// treats as a defect.
import { describe, expect, it } from 'vitest';
import { documentOf, node, runHandler } from '../testing/handlers.ts';
import { ELEMENTS_FORMAT, STYLES_FORMAT, copyCommand, pasteCommand, pasteStyleCommand } from './clipboard.ts';

const doc = () => documentOf({ pages: [{ id: 'home', name: 'Home', file: 'index.html', tree: node('Page', 'page', 'body', { children: [node('Box', 'div', 'div')] }) }] });
const clip = (text: string) => ({ status: 'read', text, html: null }) as never;

describe('a foreign clipboard is refused before any patch (CB1)', () => {
  it('refuses elements the model refuses', () => {
    const text = JSON.stringify({ format: ELEMENTS_FORMAT, nodes: [{ type: 'nothing', name: 'X', tag: 'blink', attributes: {}, classes: [], styles: {}, text: null, children: [] }] });
    const ran = runHandler(pasteCommand, doc(), { clipboard: clip(text) }, { selection: ['Box'] });
    expect(ran.outcome.kind).toBe('refused');
  });
  it('refuses styles of a breakpoint the project does not have', () => {
    const text = JSON.stringify({ format: STYLES_FORMAT, styles: { 'no-such-screen': { base: { color: 'red' } } } });
    const ran = runHandler(pasteStyleCommand, doc(), { clipboard: clip(text) }, { selection: ['Box'] });
    expect(ran.outcome.kind).toBe('refused');
  });
});

// The audit of 2026-10-21 (STRUCT-7): an element copied from inside an instance, its instance left behind, pastes as a
// plain element; an instance pasted whole stays an instance.
describe('a part of an instance pasted without its instance', () => {
  const project = () =>
    documentOf({
      pages: [{ id: 'home', name: 'Home', file: 'index.html', tree: node('Page', 'page', 'body', { children: [
        node('C', 'div', 'div', { component: 'Card', componentPart: [], children: [node('C-t', 'paragraph', 'p', { text: 'Card', componentPart: [0] })] }),
        node('H', 'section', 'section', { component: 'Hero', componentPart: [], children: [node('H-t', 'paragraph', 'p', { text: 'Hero', componentPart: [0] })] }),
        node('Box', 'div', 'div'),
      ] }) }],
      components: [
        { name: 'Card', tree: node('DC', 'div', 'div', { children: [node('DC-t', 'paragraph', 'p', { text: 'Card' })] }) },
        { name: 'Hero', tree: node('DH', 'section', 'section', { children: [node('DH-t', 'paragraph', 'p', { text: 'Hero' })] }) },
      ],
    });
  const copied = (id: string) => {
    const outcome = runHandler(copyCommand, project(), {}, { selection: [id] }).outcome;
    if (outcome.kind !== 'change' || outcome.clipboard === undefined) throw new Error(JSON.stringify(outcome));
    return clip(outcome.clipboard.text);
  };
  it('pastes a part as a plain element outside an instance and inside another component\'s', () => {
    for (const receiver of ['Box', 'H-t']) {
      const ran = runHandler(pasteCommand, project(), { clipboard: copied('C-t') }, { selection: [receiver] });
      expect(ran.problems).toEqual([]);
      const id = ran.outcome.kind === 'change' ? ran.outcome.selection?.[0] : undefined;
      const pasted = [...(ran.document.pages[0]?.tree.children ?? []).flatMap((child) => [child, ...child.children])].find((one) => one.id === id);
      expect(pasted !== undefined && 'componentPart' in pasted).toBe(false);
    }
  });
  it('keeps an instance pasted whole', () => {
    const ran = runHandler(pasteCommand, project(), { clipboard: copied('C') }, { selection: ['Box'] });
    expect(ran.problems).toEqual([]);
    const pasted = ran.document.pages[0]?.tree.children[2]?.children[0];
    expect(pasted).toMatchObject({ component: 'Card', componentPart: [] });
    expect(pasted?.children[0]?.componentPart).toEqual([0]);
  });
});
