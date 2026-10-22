// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableCSSFileLoading":true,"handleDisabledFileLoadingAsSuccess":true,"disableJavaScriptFileLoading":true}}
// The style states of spec state-styles beyond hover and focus: checked, focus within, child positions (odd, even, a
// formula), empty, the placeholder text, the selected text, a list marker, the current page's link and parent states.
// Each is stored per breakpoint on an element or a class, validated, written by the canvas's and the export's one
// writer (core/render/output.ts nodeCss) and read back by the import, so an export imported and exported again writes
// the same stylesheet.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lexer as cssLexer } from 'css-tree';
import type { DocNode, DocumentJson } from '../document/model.ts';
import { validateDocument } from '../document/validate.ts';
import { manualClock } from '../ports/clock.ts';
import { sequentialIds } from '../ports/ids.ts';
import type { CssSupport } from '../ports/css.ts';
import { unzip } from '../project/zip.ts';
import { nodeCss } from '../render/output.ts';
import type { CommandId } from '../../generated/ids.ts';
import { createEditorStore, MODEL_RULES } from '../../editor/store.ts';
import { emptyProject } from '../../manifest/scenario.ts';
import { isStyleState, nthFormula, nthKey, orderedStates, parentKey, stateKind, stateSelector } from './state-keys.ts';

const table = MODEL_RULES.output.states;
const memory = (): { read(): string | null; write(text: string): void } => {
  let held: string | null = null;
  return { read: () => held, write: (text) => void (held = text) };
};
type Answer = { readonly status: string };
const grammarCss: CssSupport = { supports: (property, value) => cssLexer.matchProperty(property, value).error === null };
const fixture = (name: string): DocumentJson => JSON.parse(fs.readFileSync(`manifest/features/fixtures/${name}.json`, 'utf8')) as DocumentJson;

async function exportedFiles(document: DocumentJson): Promise<Map<string, Uint8Array>> {
  let bytes: Uint8Array | null = null;
  const store = createEditorStore({ storage: memory(), workspace: memory(), clock: manualClock(1), ids: sequentialIds('x'), restored: { document, selection: [] }, ports: { readOnly: () => false, css: grammarCss, downloads: { deliver: (file) => void (bytes = file.bytes) } }, freeze: true });
  const answer = (store.dispatch as unknown as (id: CommandId, args: unknown) => Answer)('project.export' as CommandId, {});
  if (answer.status !== 'done' || bytes === null) throw new Error(`export: ${answer.status}`);
  return unzip(bytes);
}

function imported(files: Map<string, Uint8Array>): DocumentJson {
  const picked = [...files].map(([name, bytes]) => ({ name, type: name.endsWith('.html') ? 'text/html' : name.endsWith('.css') ? 'text/css' : 'application/octet-stream', bytes: Buffer.from(bytes).toString('base64') }));
  const store = createEditorStore({ storage: memory(), workspace: memory(), clock: manualClock(1), ids: sequentialIds('y'), restored: { document: emptyProject({ page: 'Home', root: 'Page' }, MODEL_RULES.root), selection: [] }, ports: { readOnly: () => false, css: grammarCss }, freeze: true });
  const dispatch = store.dispatch as unknown as (id: CommandId, args: unknown) => Answer;
  let answer = dispatch('project.importHtml' as CommandId, { files: picked, destination: 'replace' });
  if (answer.status === 'confirm') answer = (store.answer(true) as Answer);
  if (answer.status !== 'done') throw new Error(`import: ${answer.status} ${JSON.stringify(store.getState().message)}`);
  return store.getState().document;
}
const text = (files: Map<string, Uint8Array>, name: string): string => new TextDecoder().decode(files.get(name) ?? new Uint8Array());

// a copy of the tree with one node's styles (by its name) replaced
function styled(tree: DocNode, name: string, styles: DocNode['styles']): DocNode {
  return { ...tree, ...(tree.name === name ? { styles } : {}), children: tree.children.map((child) => styled(child, name, styles)) };
}
function find(tree: DocNode, name: string): DocNode | undefined {
  if (tree.name === name) return tree;
  for (const child of tree.children) {
    const found = find(child, name);
    if (found !== undefined) return found;
  }
  return undefined;
}

