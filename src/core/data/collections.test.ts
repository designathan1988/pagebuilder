// The collections' rules (spec data-collections): each type's canonical value, the schema, imports by append, replace
// and update with their refusals naming the row, the column and the value, the edits of fields and items, and the
// query (filters, a stable multi-key order with empty values last, offset and limit).
import { describe, expect, it } from 'vitest';
import { sequentialIds } from '../ports/ids.ts';
import {
  DataRefusal,
  addField,
  canonicalQuery,
  cellText,
  createCollection,
  decimalsOf,
  deleteItems,
  guessType,
  importRows,
  isCanonical,
  keyFor,
  moveItem,
  nameRefusal,
  queryItems,
  queryRefusal,
  readCell,
  removeField,
  schemaRefusal,
  setCell,
  setField,
} from './collections.ts';
import type { Collection, Field } from './model.ts';

const WORDS = { yes: 'Yes', no: 'No' };
const FIELDS: Field[] = [
  { key: 'nome', label: 'Nome', type: 'text' },
  { key: 'preco', label: 'Preço', type: 'number' },
  { key: 'foto', label: 'Foto', type: 'image' },
];
const empty = (): Collection => createCollection([], 'Menu', FIELDS);

// the message a refused call carries
function refusal(run: () => unknown): { key: string; params: Readonly<Record<string, unknown>> } {
  try {
    run();
  } catch (error) {
    if (error instanceof DataRefusal) return { key: error.refusal.key, params: error.refusal.params };
    throw error;
  }
  throw new Error('the call was not refused');
}

