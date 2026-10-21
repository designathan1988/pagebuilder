import { describe, expect, it } from 'vitest';
import { typedNumber } from './held-draft.ts';

describe('a typed number', () => {
  it('reads a decimal comma as a decimal point, with or without a digit before it (INPUT-9)', () => {
    expect(typedNumber('12,5')).toBe(12.5);
    expect(typedNumber(',5')).toBe(0.5);
    expect(typedNumber('-,5')).toBe(-0.5);
    expect(typedNumber(' 1,5 ')).toBe(1.5);
    expect(typedNumber('12.5')).toBe(12.5);
  });

  it('leaves an empty text, a list or a word to the command as no number', () => {
    expect(typedNumber('')).toBeNaN();
    expect(typedNumber('1,2,3')).toBeNaN();
    expect(typedNumber('abc')).toBeNaN();
  });
});
