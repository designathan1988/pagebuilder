// The Checks panel's form rule (the audit's AUD-22, WCAG technique H32): a form a visitor has no way to send is
// reported on the form; a button that says nothing sends the form it is in, as the export writes it.
import { describe, expect, it } from 'vitest';
import { manifest } from '../../manifest/runtime.ts';
import type { DocNode } from '../document/model.ts';
import { documentOf, node } from '../testing/handlers.ts';
import { checksOf } from './checks.ts';

const field = node('email', 'input', 'input');
const formOf = (children: DocNode[]): DocNode => node('form', 'form', 'form', { children });
const reported = (form: DocNode): boolean => {
  const document = documentOf({ pages: [{ id: 'p', name: 'Home', file: 'index.html', tree: node('page', 'page', 'body', { children: [form] }) }] });
  return checksOf(document, manifest.interactions.checks).some((issue) => issue.node === 'form' && issue.rule === 'checks.formSubmit');
};

describe('a form without a submit button', () => {
  it('is reported on the form, with what to do', () => {
    expect(reported(formOf([field]))).toBe(true);
    expect(reported(formOf([field, node('close', 'button', 'button', { attributes: { buttonType: 'button' } })]))).toBe(true);
  });

  it('is not reported when a button sends it, a submit input, or a button deeper inside', () => {
    expect(reported(formOf([field, node('send', 'button', 'button')]))).toBe(false);
    expect(reported(formOf([field, node('send', 'button', 'button', { attributes: { buttonType: 'submit' } })]))).toBe(false);
    expect(reported(formOf([field, node('send', 'input', 'input', { attributes: { inputType: 'submit' } })]))).toBe(false);
    expect(reported(formOf([node('row', 'div', 'div', { children: [field, node('send', 'button', 'button')] })]))).toBe(false);
  });
});

// The contrast rule over a translucent background: the background is laid over the colour under it, as the browser
// paints it, instead of being skipped for the one further out.
describe('text over a translucent background', () => {
  const contrastReported = (background: string): boolean => {
    const label = node('label', 'paragraph', 'p', { text: 'Nova coleção', styles: { desktop: { base: { color: '#ffffff', 'background-color': background } } } as DocNode['styles'] });
    const slide = node('slide', 'div', 'div', { styles: { desktop: { base: { 'background-color': '#f8fafc' } } } as DocNode['styles'], children: [label] });
    const document = documentOf({ pages: [{ id: 'p', name: 'Home', file: 'index.html', tree: node('page', 'page', 'body', { children: [slide] }) }] });
    return checksOf(document, manifest.interactions.checks).some((issue) => issue.node === 'label' && issue.rule === 'checks.contrast');
  };

  it('passes when the blend is dark enough, and is reported when it is too light', () => {
    expect(contrastReported('rgba(15, 23, 42, 0.7)')).toBe(false);
    expect(contrastReported('rgba(15, 23, 42, 0.1)')).toBe(true);
  });
});

// The contrast rule over the project's variables (the final use's USE-2): white text on var(--color-1), a dark
// orange, is read as the variable's value (an alias and a fallback followed), never as the white section around it; a
// variable the project does not define is unknown and skipped, never judged against the background further out.
describe('text and background that name the project variables', () => {
  const contrastReported = (colour: string, background: string): boolean => {
    const label = node('label', 'paragraph', 'p', { text: 'Comprar', styles: { desktop: { base: { color: colour, 'background-color': background } } } as DocNode['styles'] });
    const section = node('section', 'div', 'section', { styles: { desktop: { base: { 'background-color': '#ffffff' } } } as DocNode['styles'], children: [label] });
    const tokens = [{ name: 'color-1', kind: 'color', value: '#b45309' }, { name: 'brand', kind: 'color', value: 'var(--color-1)' }, { name: 'paper', kind: 'color', value: '#ffffff' }];
    const document = { ...documentOf({ pages: [{ id: 'p', name: 'Home', file: 'index.html', tree: node('page', 'page', 'body', { children: [section] }) }] }), tokens };
    return checksOf(document, manifest.interactions.checks).some((issue) => issue.node === 'label' && issue.rule === 'checks.contrast');
  };

  it('reads a variable, an alias and a fallback as the colour they name', () => {
    expect(contrastReported('#ffffff', 'var(--color-1)')).toBe(false);
    expect(contrastReported('#ffffff', 'var(--brand)')).toBe(false);
    expect(contrastReported('#ffffff', 'var(--missing, #b45309)')).toBe(false);
    expect(contrastReported('var(--paper)', 'var(--paper)')).toBe(true);
  });

  it('skips a variable the project does not define instead of judging against the section around it', () => {
    expect(contrastReported('#ffffff', 'var(--missing)')).toBe(false);
  });
});

// The contrast rule over an image or a gradient: a photo's colours are not read, so the text over it is skipped, never
// judged against the plain colour of the section around it.
describe('text over a background image', () => {
  const contrastReported = (image: string): boolean => {
    const hero = node('hero', 'div', 'section', { styles: { desktop: { base: { 'background-image': image } } } as DocNode['styles'], children: [node('title', 'heading', 'h1', { text: 'Welcome', styles: { desktop: { base: { color: '#ffffff' } } } as DocNode['styles'] })] });
    const page = node('page', 'page', 'body', { styles: { desktop: { base: { 'background-color': '#ffffff' } } } as DocNode['styles'], children: [hero] });
    const document = documentOf({ pages: [{ id: 'p', name: 'Home', file: 'index.html', tree: page }] });
    return checksOf(document, manifest.interactions.checks).some((issue) => issue.node === 'title' && issue.rule === 'checks.contrast');
  };

  it('is unknown under a photo or a gradient, and judged again when the image is none', () => {
    expect(contrastReported('url("img/hero.jpg")')).toBe(false);
    expect(contrastReported('linear-gradient(#000, #333)')).toBe(false);
    expect(contrastReported('none')).toBe(true);
  });
});
