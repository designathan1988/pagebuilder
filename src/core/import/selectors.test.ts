import { describe, expect, it } from 'vitest';
import { compareSpecificity, matches, readSelector, specificityOf, splitSelectorList, type Facts, type Selector } from './selectors.ts';

const facts = (tag: string | null, classes: readonly string[] = [], attributes: Readonly<Record<string, string>> = {}, id: string | null = null): Facts => ({ tag, classes, id, attributes: new Map(Object.entries(attributes)) });

// a selector the tests read, which fails loudly when the reader refuses it
const read = (text: string): Selector => {
  const selector = readSelector(text);
  if (selector === null) throw new Error(`the reader refused "${text}"`);
  return selector;
};

describe('readSelector', () => {
  it('reads a compound selector with its type, classes, an id and attribute tests', () => {
    const compound = read('div.card#hero[data-kind="a"]');
    expect(compound.compounds).toHaveLength(1);
    expect(compound.compounds[0]).toMatchObject({ tag: 'div', classes: ['card'], id: 'hero', attributes: [{ name: 'data-kind', op: '=', value: 'a' }] });
    expect(compound.specificity).toEqual([1, 2, 1]);
  });

  it('reads the descendant and the child combinators, and the pseudo-class a compound ends with', () => {
    const child = read('.band > .band__cta:hover');
    expect(child.combinators).toEqual(['>']);
    expect(child.compounds).toHaveLength(2);
    expect(child.compounds[1]?.pseudo).toBe('hover');
    expect(read('.a .b').combinators).toEqual([' ']);
  });

  it('reads a pseudo-element and a child position a compound ends with (the states of core/style/state-keys.ts)', () => {
    // a pseudo-element keeps one of its two colons, and counts as a type
    expect(read('.a::before').compounds[0]?.pseudo).toBe(':before');
    expect(read('.a:after').compounds[0]?.pseudo).toBe(':after');
    expect(read('.a::placeholder').specificity).toEqual([0, 1, 1]);
    // a child position's formula, its spaces and its "+" its own
    expect(read('.row:nth-child(2n + 1)').compounds[0]?.pseudo).toBe('nth-child(2n+1)');
    expect(read('.card:hover .card__title').compounds[0]?.pseudo).toBe('hover');
  });

  it('reads nothing for :not(), a chain of pseudo-classes, a sibling combinator or a selector list', () => {
    expect(readSelector('.a:not(.b)')).toBeNull();
    expect(readSelector('.a:hover::before')).toBeNull();
    expect(readSelector('.a:nth-last-child(2)')).toBeNull();
    expect(readSelector('.a + .b')).toBeNull();
    expect(readSelector('.a, .b')).toBeNull();
  });
});

describe('matches', () => {
  const title = facts('h2', ['band__title']);
  const cta = facts('a', ['band__cta'], { href: 'https://x.example' });
  const lead = facts('p', ['band__lead']);

  it('matches a class and a type, and refuses what the element does not carry', () => {
    expect(matches(read('.band__title'), title, [])).toBe(true);
    expect(matches(read('h2'), title, [])).toBe(true);
    expect(matches(read('h3'), title, [])).toBe(false);
    expect(matches(read('.band__cta'), title, [])).toBe(false);
  });

  it('matches an attribute test and a descendant, and reads the child combinator apart', () => {
    const band = facts('section', ['band']);
    expect(matches(read('[href]'), cta, [])).toBe(true);
    expect(matches(read('[href^="https"]'), cta, [])).toBe(true);
    expect(matches(read('[href^="http:"]'), cta, [])).toBe(false);
    // the nearest ancestor first, as a page's lineage reads
    expect(matches(read('.band .band__cta'), cta, [lead, band])).toBe(true);
    expect(matches(read('.band > .band__cta'), cta, [lead, band])).toBe(false);
    expect(matches(read('.band > .band__cta'), cta, [band])).toBe(true);
  });

  it('counts what a selector names, as CSS counts specificity', () => {
    expect(read('p').specificity).toEqual([0, 0, 1]);
    expect(read('.card').specificity).toEqual([0, 1, 0]);
    expect(read('#lead').specificity).toEqual([1, 0, 0]);
    expect(read('.a.b p').specificity).toEqual([0, 2, 1]);
  });
});

// The specificity of any selector (Selectors 4's examples), which the canvas uses to rank the rules the browser
// matches on an element (BW1).
describe('specificityOf', () => {
  it('counts ids, then classes, attributes and pseudo-classes, then types and pseudo-elements', () => {
    expect(specificityOf('*')).toEqual([0, 0, 0]);
    expect(specificityOf('li')).toEqual([0, 0, 1]);
    expect(specificityOf('ul ol+li')).toEqual([0, 0, 3]);
    expect(specificityOf('h1 + *[rel=up]')).toEqual([0, 1, 1]);
    expect(specificityOf('ul ol li.red')).toEqual([0, 1, 3]);
    expect(specificityOf('li.red.level')).toEqual([0, 2, 1]);
    expect(specificityOf('#x34y')).toEqual([1, 0, 0]);
    expect(specificityOf('a:hover::before')).toEqual([0, 1, 2]);
    expect(specificityOf('p:first-line')).toEqual([0, 0, 2]);
    expect(specificityOf('[data-node="a b"] > .card')).toEqual([0, 2, 0]);
  });

  it('counts nothing for :where, the most specific argument for :is, :not and :has, and the of-selector of :nth-child', () => {
    expect(specificityOf(':where(button, input[type="button"])')).toEqual([0, 0, 0]);
    expect(specificityOf(':where(#a) p')).toEqual([0, 0, 1]);
    expect(specificityOf(':is(em, #foo)')).toEqual([1, 0, 0]);
    expect(specificityOf('.qux:where(em, #foo#bar#baz)')).toEqual([0, 1, 0]);
    expect(specificityOf(':not(em, strong#foo)')).toEqual([1, 0, 1]);
    expect(specificityOf('.card:has(> img)')).toEqual([0, 1, 1]);
    expect(specificityOf(':nth-child(2n+1)')).toEqual([0, 1, 0]);
    expect(specificityOf(':nth-child(even of li.important)')).toEqual([0, 2, 1]);
    expect(specificityOf('input:not([type="checkbox"]):not([type="radio"])')).toEqual([0, 2, 1]);
  });

  it('splits a list at its own commas only, and ranks two specificities', () => {
    expect(splitSelectorList('a, :is(b, c), [title="d, e"]')).toEqual(['a', ':is(b, c)', '[title="d, e"]']);
    expect(compareSpecificity([0, 1, 0], [0, 0, 9])).toBeGreaterThan(0);
    expect(compareSpecificity([1, 0, 0], [0, 9, 9])).toBeGreaterThan(0);
    expect(compareSpecificity([0, 1, 1], [0, 1, 1])).toBe(0);
  });
});
