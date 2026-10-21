// Family CS1 of the code audit (2026-10-04): Update component rebuilds every instance on the edited one, keeping each
// instance's own text and attributes where its element of the same part stands. A pasted or duplicated part keeps its
// part, so an element of another type stood at that part, and its text was given to the rebuilt element (the invariant
// probe, seed 4606: "a paragraph holds its text"), refusing the update.
import { describe, expect, it } from 'vitest';
import { documentOf, node, runHandler } from '../testing/handlers.ts';
import { updateFromInstanceCommand } from './components.ts';

describe('Update component keeps values of the same element only (CS1)', () => {
  it('an instance whose part is an element of another type takes the edited element whole', () => {
    const edited = node('A', 'div', 'div', { component: 'Card', componentPart: [], children: [node('A-t', 'paragraph', 'p', { text: 'Hello', componentPart: [0] })] });
    const other = node('B', 'div', 'div', { component: 'Card', componentPart: [], children: [node('B-box', 'div', 'div', { componentPart: [0] })] });
    const document = documentOf({
      pages: [{ id: 'home', name: 'Home', file: 'index.html', tree: node('Page', 'page', 'body', { children: [edited, other] }) }],
      components: [{ name: 'Card', tree: node('Def', 'div', 'div', { children: [node('Def-t', 'paragraph', 'p', { text: 'Hello' })] }) }],
    });
    const ran = runHandler(updateFromInstanceCommand, document, {}, { selection: ['A'] });
    expect(ran.problems).toEqual([]);
  });
});

// DEF-0615: a shared header edited on one page (its brand text, its menu link given an address) and updated: the other
// instances follow the texts and attributes they never changed, and keep the ones they did.
describe('Update component carries texts and links the other instances never changed (DEF-0615)', () => {
  it('a brand renamed and a link given an address reach the other pages; an overridden text stays', () => {
    const header = (id: string, brand: string, href: string | undefined, about: string) =>
      node(id, 'header', 'header', {
        component: 'Site header',
        componentPart: [],
        children: [
          node(`${id}-brand`, 'link', 'a', { text: brand, componentPart: [0], attributes: href === undefined ? {} : { href } }),
          node(`${id}-about`, 'link', 'a', { text: about, componentPart: [1] }),
        ],
      });
    const document = documentOf({
      pages: [
        { id: 'home', name: 'Home', file: 'index.html', tree: node('Page', 'page', 'body', { children: [header('A', 'Torra Fresca', 'index.html', 'Sobre')] }) },
        { id: 'about', name: 'About', file: 'about.html', tree: node('Page2', 'page', 'body', { children: [header('B', 'Marca', undefined, 'Quem somos')] }) },
      ],
      components: [{ name: 'Site header', tree: node('Def', 'header', 'header', { children: [node('Def-brand', 'link', 'a', { text: 'Marca' }), node('Def-about', 'link', 'a', { text: 'Sobre' })] }) }],
    });
    const ran = runHandler(updateFromInstanceCommand, document, {}, { selection: ['A'] });
    expect(ran.problems).toEqual([]);
    const other = ran.document.pages[1]?.tree.children[0];
    expect(other?.children[0]?.text).toBe('Torra Fresca');
    expect(other?.children[0]?.attributes).toEqual({ href: 'index.html' });
    expect(other?.children[1]?.text).toBe('Quem somos');
  });
});

