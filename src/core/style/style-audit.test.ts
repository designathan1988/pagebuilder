// The style audit of 2026-10-21 (STYLE-1, 2, 5, 8, 12, 13 and INPUT-9): each case runs the command the person's door
// runs, in the context the store hands it (the class targeted, the layer edited, the keyframe under the playhead).
import { describe, expect, it } from 'vitest';
import type { NodeId } from '../../generated/commands.ts';
import type { HandlerContext } from '../commands/registry.ts';
import { locate, type DocNode, type DocumentJson, type StructuredLayer } from '../document/model.ts';
import { validateDocument } from '../document/validate.ts';
import { EMPTY_HISTORY } from '../history/history.ts';
import { applyPatches } from '../history/transaction.ts';
import { manualClock } from '../ports/clock.ts';
import type { CssSupport } from '../ports/css.ts';
import { sequentialIds } from '../ports/ids.ts';
import { noLayout, type Layout } from '../ports/layout.ts';
import { commandOf } from '../../manifest/runtime.ts';
import { RULES, documentOf, node } from '../testing/handlers.ts';
import { applyCssRuleCommand } from './css-rule.ts';
import { setCustomDeclarationsCommand } from './custom.ts';
import { decimalPoint, readDecimal } from './decimal.ts';
import { organizeCommand } from './organize.ts';
import { resetValueCommand } from './reset.ts';
import { declarationTexts, readValue, replacedDeclarations, setStyleCommand } from './set.ts';

// a browser that refuses what Chrome refuses here: "banana" anywhere, a length as an opacity
const chrome: CssSupport = { supports: (property, value) => value !== 'banana' && !(property === 'opacity' && /px$/.test(value)) };
const shadow: StructuredLayer[] = [{ color: '#000000', offsetX: '2px', offsetY: '2px', blur: '2px', spread: '2px', inset: false, hidden: false }];
const page = (children: DocNode[], fields: Partial<DocumentJson> = {}): DocumentJson => documentOf({ ...fields, pages: [{ id: 'p1', name: 'Home', file: 'index.html', tree: node('root', 'page', 'body', { children }) }] });
const context = (document: DocumentJson, selection: string[], extra: Partial<HandlerContext<never>> = {}): HandlerContext<never> =>
  ({ state: { document, selection: selection as NodeId[], history: EMPTY_HISTORY, message: null, ui: undefined as never }, clock: manualClock(), ids: sequentialIds('n'), rules: RULES, words: (key) => key, layout: noLayout, css: chrome, ...extra }) as HandlerContext<never>;
const after = (document: DocumentJson, outcome: ReturnType<typeof applyCssRuleCommand.run>): DocumentJson => (outcome.kind === 'change' ? applyPatches(document, outcome.patches ?? []).document : document);
const stylesOf = (document: DocumentJson, id: string) => locate(document, id as NodeId)?.node.styles;

describe('a whole rule shows what it replaces (STYLE-1)', () => {
  const box = node('box', 'div', 'div', { classes: ['card'], styles: { desktop: { base: { color: 'red' } }, tablet: { base: { width: '50%' } } } });
  const document = page([box], { classes: [{ name: 'card', styles: { desktop: { base: { 'padding-top': '24px', 'border-top-left-radius': '8px' } } } }] });
  it('with a class targeted, the rule is the class\'s, and Apply edits it alone', () => {
    const at = locate(document, 'box' as NodeId);
    if (at === null) throw new Error('no box');
    const shown = declarationTexts(replacedDeclarations(document, ['box' as NodeId], 'card', at, RULES.base), RULES).join('\n');
    expect(shown).toBe('padding-top: 24px;\nborder-top-left-radius: 8px;');
    const next = after(document, applyCssRuleCommand.run(context(document, ['box'], { styleClass: 'card' }), { css: shown.replace('24px', '30px') }));
    expect(next.classes?.[0]?.styles).toEqual({ desktop: { base: { 'padding-top': '30px', 'border-top-left-radius': '8px' } } });
    expect(stylesOf(next, 'box')).toEqual(box.styles);
  });
  it('at Tablet, the declarations field shows and replaces the Tablet layer', () => {
    const at = locate(document, 'box' as NodeId);
    if (at === null) throw new Error('no box');
    const tablet = { breakpoint: 'tablet', state: 'base' };
    expect(declarationTexts(replacedDeclarations(document, ['box' as NodeId], null, at, tablet), RULES)).toEqual(['width: 50%;']);
    const next = after(document, setCustomDeclarationsCommand.run(context(document, ['box'], { rules: { ...RULES, base: tablet } }), { target: 'box', declarations: 'width: 40%;' }));
    expect(stylesOf(next, 'box')).toEqual({ desktop: { base: { color: 'red' } }, tablet: { base: { width: '40%' } } });
  });
});