describe('the keys of the style states', () => {
  it('writes a formula in its one canonical spelling, and a formula a state names as that state', () => {
    expect(nthFormula(' 2N + 1 ')).toBe('2n+1');
    expect(nthFormula('-n+3')).toBe('-n+3');
    expect(nthFormula('+3')).toBe('3');
    expect(nthFormula('0n+4')).toBe('4');
    expect(nthFormula('n-0')).toBe('n');
    expect(nthFormula('Odd')).toBe('odd');
    expect(nthFormula('2x+1')).toBeNull();
    expect(nthFormula('')).toBeNull();
    expect(nthKey('3n', table)).toBe('nth:3n');
    expect(nthKey('odd', table)).toBe('odd');
    expect(nthKey('even', table)).toBe('even');
    expect(nthKey('banana', table)).toBeNull();
  });

  it('knows a state of properties.json, a child position and a parent state, and nothing else', () => {
    expect(stateKind('hover', table)).toEqual({ kind: 'fixed', id: 'hover', pseudo: ':hover' });
    expect(stateKind('nth:2n+1', table)).toEqual({ kind: 'nth', formula: '2n+1' });
    expect(stateKind('parent:card:hover', table)).toEqual({ kind: 'parent', className: 'card', state: 'hover' });
    // a spelling that is not the canonical one, a formula a state names, an ancestor state no ancestor may be in, a
    // class name no class takes
    for (const key of ['nth:2n + 1', 'nth:odd', 'parent:card:visited', 'parent:card:before', 'parent:1card:hover', 'parent::hover', 'checked-ish']) expect(isStyleState(key, table), key).toBe(false);
    expect(parentKey('card', 'focus-within', table)).toBe('parent:card:focus-within');
    expect(parentKey('card', 'checked', table)).toBeNull();
  });

  it('writes each state as its selector', () => {
    const cases: readonly (readonly [string, string])[] = [
      ['checked', '.box:checked'],
      ['focus-within', '.box:focus-within'],
      ['odd', '.box:nth-child(odd)'],
      ['even', '.box:nth-child(even)'],
      ['nth:3n+1', '.box:nth-child(3n+1)'],
      ['empty', '.box:empty'],
      ['placeholder', '.box::placeholder'],
      ['selection', '.box::selection'],
      ['marker', '.box::marker'],
      ['current', '.box[aria-current="page"]'],
      ['parent:card:hover', '.card:hover .box'],
      ['parent:card:focus-within', '.card:focus-within .box'],
    ];
    for (const [key, selector] of cases) expect(stateSelector('.box', key, table), key).toBe(selector);
  });

  it('orders the rules: the states of properties.json, then the child positions, then the parent states', () => {
    expect(orderedStates(['parent:card:hover', 'nth:3n', 'hover', 'base'], table)).toEqual(['base', 'hover', 'nth:3n', 'parent:card:hover']);
  });
});

describe('the states written and validated', () => {
  it('writes an element\'s states per breakpoint, and never one its type does not take', () => {
    const css = nodeCss(
      { type: 'listItem', styles: { desktop: { marker: { color: '#ff0000' }, 'nth:2n+1': { opacity: '0.5' }, 'parent:card:hover': { color: '#0000ff' } }, phone: { odd: { opacity: '0.8' } }, tablet: { current: { color: '#00ff00' } } } as DocNode['styles'] },
      '.item',
      MODEL_RULES.output,
      'line',
    );
    expect(css).toContain('.item:nth-child(2n+1) { opacity: 0.5; }');
    expect(css).toContain('.item::marker { color: #ff0000; }');
    expect(css).toContain('.card:hover .item { color: #0000ff; }');
    expect(css).toContain('@media (max-width: 390px) {\n.item:nth-child(odd) { opacity: 0.8; }\n}');
    // Current stands on links: a list item writes none
    expect(css).not.toContain('aria-current');
  });

  it('accepts the new keys in a document, on an element and on a class, and refuses one that is no state', () => {
    const base = fixture('aurora');
    const page = base.pages[0] as DocumentJson['pages'][number];
    const tree = styled(page.tree, 'CardATitle', { desktop: { 'parent:card:hover': { color: '#1d4ed8' } }, phone: { 'nth:3n': { opacity: '0.5' } } } as DocNode['styles']);
    const good: DocumentJson = { ...base, pages: [{ ...page, tree }], classes: [{ name: 'card', styles: { desktop: { odd: { opacity: '0.9' }, 'focus-within': { color: '#111111' } } } }] as NonNullable<DocumentJson['classes']> };
    expect(validateDocument(good, [], MODEL_RULES)).toEqual([]);
    const bad: DocumentJson = { ...base, pages: [{ ...page, tree: styled(page.tree, 'CardATitle', { desktop: { 'nth:2n + 1': { color: '#1d4ed8' } } } as DocNode['styles']) }] };
    expect(validateDocument(bad, [], MODEL_RULES)).not.toEqual([]);
    // a state its type does not take: the placeholder text of a heading
    const misplaced: DocumentJson = { ...base, pages: [{ ...page, tree: styled(page.tree, 'CardATitle', { desktop: { placeholder: { color: '#1d4ed8' } } } as DocNode['styles']) }] };
    expect(validateDocument(misplaced, [], MODEL_RULES)).not.toEqual([]);
  });
});