// The audit of 2026-10-21 (STRUCT-2 to STRUCT-5): what stays each instance's own through an update, and what follows
// the edited one with the identities of the instance it reaches.
describe('Update component keeps each instance its own (STRUCT-2 to STRUCT-5)', () => {
  const card = (id: string, fields: Partial<ReturnType<typeof node>> = {}, text: Partial<ReturnType<typeof node>> = {}, extra: ReturnType<typeof node>[] = []) =>
    node(id, 'div', 'div', { component: 'Card', componentPart: [], ...fields, children: [node(`${id}-t`, 'paragraph', 'p', { text: 'Hello', componentPart: [0], ...text }), ...extra] });
  const project = (a: ReturnType<typeof node>, b: ReturnType<typeof node>) =>
    documentOf({
      pages: [{ id: 'home', name: 'Home', file: 'index.html', tree: node('Page', 'page', 'body', { children: [a, b] }) }],
      components: [{ name: 'Card', tree: node('Def', 'div', 'div', { children: [node('Def-t', 'paragraph', 'p', { text: 'Hello' })] }) }],
    });
  it('takes a text and its marks together from one side', () => {
    const marked = runHandler(updateFromInstanceCommand, project(card('A', {}, { text: 'Hello', inline: [{ tag: 'strong', children: ['Hello'] }] as never }), card('B', {}, { text: 'Other' })), {}, { selection: ['A'] });
    expect(marked.problems).toEqual([]);
    expect(marked.document.pages[0]?.tree.children[1]?.children[0]?.inline).toBeUndefined();
    const italic = [{ tag: 'em', children: ['Other'] }];
    const kept = runHandler(updateFromInstanceCommand, project(card('A'), card('B', {}, { text: 'Other', inline: italic as never })), {}, { selection: ['A'] });
    expect(kept.problems).toEqual([]);
    expect(kept.document.pages[0]?.tree.children[1]?.children[0]?.inline).toEqual(italic);
  });
  it('keeps another instance its variant, its hidden and locked flags, and gives the definition none', () => {
    const ran = runHandler(updateFromInstanceCommand, project(card('A', {}, { hidden: true }), card('B', { classes: ['card--gold'] }, { locked: true })), {}, { selection: ['A'] });
    expect(ran.problems).toEqual([]);
    const other = ran.document.pages[0]?.tree.children[1];
    expect(other?.classes).toEqual(['card--gold']);
    expect(other?.children[0]?.hidden).toBeUndefined();
    expect(other?.children[0]?.locked).toBe(true);
    expect(ran.document.components?.[0]?.tree.children[0]?.hidden).toBeUndefined();
  });
  it('refuses to change a locked element inside another instance', () => {
    const ran = runHandler(updateFromInstanceCommand, project(card('A', {}, { classes: ['lead'] }), card('B', {}, { locked: true })), {}, { selection: ['A'] });
    expect(ran.outcome.kind).toBe('refused');
  });
  it('points an interaction, an animation name and an HTML id new to the edited instance at each instance\'s own', () => {
    const panel = (id: string) => node(`${id}-p`, 'div', 'div', { componentPart: [1] });
    const a = card('A', {}, { interactions: [{ trigger: 'click', action: 'show', target: 'A-p' }] as never, animations: [{ name: 'fade', settings: {}, keyframes: [] }] as never, attributes: { id: 'promo' } }, [panel('A')]);
    const b = card('B', {}, {}, [panel('B')]);
    const document = documentOf({
      pages: [{ id: 'home', name: 'Home', file: 'index.html', tree: node('Page', 'page', 'body', { children: [a, b] }) }],
      components: [{ name: 'Card', tree: node('Def', 'div', 'div', { children: [node('Def-t', 'paragraph', 'p', { text: 'Hello' }), node('Def-p', 'div', 'div')] }) }],
    });
    const ran = runHandler(updateFromInstanceCommand, document, {}, { selection: ['A'] });
    expect(ran.problems).toEqual([]);
    const other = ran.document.pages[0]?.tree.children[1]?.children[0];
    expect(other?.interactions?.[0]?.target).toBe('B-p');
    expect(other?.animations?.[0]?.name).not.toBe('fade');
    expect(other?.attributes.id).not.toBe('promo');
    const definition = ran.document.components?.[0]?.tree;
    expect(definition?.children[0]?.interactions?.[0]?.target).toBe(definition?.children[1]?.id);
  });
  it('points an ARIA reference by HTML id at the HTML id each instance\'s element keeps', () => {
    const panel = (id: string, htmlId: string) => node(`${id}-p`, 'div', 'div', { componentPart: [1], attributes: { id: htmlId } });
    const a = card('A', {}, { customAttributes: { 'aria-controls': 'panel', 'aria-describedby': 'panel other' } }, [panel('A', 'panel')]);
    const b = card('B', {}, {}, [panel('B', 'panel-b')]);
    const document = documentOf({
      pages: [{ id: 'home', name: 'Home', file: 'index.html', tree: node('Page', 'page', 'body', { children: [a, b] }) }],
      components: [{ name: 'Card', tree: node('Def', 'div', 'div', { children: [node('Def-t', 'paragraph', 'p', { text: 'Hello' }), node('Def-p', 'div', 'div')] }) }],
    });
    const ran = runHandler(updateFromInstanceCommand, document, {}, { selection: ['A'] });
    expect(ran.problems).toEqual([]);
    const other = ran.document.pages[0]?.tree.children[1];
    expect(other?.children[1]?.attributes.id).toBe('panel-b');
    expect(other?.children[0]?.customAttributes).toEqual({ 'aria-controls': 'panel-b', 'aria-describedby': 'panel-b other' });
  });
});
