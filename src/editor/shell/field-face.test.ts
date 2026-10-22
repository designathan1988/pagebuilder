// The resting face of a field (field-face.tsx; the audit's S-026): a colour reads as its text (colourFieldText), the
// same focused, its opacity beside it when it is not whole, the word transparent when it is none; a length parts into
// number and unit.
import { describe, expect, it } from 'vitest';
import { colourFieldText, compactFieldValue } from './field-face.tsx';

describe('compactFieldValue', () => {
  it('reads a clear colour as transparent', () => {
    expect(compactFieldValue('rgba(0, 0, 0, 0)', false, true)).toEqual({ value: 'transparent', unit: '' });
  });
  it('reads an opaque colour as its hex', () => {
    expect(compactFieldValue('rgb(26, 26, 26)', false, true)).toEqual({ value: '#1a1a1a', unit: '' });
  });
  it('reads a translucent colour as its hex and its opacity', () => {
    expect(compactFieldValue('rgba(26, 26, 26, 0.5)', false, true)).toEqual({ value: '#1a1a1a', unit: '50%' });
  });
  it('leaves a colour it cannot read as typed', () => {
    expect(compactFieldValue('currentcolor', false, true)).toEqual({ value: 'currentcolor', unit: '' });
  });
  it('reads a colour focused as at rest: the text the picker writes', () => {
    expect(colourFieldText('rgb(0, 0, 0)')).toBe('#000000');
    expect(colourFieldText('rgba(0, 0, 0, 0)')).toBe('transparent');
    expect(colourFieldText('rgba(26, 26, 26, 0.5)')).toBe('rgba(26, 26, 26, 0.5)');
    expect(colourFieldText('var(--brand)')).toBe('var(--brand)');
  });
  it('parts a length into number and unit', () => {
    expect(compactFieldValue('-1.2px', true)).toEqual({ value: '-1.2', unit: 'px' });
  });
});
