import { describe, expect, it } from 'vitest';
import { manifest } from '../../manifest/runtime.ts';
import { sequentialIds } from '../ports/ids.ts';
import { createEmptyDocument, type DocNode, type DocumentJson } from './model.ts';
import { rulesFromManifest, validateDocument } from './validate.ts';

const rules = rulesFromManifest(manifest.elements, manifest.properties, manifest.html);

function project(children: DocNode[] = []): DocumentJson {
  const doc = createEmptyDocument(sequentialIds('p'), { page: 'Home', root: 'Page' }, rules.root);
  const page = doc.pages[0];
  if (!page) throw new Error('no page');
  return { ...doc, pages: [{ ...page, tree: { ...page.tree, children } }] };
}

const div = (id: string, fields: Partial<DocNode> = {}): DocNode => ({ id, type: 'div', name: 'Box', tag: 'div', attributes: {}, classes: [], styles: {}, text: null, children: [], ...fields });
const paths = (doc: DocumentJson, selection: string[] = []) => validateDocument(doc, selection, rules).map((p) => p.path);

describe('validateDocument', () => {
  it('takes the page root from the manifest: the element whose tag is body', () => {
    const body = manifest.elements.elements.find((e) => e.tag === 'body');
    expect(rules.root).toEqual({ type: body?.id, tag: 'body' });
    expect(project().pages[0]?.tree).toMatchObject({ type: body?.id, tag: 'body' });
  });

  it('accepts the empty project and a valid tree', () => {
    expect(validateDocument(project(), [], rules)).toEqual([]);
    const tree = [div('a', { tag: 'section', classes: ['card', 'card--x'], attributes: { id: 'hero', title: 'Hi' }, styles: { desktop: { base: { width: '10px' } }, phone: { hover: { color: 'red' } } } })];
    expect(validateDocument(project(tree), ['a'], rules)).toEqual([]);
  });

  it('refuses duplicate ids, unknown types and tags that are not the element’s', () => {
    expect(paths(project([div('a'), div('a')]))).toEqual(['/pages/0/tree/children/1/id']);
    expect(paths(project([div('a', { type: 'blink' as DocNode['type'] })]))).toEqual(['/pages/0/tree/children/0/type']);
    expect(paths(project([div('a', { tag: 'span' })]))).toEqual(['/pages/0/tree/children/0/tag']);
    // a page root inside a page: its type, and a <body> inside a <body> by the content model (DEF-0540)
    expect(paths(project([div('a', { type: 'page', tag: 'body' })]))).toEqual(['/pages/0/tree/children/0/type', '/pages/0/tree/children/0']);
  });

  it('refuses attributes that are unknown or do not apply, bad class names, and unknown breakpoints, states and properties', () => {
    expect(paths(project([div('a', { attributes: { href: 'x' } as DocNode['attributes'] })]))).toEqual(['/pages/0/tree/children/0/attributes/href']);
    expect(paths(project([div('a', { attributes: { alt: 'x' } })]))).toEqual(['/pages/0/tree/children/0/attributes/alt']);
    expect(paths(project([div('a', { classes: ['9lives', 'ok', 'ok'] })]))).toEqual(['/pages/0/tree/children/0/classes/0', '/pages/0/tree/children/0/classes/2']);
    expect(paths(project([div('a', { styles: { watch: { base: { width: '1px' } } } as DocNode['styles'] })]))).toEqual(['/pages/0/tree/children/0/styles/watch']);
    expect(paths(project([div('a', { styles: { desktop: { visited: { width: '1px' } } } as DocNode['styles'] })]))).toEqual(['/pages/0/tree/children/0/styles/desktop/visited']);
    expect(paths(project([div('a', { styles: { desktop: { base: { 'box-shadow-color': 'red', width: '' } } } as DocNode['styles'] })]))).toEqual([
      '/pages/0/tree/children/0/styles/desktop/base/box-shadow-color',
      '/pages/0/tree/children/0/styles/desktop/base/width',
    ]);
  });

  it('refuses text where the element holds children, and children where it holds text or nothing', () => {
    const heading: DocNode = { id: 'h', type: 'heading', name: 'Title', tag: 'h2', attributes: {}, classes: [], styles: {}, text: 'Hello', children: [] };
    expect(paths(project([heading]))).toEqual([]);
    expect(paths(project([{ ...heading, text: null }]))).toEqual(['/pages/0/tree/children/0/text']);
    expect(paths(project([{ ...heading, children: [div('x')] }]))).toEqual(['/pages/0/tree/children/0/children']);
    expect(paths(project([div('a', { text: 'no' })]))).toEqual(['/pages/0/tree/children/0/text']);
  });

  it('accepts the hidden flag as true below the root, and refuses any other value and a hidden page root', () => {
    expect(paths(project([div('a', { hidden: true, children: [div('b', { hidden: true })] })]))).toEqual([]);
    expect(paths(project([div('a', { hidden: false } as unknown as Partial<DocNode>)]))).toEqual(['/pages/0/tree/children/0/hidden']);
    expect(paths(project([div('a', { hidden: 'yes' } as unknown as Partial<DocNode>)]))).toEqual(['/pages/0/tree/children/0/hidden']);
    const doc = project();
    const page = doc.pages[0];
    if (!page) throw new Error('no page');
    expect(paths({ ...doc, pages: [{ ...page, tree: { ...page.tree, hidden: true } }] })).toEqual(['/pages/0/tree/hidden']);
  });

  it('accepts the lock flag as true below the root, and refuses any other value and a locked page root', () => {
    expect(paths(project([div('a', { locked: true, children: [div('b', { locked: true })] })]))).toEqual([]);
    expect(paths(project([div('a', { locked: false } as unknown as Partial<DocNode>)]))).toEqual(['/pages/0/tree/children/0/locked']);
    expect(paths(project([div('a', { locked: 'yes' } as unknown as Partial<DocNode>)]))).toEqual(['/pages/0/tree/children/0/locked']);
    const doc = project();
    const page = doc.pages[0];
    if (!page) throw new Error('no page');
    expect(paths({ ...doc, pages: [{ ...page, tree: { ...page.tree, locked: true } }] })).toEqual(['/pages/0/tree/locked']);
  });

  it('refuses a selection that names a missing node or one node twice', () => {
    expect(paths(project([div('a')]), ['a', 'zz', 'a'])).toEqual(['/selection/1', '/selection/2']);
  });

  it('refuses a project without pages, and pages with a bad or repeated file', () => {
    const doc = project();
    expect(paths({ ...doc, pages: [] })).toEqual(['/pages']);
    const page = doc.pages[0];
    if (!page) throw new Error('no page');
    const second = { ...page, id: 'q1', tree: { ...page.tree, id: 'q2' } };
    expect(paths({ ...doc, pages: [page, second] })).toEqual(['/pages/1/file']);
    expect(paths({ ...doc, pages: [{ ...page, file: 'Index.HTML' }] })).toEqual(['/pages/0/file']);
  });
});

describe("a component's definition points at elements that are there (STRUCT-6)", () => {
  const withDefinition = (pageChildren: DocNode[], target: string): DocumentJson => ({
    ...project(pageChildren),
    components: [{ name: 'Card', tree: div('Def', { children: [div('Def-b', { interactions: [{ trigger: 'click', action: 'show', target }] as never })] }) }],
  });
  it('refuses a definition whose interaction targets no element', () => {
    expect(paths(withDefinition([], 'Gone'))).toEqual(['/components/0/tree/children/0/interactions/0/target']);
  });
  it('takes a target inside the definition or on a page', () => {
    expect(paths(withDefinition([], 'Def'))).toEqual([]);
    expect(paths(withDefinition([div('Panel')], 'Panel'))).toEqual([]);
  });
});
