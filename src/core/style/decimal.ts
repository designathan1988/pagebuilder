// The one reader of a decimal number a person types (the audit's L10N1 and INPUT-9): the decimal separator is a point
// or a comma, as pt-BR writes it (the numpad of an ABNT2 keyboard, and the phone keyboard of an inputmode="decimal"
// field, type a comma), with or without a digit before it (",5" is 0.5, as ".5" is). Every number door reads through
// it, so a comma means the same everywhere: the style values (set.ts readValue) and the plain number fields.

// one number, its separator a point or a comma, the digits before the separator optional
const DECIMAL = /^\s*([+-]?)(\d*)[.,](\d+)\s*$/;
const WHOLE = /^\s*[+-]?\d+\s*$/;
// one number with a decimal comma and the unit after it ("1,5px", ",5rem", "-,25em", "50,5%")
const COMMA_WITH_UNIT = /^(\s*[+-]?\d*),(\d+\s*[a-z%]*\s*)$/i;

// The number a text holds, or NaN when it holds none (an empty text is none).
export function readDecimal(text: string): number {
  if (WHOLE.test(text)) return Number(text);
  const typed = DECIMAL.exec(text);
  return typed === null ? Number.NaN : Number(`${typed[1] ?? ''}${typed[2] === '' ? '0' : (typed[2] ?? '0')}.${typed[3] ?? ''}`);
}

// A value text with its one decimal comma written as a point ("1,5px" is "1.5px", ",5rem" is ".5rem"); any other text
// as it is (a list "a, b" keeps its commas).
export function decimalPoint(text: string): string {
  return COMMA_WITH_UNIT.test(text) ? text.replace(COMMA_WITH_UNIT, '$1.$2') : text;
}
