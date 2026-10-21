import { describe, expect, it } from 'vitest';
import fixture from '../../../manifest/features/fixtures/aurora.json';
import { manualClock } from '../ports/clock.ts';
import { sequentialIds } from '../ports/ids.ts';
import { createEditorStore } from '../../editor/store.ts';
import type { PreferenceStorage } from '../../editor/preferences/preferences.ts';
import type { DocumentChange } from '../store/store.ts';
import { createEmptyDocument, isEmptyProject, type DocumentJson } from '../document/model.ts';
import { RULES, runHandler } from '../testing/handlers.ts';
import { PROJECT_FILE_LIMITS, saveProject } from './archive.ts';

// the fixture as File › Open reads it: the file's text
const aurora = JSON.stringify(fixture);
const memory = (): PreferenceStorage => ({ read: () => null, write: () => {} });
const store = () => createEditorStore({ storage: memory(), ids: sequentialIds('n'), clock: manualClock() });

describe('File › Open (src/core/project/archive.ts)', () => {
  it('loads a project document: the document is the file, the selection and the history start empty', () => {
    const s = store();
    const changes: DocumentChange[] = [];
    s.subscribeDocument((c) => changes.push(c));
    expect(s.dispatch('project.open', { file: aurora })).toEqual({ status: 'done', changed: true });
    expect(s.getState().document).toEqual(JSON.parse(aurora));
    expect(s.getState().selection).toEqual([]);
    expect(s.getState().history.past).toEqual([]);
    // the renderer hears one change that replaces the pages
    expect(changes.map((c) => c.patches.map((p) => `${p.op} /${p.path.join('/')}`))).toEqual([['replace /pages']]);
  });

  it('refuses a file that is not JSON, a newer version and a document the model rejects, and keeps the document', () => {
    const s = store();
    const before = s.getState().document;
    const refused = (file: string) => {
      const result = s.dispatch('project.open', { file });
      expect(s.getState().document).toBe(before);
      return result.status === 'refused' ? result.message : null;
    };
    expect(refused('{not json')?.key).toBe('status.open.invalidArchive');
    expect(refused(JSON.stringify({ ...JSON.parse(aurora), version: 9 }))).toEqual({ key: 'status.open.newerVersion', params: { version: 9 } });
    const broken = JSON.parse(aurora) as { pages: { tree: { children: { type: string }[] } }[] };
    const first = broken.pages[0]?.tree.children[0];
    if (first) first.type = 'banner';
    // the reason is words of the catalogue with the path of the first problem, never the validator's prose (DEF-0549)
    expect(refused(JSON.stringify(broken))).toEqual({ key: 'status.open.invalidArchive', params: { reason: { key: 'status.open.invalidDocument', params: { path: '/pages/0/tree/children/0/type' } } } });
  });

  // CORE-1: the file is read by its own breakpoints, never by the open project's table
  it('opens a file styled at a default breakpoint the open project removed, and refuses one styled at a breakpoint only the open project has', () => {
    const empty = createEmptyDocument(sequentialIds('f'), { page: 'Home', root: 'Page' }, RULES.root);
    const styledAt = (breakpoint: string) => JSON.stringify({ ...empty, pages: [{ ...empty.pages[0], tree: { ...empty.pages[0]?.tree, styles: { [breakpoint]: { base: { 'padding-top': '10px' } } } } }] });
    const tablet = RULES.breakpointTable.find((b) => b.id === 'tablet');
    expect(tablet).toBeDefined();
    const withoutTablet = RULES.breakpointTable.filter((b) => b.id !== 'tablet');
    const own = [...withoutTablet.slice(0, 1), { id: 'small', name: 'Small', width: (tablet?.width ?? 800) - 1, height: 900, base: false }, ...withoutTablet.slice(1).filter((b) => b.width < (tablet?.width ?? 800) - 1)];
    const opened = (current: DocumentJson, file: string) => {
      const s = store();
      expect(s.dispatch('project.open', { file: JSON.stringify(current) })).toEqual({ status: 'done', changed: true });
      const result = s.dispatch('project.open', { file });
      return result.status === 'confirm' ? s.answer(true) : result;
    };
    expect(opened({ ...empty, breakpoints: withoutTablet }, styledAt('tablet'))).toEqual({ status: 'done', changed: true });
    expect(opened({ ...empty, breakpoints: own }, styledAt('small')).status).toBe('refused');
  });

  // CORE-2: File › Save project never writes a file File › Open refuses
  it('refuses, in words, to save a project larger than a project file holds', () => {
    const empty = createEmptyDocument(sequentialIds('h'), { page: 'Home', root: 'Page' }, RULES.root);
    const bytes = 'A'.repeat(PROJECT_FILE_LIMITS.entryBytes);
    const saved = runHandler(saveProject, { ...empty, files: [{ path: 'img/big.png', type: 'image/png', bytes }] }).outcome;
    expect(saved.kind).toBe('refused');
    expect(saved.kind === 'refused' ? saved.message.key : null).toBe('status.project.tooLarge');
    // a project within the bound is written
    const small = runHandler(saveProject, empty).outcome;
    expect(small.kind === 'change' ? small.download?.name : null).toBe('project.zip');
  });

  // CORE-3: replacing a project that holds work asks first, whatever the work is
  it('asks before replacing a project whose page is empty but which holds files, classes, tokens, colours or breakpoints', () => {
    const empty = createEmptyDocument(sequentialIds('e'), { page: 'Home', root: 'Page' }, RULES.root);
    expect(isEmptyProject(empty)).toBe(true);
    expect(isEmptyProject({ ...empty, language: 'pt-BR', classes: [] })).toBe(true);
    for (const work of [
      { files: [{ path: 'img/a.png', type: 'image/png', bytes: 'AAAA' }] },
      { classes: [{ name: 'card', styles: {} }] },
      { tokens: [{ name: 'brand', kind: 'color', value: '#000' }] },
      { swatches: ['#fff'] },
      { breakpoints: RULES.breakpointTable.slice(0, 2).map((b, i) => ({ ...b, base: i === 0 })) },
    ] as const) {
      const held = { ...empty, ...work } as DocumentJson;
      expect(isEmptyProject(held), JSON.stringify(work)).toBe(false);
    }
    const guided = { ...empty, pages: [{ ...empty.pages[0], tree: { ...empty.pages[0]?.tree, guides: [{ id: 'g', axis: 'vertical', at: 10 }] } }] } as DocumentJson;
    expect(isEmptyProject(guided)).toBe(false);
    const s = store();
    expect(s.dispatch('project.open', { file: JSON.stringify({ ...empty, swatches: ['#fff'] }) })).toEqual({ status: 'done', changed: true });
    expect(s.dispatch('project.newBlankPage', {}).status).toBe('confirm');
    expect(s.dispatch('project.open', { file: aurora }).status).toBe('confirm');
  });
});