describe('the states exported and imported back', () => {
  const site = (): DocumentJson => {
    const base = fixture('content-site');
    const pages = base.pages.map((page, index) => {
      if (index !== 0) return page;
      let tree = styled(page.tree, 'Home link', { desktop: { current: { color: '#b91c1c' } } } as DocNode['styles']);
      tree = styled(tree, 'About link', { desktop: { 'parent:menu:hover': { color: '#1d4ed8' } }, phone: { 'nth:2n+1': { opacity: '0.5' } } } as DocNode['styles']);
      tree = styled(tree, 'Brand', { desktop: { selection: { color: '#ffffff' }, empty: { opacity: '0' } } } as DocNode['styles']);
      const nav = find(tree, 'Nav');
      if (nav === undefined) throw new Error('content-site has no Nav');
      const named = (node: DocNode): DocNode => (node.name === 'Nav' ? { ...node, classes: ['menu'] } : { ...node, children: node.children.map(named) });
      return { ...page, tree: named(tree) };
    });
    return { ...base, pages, classes: [{ name: 'menu', styles: { desktop: { 'focus-within': { color: '#111111' }, even: { opacity: '0.9' } } } }] as NonNullable<DocumentJson['classes']> };
  };

  it('writes the state rules, and marks only the links to the page written as its current page', async () => {
    const files = await exportedFiles(site());
    const css = text(files, 'css/styles.css');
    expect(css).toMatch(/\.[\w-]+\[aria-current="page"\] \{\n {2}color: #b91c1c;/);
    expect(css).toMatch(/\.menu:hover \.[\w-]+ \{\n {2}color: #1d4ed8;/);
    expect(css).toMatch(/@media \(max-width: 390px\) \{\n {2}\.[\w-]+:nth-child\(2n\+1\) \{/);
    expect(css).toMatch(/\.[\w-]+::selection \{/);
    expect(css).toMatch(/\.[\w-]+:empty \{/);
    expect(css).toContain('.menu:focus-within {');
    expect(css).toContain('.menu:nth-child(even) {');
    const home = text(files, 'index.html');
    expect(home).toMatch(/<a [^>]*href="index\.html"[^>]*aria-current="page"|<a [^>]*aria-current="page"[^>]*href="index\.html"/);
    expect(home).not.toMatch(/href="about\.html"[^>]*aria-current/);
    // the About page holds no link to itself: it writes the mark on nothing
    expect(text(files, 'about.html')).not.toContain('aria-current');
  });

  it('reads the state rules back: the same stylesheet again, the states in their keys, no aria-current of its own', async () => {
    const first = await exportedFiles(site());
    const back = imported(first);
    const again = await exportedFiles(back);
    expect(text(again, 'css/styles.css')).toBe(text(first, 'css/styles.css'));
    expect(text(again, 'index.html')).toBe(text(first, 'index.html'));
    const tree = back.pages[0]?.tree;
    if (tree === undefined) throw new Error('nothing imported');
    const homeLink = find(tree, 'Home link');
    expect(homeLink?.styles.desktop?.current).toEqual({ color: '#b91c1c' });
    expect(homeLink?.customAttributes?.['aria-current']).toBeUndefined();
    const about = find(tree, 'About link');
    expect(about?.styles.desktop?.['parent:menu:hover']).toEqual({ color: '#1d4ed8' });
    expect(about?.styles.phone?.['nth:2n+1']).toEqual({ opacity: '0.5' });
    expect((back.classes ?? []).find((c) => c.name === 'menu')?.styles.desktop).toEqual({ 'focus-within': { color: '#111111' }, even: { opacity: '0.9' } });
  });
});