describe('a shadow in a whole rule (STYLE-2)', () => {
  const document = page([node('box', 'div', 'div', { styles: { desktop: { base: { color: 'red', 'box-shadow': shadow } } } })]);
  it('is shown as its CSS, kept when the rule is applied unchanged, and read into layers when typed', () => {
    const at = locate(document, 'box' as NodeId);
    if (at === null) throw new Error('no box');
    const shown = declarationTexts(replacedDeclarations(document, ['box' as NodeId], null, at, RULES.base), RULES).join('\n');
    expect(shown).toBe('color: red;\nbox-shadow: #000000 2px 2px 2px 2px;');
    const same = applyCssRuleCommand.run(context(document, ['box']), { css: shown });
    expect(same.kind === 'change' ? (same.patches ?? []) : null).toEqual([]);
    const typed = after(document, setCustomDeclarationsCommand.run(context(document, ['box']), { target: 'box', declarations: 'box-shadow: 0 2px 4px red;' }));
    expect(validateDocument(typed, [], RULES)).toEqual([]);
    expect(stylesOf(typed, 'box')).toEqual({ desktop: { base: { 'box-shadow': [{ color: 'red', offsetX: '0px', offsetY: '2px', blur: '4px', spread: '0px', inset: false, hidden: false }] } } });
  });
});

describe('a whole rule takes what the browser takes (STYLE-13)', () => {
  const document = page([node('box', 'div', 'div')]);
  it.each(['width: banana;', 'opacity: 2px;'])('%s is refused', (declarations) => {
    const outcome = setCustomDeclarationsCommand.run(context(document, ['box']), { target: 'box', declarations });
    expect(outcome.kind === 'refused' ? outcome.message.key : outcome.kind).toBe('status.css.badValue');
  });
});

describe('a field on a keyframe (STYLE-5)', () => {
  const box = node('box', 'div', 'div', { styles: { desktop: { base: { opacity: '0.5' } } }, animations: [{ name: 'fade', settings: {}, keyframes: [{ offset: 0, easing: '', declarations: { opacity: '0' } }, { offset: 100, easing: '', declarations: {} }] }] });
  const document = page([box]);
  const onKeyframe = context(document, ['box'], { keyframe: { node: 'box' as NodeId, animation: 'fade', keyframe: 0 } });
  it('resets the keyframe\'s value and keeps the element\'s own', () => {
    const next = after(document, resetValueCommand.run(onKeyframe, { property: 'opacity' }));
    const held = locate(next, 'box' as NodeId)?.node;
    expect(held?.styles).toEqual(box.styles);
    expect(held?.animations?.[0]?.keyframes[0]?.declarations).toEqual({});
  });
  it('an empty text where the keyframe holds nothing asks for nothing', () => {
    const outcome = setStyleCommand.run(onKeyframe, { property: 'width', value: '' });
    expect(outcome).toEqual({ kind: 'change' });
  });
});

describe('organize inside an instance (STYLE-8)', () => {
  const kids = (prefix: string) => [node(`${prefix}a`, 'div', 'div', { componentPart: [0, 0] }), node(`${prefix}b`, 'div', 'div', { componentPart: [0, 1] })];
  const definition = node('d-root', 'div', 'div', { children: [node('d-inner', 'div', 'div', { children: kids('d-') })] });
  const instance = node('card', 'div', 'div', { component: 'Card', componentPart: [], children: [node('inner', 'div', 'div', { componentPart: [0], children: kids('') })] });
  const document = page([instance], { components: [{ name: 'Card', tree: definition }] });
  const drawn: Record<string, { x: number; y: number; width: number; height: number }> = { a: { x: 0, y: 0, width: 100, height: 20 }, b: { x: 0, y: 36, width: 100, height: 20 } };
  const layout: Layout = { ...noLayout, box: (id) => drawn[id] ?? null };
  it('measures the drawn children and writes the definition and the instance', () => {
    const outcome = organizeCommand.run(context(document, ['inner'], { layout }), commandOf(organizeCommand.command).entryPoints[0]?.args as Parameters<typeof organizeCommand.run>[1]);
    expect(outcome.kind).toBe('change');
    const next = after(document, outcome);
    expect(validateDocument(next, [], RULES)).toEqual([]);
    expect(JSON.stringify(stylesOf(next, 'inner'))).toContain('"display":"flex"');
    expect(JSON.stringify(next.components?.[0]?.tree.children[0]?.styles)).toContain('"display":"flex"');
  });
});

describe('a variable in a field takes its value\'s kind (STYLE-12)', () => {
  const document = page([node('box', 'div', 'div')], { tokens: [{ name: 'brand', kind: 'color', value: '#0b7f72' }, { name: 'gap', kind: 'length', value: '16px' }] });
  it('a colour variable is no width; a length variable is', () => {
    expect(readValue(context(document, ['box']), 'width', 'var(--brand)')).toBeNull();
    expect(readValue(context(document, ['box']), 'width', '--gap')?.css).toBe('var(--gap)');
  });
});

describe('the one decimal reader (INPUT-9)', () => {
  it('reads a comma with or without a digit before it', () => {
    expect([readDecimal('12,5'), readDecimal(',5'), readDecimal('-.25'), readDecimal('3'), readDecimal(''), readDecimal('1,2,3')]).toEqual([12.5, 0.5, -0.25, 3, Number.NaN, Number.NaN]);
    expect([decimalPoint(',5rem'), decimalPoint('1,5px'), decimalPoint('a, b')]).toEqual(['.5rem', '1.5px', 'a, b']);
  });
  it('",5rem" is a width of .5rem', () => {
    const document = page([node('box', 'div', 'div')]);
    const next = after(document, setStyleCommand.run(context(document, ['box']), { property: 'width', value: ',5rem' }));
    expect(JSON.stringify(stylesOf(next, 'box'))).toMatch(/"width":"0?\.5rem"/);
  });
});
