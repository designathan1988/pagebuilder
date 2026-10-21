// The rows of a data file (src/core/design/data.ts; spec repeat-element, Fill from data).
import { describe, expect, it } from 'vitest';
import { csvLines, dataRows, isDataFile } from './data.ts';

const file = (path: string, text: string) => ({ path, type: path.endsWith('.csv') ? 'text/csv' : 'application/json', bytes: btoa(unescape(encodeURIComponent(text))) });

describe('dataRows', () => {
  it('reads a JSON array of objects, names and values in order', () => {
    expect(dataRows(file('d.json', '[{"title":"Monthly","price":9},{"title":"Weekly","price":3}]'))).toEqual([
      { names: ['title', 'price'], values: ['Monthly', '9'] },
      { names: ['title', 'price'], values: ['Weekly', '3'] },
    ]);
  });
  it('reads the one array an object holds', () => {
    expect(dataRows(file('d.json', '{"plans":[["A"],["B"]]}'))?.map((r) => r.values)).toEqual([['A'], ['B']]);
  });
  it('reads a CSV whose first line names the columns, with quoted cells and accents', () => {
    expect(dataRows(file('d.csv', 'title,note\n"Café, forte","diz ""olá"""\nChá,\n'))).toEqual([
      { names: ['title', 'note'], values: ['Café, forte', 'diz "olá"'] },
      { names: ['title', 'note'], values: ['Chá', ''] },
    ]);
  });
  it('reads nothing from a file that holds no rows', () => {
    expect(dataRows(file('d.json', '{"a":1}'))).toBeNull();
    expect(dataRows(file('d.json', 'not json'))).toBeNull();
    expect(dataRows(file('d.csv', 'title\n'))).toBeNull();
  });
  it('knows a data file by its name or type', () => {
    expect(isDataFile({ path: 'x/plans.CSV', type: '' })).toBe(true);
    expect(isDataFile({ path: 'logo.png', type: 'image/png' })).toBe(false);
  });
  it('reads a semicolon CSV as the Data panel does, a decimal comma kept in its cell (DATA-4)', () => {
    expect(dataRows(file('d.csv', 'produto;preço\n"Café; forte";6,50\nChá;3,25\n'))).toEqual([
      { names: ['produto', 'preço'], values: ['Café; forte', '6,50'] },
      { names: ['produto', 'preço'], values: ['Chá', '3,25'] },
    ]);
  });
  it('splits CRLF lines and skips blank ones', () => {
    expect(csvLines('a,b\r\n\r\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});
