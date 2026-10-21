import { describe, expect, it } from 'vitest';
import type { NodeId } from '../../generated/commands.ts';
import { manifest } from '../../manifest/runtime.ts';
import type { HandlerContext } from '../commands/registry.ts';
import { type DocNode, type DocumentJson } from '../document/model.ts';
import { rulesFromManifest, validateDocument } from '../document/validate.ts';
import { EMPTY_HISTORY } from '../history/history.ts';
import { applyPatches } from '../history/transaction.ts';
import { manualClock } from '../ports/clock.ts';
import { anyCss } from '../ports/css.ts';
import { sequentialIds } from '../ports/ids.ts';
import { noLayout } from '../ports/layout.ts';
import { addPageCommand, duplicatePageCommand } from './pages.ts';
import { documentOf, RULES, runHandler } from '../testing/handlers.ts';

const node = (id: string, type: string, tag: string, fields: Partial<DocNode> = {}): DocNode => ({
  id: id as NodeId, type: type as DocNode['type'], name: id, tag, attributes: {}, classes: [], styles: {}, text: null, children: [], ...fields,
});

describe('pages.duplicate', () => {
  it('refreshes HTML ids and references in the copied page', () => {
    const original: DocumentJson = { version: 4, pages: [{ id: 'p', name: 'Home', file: 'index.html', tree: node('Page', 'page', 'body', {
      children: [node('Control', 'input', 'input', { attributes: { id: 'control' } }), node('Label', 'label', 'label', { attributes: { labelFor: 'Control' } })],
    }) }] };
    const rules = rulesFromManifest(manifest.elements, manifest.properties, manifest.html);
    const context: HandlerContext<never> = {
      state: { document: original, selection: [], history: EMPTY_HISTORY, message: null, ui: undefined as never },
      ids: sequentialIds('new'), clock: manualClock(), rules, words: (key) => key, layout: noLayout, css: anyCss,
    };
    const outcome = duplicatePageCommand.run(context, { page: 'p' });
    if (outcome.kind !== 'change') throw new Error(`page duplication refused: ${JSON.stringify(outcome)}`);
    const document = applyPatches(original, outcome.patches ?? []).document;
    const copied = document.pages[1]?.tree;
    expect(copied?.children[0]?.attributes.id).toBe('control-copy');
    expect(copied?.children[1]?.attributes.labelFor).toBe(copied?.children[0]?.id);
    expect(validateDocument(document, [], rules)).toEqual([]);
  });

  // the audit's AUD-27: two copies of a page lined up newest first (Home, Unidade Praia, Unidade Centro)
  it('puts each copy after the copies made before it, in the order they were made', () => {
    const rules = rulesFromManifest(manifest.elements, manifest.properties, manifest.html);
    let document: DocumentJson = { version: 4, pages: [{ id: 'p', name: 'Home', file: 'index.html', tree: node('Page', 'page', 'body') }, { id: 'q', name: 'About', file: 'about.html', tree: node('About page', 'page', 'body') }] };
    const ids = sequentialIds('new');
    for (let copy = 0; copy < 2; copy += 1) {
      const context: HandlerContext<never> = { state: { document, selection: [], history: EMPTY_HISTORY, message: null, ui: undefined as never }, ids, clock: manualClock(), rules, words: (key) => key, layout: noLayout, css: anyCss };
      const outcome = duplicatePageCommand.run(context, { page: 'p' });
      if (outcome.kind !== 'change') throw new Error(`page duplication refused: ${JSON.stringify(outcome)}`);
      document = applyPatches(document, outcome.patches ?? []).document;
    }
    expect(document.pages.map((page) => page.name)).toEqual(['Home', 'Home 2', 'Home 3', 'About']);
  });
});

// CORE-4: a page made or copied never takes the path of a project file, and the validator refuses a page there
describe('a new page’s file', () => {
  it('skips a path a project file holds, for pages.add and pages.duplicate', () => {
    const files = [{ path: 'page.html', type: 'text/html', bytes: 'AAAA' }, { path: 'home-2.html', type: 'text/html', bytes: 'AAAA' }];
    const original = documentOf({ pages: [{ id: 'p', name: 'Home', file: 'index.html', tree: node('Page', 'page', 'body') }], files });
    const added = runHandler(addPageCommand(), original, { name: 'Page' }, { ui: {} });
    expect(added.document.pages.map((page) => page.file)).toEqual(['index.html', 'page-2.html']);
    expect(added.problems).toEqual([]);
    const copied = runHandler(duplicatePageCommand, original, { page: 'p' });
    expect(copied.document.pages.map((page) => page.file)).toEqual(['index.html', 'home-3.html']);
    expect(copied.problems).toEqual([]);
    const clashing = { ...original, pages: [...original.pages, { id: 'q', name: 'Page', file: 'page.html', tree: node('Other', 'page', 'body') }] };
    expect(validateDocument(clashing, [], RULES).map((problem) => problem.path)).toContain('/pages/1/file');
  });
});
