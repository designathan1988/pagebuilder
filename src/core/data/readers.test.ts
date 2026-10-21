// @vitest-environment happy-dom
// Reading the data files a person hands over (spec data-import): Carla's original cardapio.csv from the journey03 study
// as it is, the same rows as TSV and JSON, quoted cells, and XLSX workbooks written as spreadsheet programs write them
// (deflated parts, shared and inline strings, numbers, booleans, dates by their format and date system, holes in rows,
// formulas with their saved values), each problem refused naming the file and where.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { domXml } from '../../editor/data/read-file.ts';
import { workbook, type WorkbookCell } from '../testing/workbook.ts';
import { DataRefusal } from './collections.ts';
import { readDataFile, readDataFileSafely, readDelimited, readJson, type DataFile } from './readers.ts';

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const fixture = (name: string): Uint8Array => new Uint8Array(readFileSync(`manifest/features/fixtures/import/${name}`));

async function refused(name: string, data: Uint8Array): Promise<{ key: string; params: Readonly<Record<string, unknown>> }> {
  const read = await readDataFileSafely(name, data, domXml);
  if (!('problem' in read)) throw new Error(`${name} was read`);
  return { key: read.problem.key, params: read.problem.params };
}

const CARLA_FIRST = { nome: 'Espresso Grão Norte', preco: 'R$ 42', foto: 'graos.png' };

describe('CSV and TSV', () => {
  it("reads Carla's original cardapio.csv as it is: three columns, twelve rows, accents kept", async () => {
    const file = await readDataFile('cardapio.csv', fixture('cardapio.csv'), domXml);
    const [sheet] = file.sheets;
    expect(sheet?.columns).toEqual(['nome', 'preco', 'foto']);
    expect(sheet?.rows).toHaveLength(12);
    expect(sheet?.rows[0]).toEqual(CARLA_FIRST);
    expect(sheet?.rows[7]).toEqual({ nome: 'Cápsulas (10)', preco: 'R$ 29', foto: 'graos.png' });
  });

  it('reads the same rows from TSV and JSON', async () => {
    const tsv = await readDataFile('cardapio.tsv', fixture('cardapio.tsv'), domXml);
    // the same rows as a JSON list of objects, as a person exports them from a spreadsheet tool
    const csvRows = (await readDataFile('cardapio.csv', fixture('cardapio.csv'), domXml)).sheets[0]?.rows ?? [];
    const json = await readDataFile('cardapio.json', bytes(JSON.stringify(csvRows)), domXml);
    expect(tsv.sheets[0]?.rows).toEqual((await readDataFile('cardapio.csv', fixture('cardapio.csv'), domXml)).sheets[0]?.rows);
    expect(json.sheets[0]?.rows).toEqual(tsv.sheets[0]?.rows);
  });

  it('keeps delimiters, doubled quotes and line breaks inside quoted cells, and skips a byte-order mark', async () => {
    const file = await readDataFile('q.csv', bytes('﻿title,note\r\n"Café, forte","diz ""olá""\nem duas linhas"\r\nChá,\r\n'), domXml);
    expect(file.sheets[0]?.columns).toEqual(['title', 'note']);
    expect(file.sheets[0]?.rows).toEqual([{ title: 'Café, forte', note: 'diz "olá"\nem duas linhas' }, { title: 'Chá' }]);
    expect(readDelimited('t.tsv', 'a\tb\n1\t"x\ty"\n', '\t').rows).toEqual([{ a: '1', b: 'x\ty' }]);
  });

  it('refuses an unclosed quote, a row wider than its columns, a column with no name or a name twice', async () => {
    expect(await refused('a.csv', bytes('a,b\n"open,1\n'))).toEqual({ key: 'status.data.fileQuote', params: { name: 'a.csv' } });
    expect(await refused('a.csv', bytes('a,b\n1,2,3\n'))).toEqual({ key: 'status.data.fileWide', params: { name: 'a.csv', row: 2, count: 2 } });
    expect(await refused('a.csv', bytes('a,,c\n1,2,3\n'))).toEqual({ key: 'status.data.fileHeaderBlank', params: { name: 'a.csv', column: 2 } });
    expect(await refused('a.csv', bytes('Nome,nome\n1,2\n'))).toEqual({ key: 'status.data.fileHeaderTaken', params: { name: 'a.csv', label: 'nome' } });
    expect(await refused('a.csv', bytes('\n\n'))).toEqual({ key: 'status.data.fileEmpty', params: { name: 'a.csv' } });
    expect(await refused('a.csv', new Uint8Array([0x61, 0x0a, 0xff, 0x01]))).toEqual({ key: 'status.data.fileEncoding', params: { name: 'a.csv' } });
  });

  it('reads Excel\'s CSV of a pt-BR Windows: semicolons between cells, Windows-1252 text (DATA-4, DATA-5)', async () => {
    const semicolons = await readDataFile('precos.csv', bytes('produto;preco\nCafé;6,50\n"Pão; doce";"5,00"\n'), domXml);
    expect(semicolons.sheets[0]?.rows).toEqual([{ produto: 'Café', preco: '6,50' }, { produto: 'Pão; doce', preco: '5,00' }]);
    expect(readDelimited('p.csv', 'produto;preco\nCafe;6\n').rows).toEqual([{ produto: 'Cafe', preco: '6' }]);
    expect(readDelimited('p.csv', 'a,b\n"x;y",2\n').rows).toEqual([{ a: 'x;y', b: '2' }]);
    const ansi = await readDataFile('p.csv', new Uint8Array([...bytes('produto,preco\nP'), 0xe3, ...bytes('o,5\n')]), domXml);
    expect(ansi.sheets[0]?.rows).toEqual([{ produto: 'Pão', preco: '5' }]);
  });

  it('refuses a file of another kind by its name', async () => {
    expect((await refused('menu.txt', bytes('a\n1'))).key).toBe('status.data.fileType');
  });
});

