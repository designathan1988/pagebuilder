import { describe, expect, it } from 'vitest';
import type { DocNode, DocumentJson } from '../../core/document/model.ts';
import { manualClock } from '../../core/ports/clock.ts';
import { sequentialIds } from '../../core/ports/ids.ts';
import { MODEL_RULES, createEditorStore, layeredRules } from '../store.ts';
import { valueOrigin } from './origin.ts';
import fixture from '../../../manifest/features/fixtures/aurora.json';

const aurora = fixture as unknown as DocumentJson;
type Styles = DocNode['styles'];

// the fixture with styles on some of its nodes and the project's classes
function documentWith(styles: Readonly<Record<string, Styles>>, classes: DocumentJson['classes'] = [], classesOn: Readonly<Record<string, readonly string[]>> = {}): DocumentJson {
  const dress = (node: DocNode): DocNode => ({ ...node, styles: styles[node.id] ?? node.styles, classes: classesOn[node.id] ?? node.classes, children: node.children.map(dress) });
  return { ...aurora, classes, pages: aurora.pages.map((p) => ({ ...p, tree: dress(p.tree) })) };
}
const store = () => createEditorStore({ ids: sequentialIds('n'), clock: manualClock() });
const stateOf = (document: DocumentJson, selected: string) => ({ ...store().getState(), document, selection: [selected] });

describe('the origin of the value a Style field shows (inspector/origin.ts)', () => {
  it('names the class a value comes from while the element holds none of its own, and its own value otherwise', () => {
    const cls = [{ name: 'card2', styles: { desktop: { base: { 'min-width': '160px' } } } }];
    const onClass = documentWith({}, cls, { 'n-card-b': ['card2'] });
    expect(valueOrigin(stateOf(onClass, 'n-card-b'), ['min-width'], MODEL_RULES)).toEqual({ kind: 'class', name: 'card2' });
    const own = documentWith({ 'n-card-b': { desktop: { base: { 'min-width': '200px' } } } }, cls, { 'n-card-b': ['card2'] });
    expect(valueOrigin(stateOf(own, 'n-card-b'), ['min-width'], MODEL_RULES)).toEqual({ kind: 'here', breakpoint: 'desktop', state: 'base' });
  });

  it('names the nearest ancestor an inherited property comes from, through its own styles or a class', () => {
    const onHero = documentWith({ 'n-plans': { desktop: { base: { color: '#aa0000' } } } });
    expect(valueOrigin(stateOf(onHero, 'n-card-b-title'), ['color'], MODEL_RULES)).toEqual({ kind: 'inherited', from: 'Plans' });
    // the nearer ancestor wins
    const nearer = documentWith({ 'n-plans': { desktop: { base: { color: '#aa0000' } } }, 'n-grid': { desktop: { base: { color: '#00aa00' } } } });
    expect(valueOrigin(stateOf(nearer, 'n-card-b-title'), ['color'], MODEL_RULES)).toEqual({ kind: 'inherited', from: 'Grid' });
    // through a class of the card
    const byClass = documentWith({}, [{ name: 'ink', styles: { desktop: { base: { color: '#0000aa' } } } }], { 'n-card-b': ['ink'] });
    expect(valueOrigin(stateOf(byClass, 'n-card-b-title'), ['color'], MODEL_RULES)).toEqual({ kind: 'inherited', from: 'CardB' });
    // a property that is not inherited: the default, whatever an ancestor sets
    const minWidth = documentWith({ 'n-plans': { desktop: { base: { 'min-width': '10px' } } } });
    expect(valueOrigin(stateOf(minWidth, 'n-card-b-title'), ['min-width'], MODEL_RULES)).toEqual({ kind: 'default' });
  });

  it('names the larger breakpoint a value comes from, the edited one when it is set there, and the default when nothing sets it', () => {
    const s = store();
    s.dispatch('view.setBreakpoint', { breakpoint: 'tablet' });
    const tablet = layeredRules(s.getState());
    const desktopOnly = documentWith({ 'n-intro': { desktop: { base: { color: '#aa0000' } } } });
    expect(valueOrigin(stateOf(desktopOnly, 'n-intro'), ['color'], tablet)).toEqual({ kind: 'breakpoint', breakpoint: 'desktop', state: 'base' });
    const atTablet = documentWith({ 'n-intro': { desktop: { base: { color: '#aa0000' } }, tablet: { base: { color: '#00aa00' } } } });
    expect(valueOrigin(stateOf(atTablet, 'n-intro'), ['color'], tablet)).toEqual({ kind: 'here', breakpoint: 'tablet', state: 'base' });
    expect(valueOrigin(stateOf(documentWith({}), 'n-intro'), ['color'], tablet)).toEqual({ kind: 'default' });
    expect(valueOrigin({ ...stateOf(documentWith({}), 'n-intro'), selection: [] }, ['color'], tablet)).toBeNull();
  });
});

describe('a state rule of a class outranks the element\'s own base rule (the audit\'s STYLE-9)', () => {
  it('at Hover, the class\'s hover value is the origin, not the element\'s base value', () => {
    const hover = { ...MODEL_RULES, base: { breakpoint: MODEL_RULES.base.breakpoint, state: 'hover' } };
    const document = documentWith({ 'n-card-b': { desktop: { base: { color: '#aa0000' } } } }, [{ name: 'card2', styles: { desktop: { hover: { color: '#0000aa' } } } }], { 'n-card-b': ['card2'] });
    expect(valueOrigin(stateOf(document, 'n-card-b'), ['color'], hover)).toEqual({ kind: 'class', name: 'card2' });
    // at Base, the element's own value still wins
    expect(valueOrigin(stateOf(document, 'n-card-b'), ['color'], MODEL_RULES)).toEqual({ kind: 'here', breakpoint: 'desktop', state: 'base' });
  });
});