describe('a value of each type', () => {
  it('reads text trimmed, numbers and booleans as text, and nothing as empty', () => {
    expect(readCell('text', '  Café  ')).toBe('Café');
    expect(readCell('text', 42)).toBe('42');
    expect(readCell('text', true)).toBe('true');
    expect(readCell('text', '   ')).toBeUndefined();
    expect(readCell('text', null)).toBeUndefined();
  });

  it('reads numbers, a decimal comma included, and refuses what is no number', () => {
    expect(readCell('number', '42')).toBe(42);
    expect(readCell('number', ' -3.5 ')).toBe(-3.5);
    expect(readCell('number', '42,5')).toBe(42.5);
    expect(readCell('number', '1e3')).toBe(1000);
    expect(readCell('number', 7)).toBe(7);
    expect(readCell('number', 'R$ 42')).toBeNull();
    expect(readCell('number', '1.000,50')).toBeNull();
    expect(readCell('number', Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('reads yes and no in English and Portuguese, and 1 and 0', () => {
    expect(readCell('boolean', 'Sim')).toBe(true);
    expect(readCell('boolean', 'não')).toBe(false);
    expect(readCell('boolean', 'TRUE')).toBe(true);
    expect(readCell('boolean', 0)).toBe(false);
    expect(readCell('boolean', 'maybe')).toBeNull();
  });

  it('takes only real calendar dates written YYYY-MM-DD', () => {
    expect(readCell('date', '2026-02-28')).toBe('2026-02-28');
    expect(readCell('date', '2026-02-30')).toBeNull();
    expect(readCell('date', '28/02/2026')).toBeNull();
  });

  it('takes the links the link rule allows, a bare domain becoming an https address', () => {
    expect(readCell('link', 'https://example.com/a')).toBe('https://example.com/a');
    expect(readCell('link', 'example.com')).toBe('https://example.com');
    expect(readCell('link', 'about.html')).toBe('about.html');
    expect(readCell('link', 'javascript:alert(1)')).toBeNull();
  });

  it('takes an image by a path, a file name or a web address, never an unsafe one', () => {
    expect(readCell('image', 'graos.png')).toBe('graos.png');
    expect(readCell('image', 'img/graos.png')).toBe('img/graos.png');
    expect(readCell('image', 'https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(readCell('image', 'data:image/png;base64,AAAA')).toBeNull();
  });

  it('keeps rich text as canonical runs, a plain text as one run', () => {
    expect(readCell('richtext', 'Plain')).toEqual(['Plain']);
    expect(readCell('richtext', [{ tag: 'strong', children: ['Bold'] }, ' rest'])).toEqual([{ tag: 'strong', children: ['Bold'] }, ' rest']);
    expect(readCell('richtext', [{ tag: 'a', href: 'javascript:x', children: ['x'] }])).toBeNull();
  });

  it('says whether a stored value is canonical, and shows a value as text', () => {
    expect(isCanonical('number', 42)).toBe(true);
    expect(isCanonical('number', '42')).toBe(false);
    expect(isCanonical('text', ' padded ')).toBe(false);
    expect(cellText(true, WORDS)).toBe('Yes');
    expect(cellText([{ tag: 'em', children: ['It'] }, 'alic'], WORDS)).toBe('Italic');
    expect(cellText(undefined, WORDS)).toBe('');
  });

  it("guesses a column's type from its filled cells", () => {
    expect(guessType(['1', '2,5', ''])).toBe('number');
    expect(guessType(['sim', 'não'])).toBe('boolean');
    expect(guessType(['1', '0'])).toBe('number');
    expect(guessType(['2026-01-01', '2026-12-31'])).toBe('date');
    expect(guessType(['graos.png', 'xicara.PNG', 'loja.png'])).toBe('image');
    expect(guessType(['https://a.example', 'https://b.example/x'])).toBe('link');
    expect(guessType(['R$ 42', 'R$ 46'])).toBe('text');
    expect(guessType([])).toBe('text');
  });
});

describe('the schema', () => {
  it('makes keys from labels, without accents, numbered when taken', () => {
    expect(keyFor('Preço (R$)', [])).toBe('preco_r');
    expect(keyFor('nome', ['nome'])).toBe('nome_2');
    expect(keyFor('2024', [])).toBe('f_2024');
    expect(keyFor('!!!', [])).toBe('field');
  });

  it('refuses no field, a repeated label, a bad key or an unknown type', () => {
    expect(schemaRefusal('Menu', [])?.key).toBe('status.data.noFields');
    expect(schemaRefusal('Menu', [FIELDS[0] as Field, { key: 'other', label: 'NOME', type: 'text' }])?.key).toBe('status.data.fieldLabelTaken');
    expect(schemaRefusal('Menu', [{ key: '__proto__', label: 'x', type: 'text' }])?.key).toBe('status.data.badField');
    expect(schemaRefusal('Menu', [{ key: 'a', label: 'a', type: 'color' as never }])?.key).toBe('status.data.badField');
    expect(schemaRefusal('Menu', FIELDS)).toBeNull();
  });

  it('refuses an empty name and one another collection holds, accents and case aside', () => {
    expect(nameRefusal([], ' ')?.key).toBe('status.data.nameEmpty');
    expect(nameRefusal([empty()], 'menu')?.key).toBe('status.data.nameTaken');
    expect(nameRefusal([empty()], 'Menu', 'Menu')).toBeNull();
  });
});

describe('importing rows', () => {
  const rows = [
    { nome: 'Espresso', preco: '42', foto: 'graos.png' },
    { nome: 'Filtrado', preco: '46,5', foto: 'xicara.png' },
  ];

  it('appends the rows as items in their canonical values', () => {
    const imported = importRows(empty(), rows, 'append', null, sequentialIds('i').next);
    expect(imported.items).toEqual([
      { id: 'i1', values: { nome: 'Espresso', preco: 42, foto: 'graos.png' } },
      { id: 'i2', values: { nome: 'Filtrado', preco: 46.5, foto: 'xicara.png' } },
    ]);
  });

  it('refuses the whole import at the first value its type cannot hold, naming the row, the column and the value', () => {
    const refused = refusal(() => importRows(empty(), [...rows, { nome: 'Moka', preco: 'R$ 9' }], 'append', null, sequentialIds('i').next));
    expect(refused).toEqual({ key: 'status.data.badValue', params: { collection: 'Menu', row: 3, column: 'Preço', value: 'R$ 9', type: { key: 'data.type.number' } } });
  });

  it('replaces the items', () => {
    const first = importRows(empty(), rows, 'append', null, sequentialIds('i').next);
    const replaced = importRows(first, [{ nome: 'Cold brew', preco: 35 }], 'replace', null, sequentialIds('j').next);
    expect(replaced.items).toEqual([{ id: 'j1', values: { nome: 'Cold brew', preco: 35 } }]);
  });

  it('updates the items whose key matches, keeps their ids and their other values, and adds the new ones', () => {
    const first = importRows(empty(), rows, 'append', null, sequentialIds('i').next);
    const updated = importRows(first, [{ nome: 'Filtrado', preco: '50' }, { nome: 'Moka', preco: '9' }], 'update', 'nome', sequentialIds('j').next);
    expect(updated.items).toEqual([
      { id: 'i1', values: { nome: 'Espresso', preco: 42, foto: 'graos.png' } },
      { id: 'i2', values: { nome: 'Filtrado', preco: 50, foto: 'xicara.png' } },
      { id: 'j1', values: { nome: 'Moka', preco: 9 } },
    ]);
  });

  it('refuses an update without a key, with an empty key or with a key twice', () => {
    const first = importRows(empty(), rows, 'append', null, sequentialIds('i').next);
    expect(refusal(() => importRows(first, rows, 'update', null, sequentialIds('j').next)).key).toBe('status.data.keyNeeded');
    expect(refusal(() => importRows(first, [{ preco: '1' }], 'update', 'nome', sequentialIds('j').next))).toEqual({ key: 'status.data.keyEmpty', params: { collection: 'Menu', row: 1, column: 'Nome' } });
    expect(refusal(() => importRows(first, [{ nome: 'A' }, { nome: 'A' }], 'update', 'nome', sequentialIds('j').next)).key).toBe('status.data.keyRepeated');
  });
});

describe('editing items and fields', () => {
  const menu = (): Collection => importRows(empty(), [{ nome: 'A', preco: 1 }, { nome: 'B', preco: 2 }, { nome: 'C' }], 'append', null, sequentialIds('i').next);

  it('sets a cell from typed text, empties it with nothing, and refuses a value of another type', () => {
    expect(setCell(menu(), 'i1', 'preco', '3,5').items[0]?.values).toEqual({ nome: 'A', preco: 3.5 });
    expect(setCell(menu(), 'i1', 'preco', '').items[0]?.values).toEqual({ nome: 'A' });
    expect(refusal(() => setCell(menu(), 'i2', 'preco', 'two')).params).toMatchObject({ row: 2, column: 'Preço', value: 'two' });
  });

  it('moves an item and deletes items', () => {
    expect(moveItem(menu(), 'i3', 0).items.map((item) => item.id)).toEqual(['i3', 'i1', 'i2']);
    expect(moveItem(menu(), 'i1', 99).items.map((item) => item.id)).toEqual(['i2', 'i3', 'i1']);
    expect(deleteItems(menu(), ['i1', 'i3']).items.map((item) => item.id)).toEqual(['i2']);
  });

  it('adds a field keyed from its label, refusing a label taken', () => {
    expect(addField(menu(), 'Destaque', 'boolean').fields.at(-1)).toEqual({ key: 'destaque', label: 'Destaque', type: 'boolean' });
    expect(refusal(() => addField(menu(), 'nome', 'text')).key).toBe('status.data.fieldLabelTaken');
  });

  it('retypes a field reading every value again, refusing at the first that does not read', () => {
    const asText = setField(menu(), 'preco', { type: 'text' });
    expect(asText.items.map((item) => item.values.preco)).toEqual(['1', '2', undefined]);
    const back = setField(asText, 'preco', { type: 'number' });
    expect(back.items.map((item) => item.values.preco)).toEqual([1, 2, undefined]);
    expect(refusal(() => setField(menu(), 'nome', { type: 'number' })).params).toMatchObject({ row: 1, column: 'Nome', value: 'A' });
    expect(setField(menu(), 'nome', { label: 'Name' }).fields[0]).toEqual({ key: 'nome', label: 'Name', type: 'text' });
  });

  it('removes a field with its values, never the last one', () => {
    expect(removeField(menu(), 'preco').items[0]?.values).toEqual({ nome: 'A' });
    const one = createCollection([], 'One', [{ key: 'a', label: 'a', type: 'text' }]);
    expect(refusal(() => removeField(one, 'a')).key).toBe('status.data.noFields');
  });
});

describe('the query', () => {
  const rows = [
    { nome: 'Blend', preco: 39 },
    { nome: 'Espresso', preco: 42 },
    { nome: 'Cold brew', preco: 35 },
    { nome: 'Árabe' },
    { nome: 'Coado', preco: 42 },
  ];
  const menu = importRows(empty(), rows, 'append', null, sequentialIds('i').next);
  const names = (query: Parameters<typeof queryItems>[1]) => queryItems(menu, query).map((item) => item.values.nome);

  it('filters by each operator, the typed text read as the field’s type', () => {
    expect(names({ filters: [{ field: 'nome', operator: 'contains', value: 'CO' }] })).toEqual(['Cold brew', 'Coado']);
    expect(names({ filters: [{ field: 'preco', operator: 'eq', value: '42' }] })).toEqual(['Espresso', 'Coado']);
    expect(names({ filters: [{ field: 'preco', operator: 'neq', value: '42' }] })).toEqual(['Blend', 'Cold brew']);
    expect(names({ filters: [{ field: 'preco', operator: 'lt', value: '39' }] })).toEqual(['Cold brew']);
    expect(names({ filters: [{ field: 'preco', operator: 'lte', value: '39' }] })).toEqual(['Blend', 'Cold brew']);
    expect(names({ filters: [{ field: 'preco', operator: 'gt', value: '39' }] })).toEqual(['Espresso', 'Coado']);
    expect(names({ filters: [{ field: 'preco', operator: 'gte', value: '42' }] })).toEqual(['Espresso', 'Coado']);
    expect(names({ filters: [{ field: 'preco', operator: 'empty' }] })).toEqual(['Árabe']);
    expect(names({ filters: [{ field: 'preco', operator: 'filled' }] })).toHaveLength(4);
    expect(names({ filters: [{ field: 'nome', operator: 'contains', value: 'blend' }, { field: 'preco', operator: 'lt', value: '36' }], match: 'any' })).toEqual(['Blend', 'Cold brew']);
  });

  it('sorts by several keys, stably, empty values last in either direction, accents aside', () => {
    expect(names({ order: [{ field: 'preco', direction: 'desc' }, { field: 'nome', direction: 'asc' }] })).toEqual(['Coado', 'Espresso', 'Blend', 'Cold brew', 'Árabe']);
    expect(names({ order: [{ field: 'preco', direction: 'asc' }] })).toEqual(['Cold brew', 'Blend', 'Espresso', 'Coado', 'Árabe']);
    expect(names({ order: [{ field: 'nome', direction: 'asc' }] })).toEqual(['Árabe', 'Blend', 'Coado', 'Cold brew', 'Espresso']);
  });

  it('applies the offset and the limit after the filter and the order', () => {
    expect(names({ order: [{ field: 'nome', direction: 'asc' }], offset: 1, limit: 2 })).toEqual(['Blend', 'Coado']);
    expect(names({ limit: 0 })).toEqual([]);
  });

  it('refuses a field the collection does not have and a count that is not a whole number', () => {
    expect(queryRefusal(menu, { order: [{ field: 'x', direction: 'asc' }] })?.key).toBe('status.data.unknownField');
    expect(queryRefusal(menu, { limit: 1.5 })?.key).toBe('status.data.badCount');
  });

  it('writes a query in one canonical form', () => {
    expect(canonicalQuery({ filters: [], order: [], offset: 0, match: 'all' })).toEqual({});
    expect(canonicalQuery({ filters: [{ field: 'preco', operator: 'empty', value: 'x' }], limit: 3 })).toEqual({ filters: [{ field: 'preco', operator: 'empty' }], limit: 3 });
  });
});

describe('a number as the site shows it (DEF-0620)', () => {
  const words = { yes: 'sim', no: 'não' };
  it('keeps the decimal places of the file and the separator of the site language', () => {
    expect(decimalsOf(['6,50', '5,00', '9,9', '', 'x'])).toBe(2);
    expect(decimalsOf(['12', '7'])).toBe(0);
    expect(cellText(6.5, words, { language: 'pt-BR', decimals: 2 })).toBe('6,50');
    expect(cellText(5, words, { language: 'pt-BR', decimals: 2 })).toBe('5,00');
    expect(cellText(1234.5, words, { language: 'pt-BR', decimals: 2 })).toBe('1234,50');
    expect(cellText(6.5, words, { language: 'en', decimals: 2 })).toBe('6.50');
    expect(cellText(0.125, words, { language: 'pt-BR' })).toBe('0,125');
    expect(cellText(6.5, words)).toBe('6.5');
  });
  it('holds the decimal places only on a number field, within bounds', () => {
    const fields = [{ key: 'preco', label: 'Preço', type: 'number' as const, decimals: 2 }];
    expect(createCollection([], 'Cardápio', fields).fields[0]?.decimals).toBe(2);
    expect(() => createCollection([], 'Cardápio', [{ key: 'nome', label: 'Nome', type: 'text', decimals: 2 }])).toThrow(DataRefusal);
    expect(() => createCollection([], 'Cardápio', [{ key: 'preco', label: 'Preço', type: 'number', decimals: 11 }])).toThrow(DataRefusal);
  });
});