describe('JSON', () => {
  it('reads a list of objects, the union of their keys as columns, nested values as their JSON text', () => {
    const sheet = readJson('d.json', JSON.stringify([{ a: 1, b: true }, { c: { x: 1 }, a: null }]));
    expect(sheet.columns).toEqual(['a', 'b', 'c']);
    expect(sheet.rows).toEqual([{ a: 1, b: true }, { c: '{"x":1}' }]);
  });

  it('reads the one list an object holds', () => {
    expect(readJson('d.json', '{"rows":[{"a":"x"}]}').rows).toEqual([{ a: 'x' }]);
  });

  it('refuses what is no list of objects', () => {
    const key = (source: string) => {
      try {
        readJson('d.json', source);
      } catch (error) {
        if (error instanceof DataRefusal) return error.refusal.key;
        throw error;
      }
      return null;
    };
    expect(key('not json')).toBe('status.data.fileJson');
    expect(key('[1,2]')).toBe('status.data.fileJson');
    expect(key('{"a":1}')).toBe('status.data.fileJson');
    expect(key('[]')).toBe('status.data.fileEmpty');
  });
});

describe('XLSX', () => {
  const menu: WorkbookCell[][] = [
    ['nome', 'preco', 'lancamento', 'destaque', 'obs'],
    ['Espresso', 42, { date: 46023, format: 'builtin' }, true, { inline: 'novo' }],
    ['Filtrado', 46.5, { date: 46024, format: 'custom' }, false, null],
    // a row with a hole in the middle: the skipped cell is empty
    ['Moka', null, null, true, { formula: 'B2*2', cached: 84 }],
  ];

  it('reads a deflated workbook: shared and inline strings, numbers, booleans, dates by their format, holes, saved formula values', async () => {
    const file = await readDataFile('menu.xlsx', await workbook([{ name: 'Menu', rows: menu }]), domXml);
    expect(file.sheets.map((sheet) => sheet.name)).toEqual(['Menu']);
    expect(file.sheets[0]?.columns).toEqual(['nome', 'preco', 'lancamento', 'destaque', 'obs']);
    expect(file.sheets[0]?.rows).toEqual([
      { nome: 'Espresso', preco: 42, lancamento: '2026-01-01', destaque: true, obs: 'novo' },
      { nome: 'Filtrado', preco: 46.5, lancamento: '2026-01-02', destaque: false },
      { nome: 'Moka', destaque: true, obs: 84 },
    ]);
  });

  it('reads stored workbooks and the 1904 date system the same way', async () => {
    const rows: WorkbookCell[][] = [['dia'], [{ date: 0, format: 'builtin' }], [{ date: 59, format: 'builtin' }]];
    const from1904 = await readDataFile('d.xlsx', await workbook([{ name: 'D', rows }], { date1904: true, stored: true }), domXml);
    expect(from1904.sheets[0]?.rows).toEqual([{ dia: '1904-01-01' }, { dia: '1904-02-29' }]);
    const from1900 = await readDataFile('d.xlsx', await workbook([{ name: 'D', rows: [['dia'], [{ date: 59, format: 'custom' }], [{ date: 61, format: 'custom' }]] }]), domXml);
    expect(from1900.sheets[0]?.rows).toEqual([{ dia: '1900-02-28' }, { dia: '1900-03-01' }]);
  });

  it('keeps the problem of a sheet that cannot be read, the others importable', async () => {
    const file = await readDataFile('menu.xlsx', await workbook([{ name: 'Menu', rows: menu }, { name: 'Notas', rows: [['total'], [{ formula: 'SUM(B2:B3)' }]] }, { name: 'Erros', rows: [['x'], [{ error: '#DIV/0!' }]] }]), domXml);
    expect(file.sheets[0]?.problem).toBeUndefined();
    expect(file.sheets[1]?.problem).toEqual({ key: 'status.data.fileFormula', params: { name: 'menu.xlsx', cell: 'A2' } });
    expect(file.sheets[2]?.problem).toEqual({ key: 'status.data.fileCellError', params: { name: 'menu.xlsx', cell: 'A2', error: '#DIV/0!' } });
  });

  it('reads the package fixture: the menu sheet typed, the notes sheet refused for its formula', async () => {
    const file: DataFile = await readDataFile('cardapio.xlsx', fixture('cardapio.xlsx'), domXml);
    expect(file.sheets.map((sheet) => sheet.name)).toEqual(['Cardapio', 'Notas']);
    expect(file.sheets[0]?.rows).toHaveLength(12);
    expect(file.sheets[0]?.rows[0]).toEqual({ nome: 'Espresso Grão Norte', preco: 42, foto: 'graos.png', lancamento: '2026-01-01', destaque: true });
    expect(file.sheets[1]?.problem?.key).toBe('status.data.fileFormula');
  });

  it('refuses a sheet read from outside the file and XML declaring a document type', async () => {
    const external = await readDataFile('x.xlsx', await workbook([{ name: 'Far', rows: [['a']], external: true }, { name: 'Near', rows: [['a'], ['b']] }]), domXml);
    expect(external.sheets[0]?.problem?.key).toBe('status.data.fileExternal');
    expect(external.sheets[1]?.rows).toEqual([{ a: 'b' }]);
    const typed = await readDataFile('x.xlsx', await workbook([{ name: 'S', rows: [['a'], ['b']] }], { doctype: true }), domXml);
    expect(typed.sheets[0]?.problem?.key).toBe('status.data.fileSheet');
  });

  it('refuses bytes that are no workbook, and an archive whose paths climb out of it', async () => {
    expect((await refused('x.xlsx', bytes('not a zip'))).key).toBe('status.data.fileSheet');
    const archive = await workbook([{ name: 'S', rows: [['a']] }], { stored: true });
    // the first entry's name rewritten, in its local header and in the directory, to climb out of the archive
    const text = new TextDecoder('latin1').decode(archive);
    const climbing = new Uint8Array(archive);
    for (let at = text.indexOf('[Content_Types].xml'); at >= 0; at = text.indexOf('[Content_Types].xml', at + 1)) climbing.set(new TextEncoder().encode('../../../evil.xml!!'), at);
    expect((await refused('x.xlsx', climbing)).key).toBe('status.data.fileSheet');
  });
});
