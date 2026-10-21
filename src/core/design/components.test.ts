import { variantBase } from './components.ts';
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
import { setStyleCommand } from '../style/set.ts';
import { createComponentCommand, detachInstanceCommand, insertInstanceCommand } from './components.ts';
import { componentHolders } from './instances.ts';

const RULES = rulesFromManifest(manifest.elements, manifest.properties, manifest.html);
const node = (id: string, type: string, tag: string, fields: Partial<DocNode> = {}): DocNode => ({ id: id as NodeId, type: type as DocNode['type'], name: id, tag, attributes: {}, classes: [], styles: {}, text: null, children: [], ...fields });
const card = () => node('Card', 'article', 'article', { children: [node('Title', 'heading', 'h3', { text: 'Monthly' })] });
const doc = (children: DocNode[]): DocumentJson => ({ version: 4, pages: [{ id: 'p', name: 'Home', file: 'index.html', tree: node('Page', 'page', 'body', { children }) }] });
// one generator for the whole file: the ids of every command run here never meet, as the editor's random ones
const IDS = sequentialIds('x');
const context = (document: DocumentJson, selection: string[]): HandlerContext<never> => ({
  state: { document, selection: selection as NodeId[], history: EMPTY_HISTORY, message: null, ui: undefined as never },
  clock: manualClock(),
  ids: IDS,
  rules: RULES,
  words: (key) => key,
  layout: noLayout,
  css: anyCss,
});
// the document an outcome makes, which must satisfy the model
function after(document: DocumentJson, outcome: ReturnType<typeof createComponentCommand.run>): DocumentJson {
  if (outcome.kind !== 'change') throw new Error(`refused: ${JSON.stringify(outcome)}`);
  const next = applyPatches(document, outcome.patches ?? []).document;
  expect(validateDocument(next, [], RULES)).toEqual([]);
  return next;
}
const made = () => after(doc([card()]), createComponentCommand.run(context(doc([card()]), ['Card']), {}));

describe('components.create (spec reusable-components)', () => {
  it('makes the element a definition and its first instance', () => {
    const next = made();
    expect(next.components?.map((c) => c.name)).toEqual(['Card']);
    const instance = next.pages[0]?.tree.children[0];
    expect(instance?.component).toBe('Card');
    expect(instance?.componentPart).toEqual([]);
    expect(instance?.children[0]?.componentPart).toEqual([0]);
    // the definition has ids of its own
    expect(next.components?.[0]?.tree.id).not.toBe('Card');
  });

  it('refuses the page root, an instance, an element inside one and a locked element', () => {
    const outcome = (document: DocumentJson, id: string) => createComponentCommand.run(context(document, [id]), {});
    expect(outcome(doc([card()]), 'Page')).toMatchObject({ kind: 'refused', message: { key: 'status.components.root' } });
    expect(outcome(made(), 'Card')).toMatchObject({ kind: 'refused', message: { key: 'status.components.inInstance' } });
    expect(outcome(made(), 'Title')).toMatchObject({ kind: 'refused', message: { key: 'status.components.inInstance' } });
    expect(outcome(doc([{ ...card(), locked: true }]), 'Card')).toMatchObject({ kind: 'refused', message: { key: 'status.locked.edit' } });
  });
});

