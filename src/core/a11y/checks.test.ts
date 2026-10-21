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