describe('components.insertInstance and detach', () => {
  it('places a new instance with new ids and free names, never inside an instance', () => {
    const first = made();
    const next = after(first, insertInstanceCommand.run(context(first, ['Page']), { component: 'Card' }));
    const placed = next.pages[0]?.tree.children[1];
    expect(placed).toMatchObject({ name: 'Card 2', component: 'Card', componentPart: [] });
    expect(placed?.children[0]).toMatchObject({ name: 'Title 2', componentPart: [0], text: 'Monthly' });
    // a parent named inside an instance refuses, in words of its own (the audit's STRUCT-8)
    expect(insertInstanceCommand.run(context(first, ['Page']), { component: 'Card', parent: 'Card' as NodeId })).toMatchObject({ kind: 'refused', message: { key: 'status.instance.nested' } });
  });

  it('places the instance right after a selected instance, or the instance of a selected element of one (STRUCT-8)', () => {
    const first = made();
    for (const selected of ['Card', 'Title']) {
      const next = after(first, insertInstanceCommand.run(context(first, [selected]), { component: 'Card' }));
      expect(next.pages[0]?.tree.children.map((child) => child.component)).toEqual(['Card', 'Card']);
    }
  });

  // the one rule a palette tile is placed by (insert.ts placement): an instance its selected place refuses goes right
  // after the nearest ancestor whose parent takes it (the real-use audit, USE-7: a site header's component with the
  // page's header selected was refused, "<header> cannot sit inside <header>"; with a section's box selected it landed
  // inside the section)
  it('places an instance its selected place refuses after it, where a parent takes it, as a palette tile is placed', () => {
    const top = node('Top', 'header', 'header', { children: [node('Brand', 'link', 'a', { text: 'Brand' })] });
    const contact = node('Contact', 'section', 'section', { children: [node('Box', 'div', 'div')] });
    const first: DocumentJson = { ...doc([top, contact]), components: [{ name: 'Site header', tree: node('Def', 'header', 'header', { children: [node('Def-brand', 'link', 'a', { text: 'Brand' })] }) }] };
    for (const [selected, at] of [['Top', 1], ['Brand', 1], ['Box', 2], ['Contact', 2]] as const) {
      const next = after(first, insertInstanceCommand.run(context(first, [selected]), { component: 'Site header' }));
      expect(next.pages[0]?.tree.children[at]?.component).toBe('Site header');
    }
    // a list takes only its items: a paragraph's component goes right after the selected list (DEF-0601)
    const listed: DocumentJson = { ...doc([node('Perks', 'list', 'ul', { children: [node('One', 'listItem', 'li')] })]), components: [{ name: 'Note', tree: node('Def-note', 'paragraph', 'p', { text: 'Note' }) }] };
    const noted = after(listed, insertInstanceCommand.run(context(listed, ['Perks']), { component: 'Note' }));
    expect(noted.pages[0]?.tree.children.map((child) => child.component ?? child.name)).toEqual(['Perks', 'Note']);
  });

  it('gives each instance fresh HTML ids while preserving references within it', () => {
    const source = node('Card', 'article', 'article', { attributes: { id: 'card' }, children: [
      node('Control', 'input', 'input', { attributes: { id: 'control' } }),
      node('Label', 'label', 'label', { attributes: { labelFor: 'Control' } }),
    ] });
    const initial = doc([source]);
    const first = after(initial, createComponentCommand.run(context(initial, ['Card']), {}));
    const second = after(first, insertInstanceCommand.run(context(first, ['Page']), { component: 'Card' }));
    const original = second.pages[0]?.tree.children[0];
    const placed = second.pages[0]?.tree.children[1];
    expect(original?.attributes.id).toBe('card');
    expect(placed?.attributes.id).toBe('card-copy');
    expect(placed?.children[0]?.attributes.id).toBe('control-copy');
    expect(placed?.children[1]?.attributes.labelFor).toBe(placed?.children[0]?.id);
  });

  it('detaching forgets the component and the parts', () => {
    const next = after(made(), detachInstanceCommand.run(context(made(), ['Card']), {}));
    const plain = next.pages[0]?.tree.children[0];
    expect(plain && 'component' in plain).toBe(false);
    expect(plain?.children[0] && 'componentPart' in plain.children[0]).toBe(false);
  });
});

describe('a style write on an element of an instance', () => {
  it('reaches the definition and every instance, and nothing else', () => {
    const first = made();
    const two = after(first, insertInstanceCommand.run(context(first, ['Page']), { component: 'Card' }));
    const titleOfSecond = two.pages[0]?.tree.children[1]?.children[0]?.id as string;
    expect(componentHolders(two, titleOfSecond as NodeId)?.map((h) => h.path.join('/'))).toEqual([
      'components/0/tree/children/0',
      'pages/0/tree/children/0/children/0',
      'pages/0/tree/children/1/children/0',
    ]);
    const styled = after(two, setStyleCommand.run(context(two, [titleOfSecond]), { property: 'color' as never, value: '#ff0000' }));
    const colour = (n: DocNode | undefined) => n?.styles.desktop?.base?.color;
    expect(colour(styled.components?.[0]?.tree.children[0])).toBe('#ff0000');
    expect(colour(styled.pages[0]?.tree.children[0]?.children[0])).toBe('#ff0000');
    expect(colour(styled.pages[0]?.tree.children[1]?.children[0])).toBe('#ff0000');
    // an element of no instance keeps writing to itself alone
    expect(componentHolders(two, 'Page' as NodeId)).toBeNull();
  });
});

describe('component variants (spec component-variants)', () => {
  it('names a variant class after its component as a BEM modifier', () => {
    expect(variantBase('Plan')).toBe('plan');
    expect(variantBase('Price Card 2')).toBe('price-card-2');
    expect(variantBase('2 columns')).toBe('c-2-columns');
  });
});
