// The rows of a project data file (spec repeat-element, "Fill from data"): a JSON array of objects (or of arrays), or a
// CSV whose first line names the columns. Each row is its values in order with the names they stand under; null when
// the file holds no rows this reads.
import { fileBytes } from '../files/files.ts';
import type { ProjectFile } from '../document/model.ts';

export interface DataRow {
  readonly names: readonly string[];
  readonly values: readonly string[];
}

const text = (file: ProjectFile): string => new TextDecoder().decode(fileBytes(file));
const cell = (value: unknown): string => (value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value));

// a file is data when it is JSON or CSV, by its type or its name
export const isDataFile = (file: Pick<ProjectFile, 'path' | 'type'>): boolean => /\.(json|csv|tsv)$/i.test(file.path) || file.type === 'application/json' || file.type === 'text/csv' || file.type === 'text/tab-separated-values';

// The marks a delimited file may put between its cells: a comma, a semicolon (Excel's "CSV" where the comma is the
// decimal mark: pt-BR, DATA-4), a tab.
export type Delimiter = ',' | ';' | '\t';

// The mark a file's header line puts between its cells, outside quotes: the most frequent one; a semicolon against as
// many commas wins; a comma when none is there. One rule for the Data panel (core/data/readers.ts) and Fill from data
// (dataRows below), so both read one file alike.
export function delimiterOf(source: string): Delimiter {
  let comma = 0;
  let semicolon = 0;
  let tab = 0;
  let quoted = false;
  for (const char of source) {
    if (char === '"') quoted = !quoted;
    else if (quoted) continue;
    else if (char === '\n' || char === '\r') break;
    else if (char === ',') comma += 1;
    else if (char === ';') semicolon += 1;
    else if (char === '\t') tab += 1;
  }
  if (tab > comma && tab > semicolon) return '\t';
  return semicolon > 0 && semicolon >= comma ? ';' : ',';
}

// The lines of a CSV, each its cells: the delimiter between cells (a comma, a semicolon or a tab), a cell in double
// quotes may hold delimiters, line breaks and doubled quotes; a blank line is no row. The Data panel's reader takes the
// same lines (core/data/readers.ts).
export function csvLines(source: string, delimiter: Delimiter = ','): string[][] {
  const lines: string[][] = [];
  let line: string[] = [];
  let cellText = '';
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cellText += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cellText += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      line.push(cellText);
      cellText = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      line.push(cellText);
      if (line.some((one) => one.trim() !== '')) lines.push(line);
      line = [];
      cellText = '';
    } else cellText += char;
  }
  line.push(cellText);
  if (line.some((one) => one.trim() !== '')) lines.push(line);
  return lines;
}

// The rows a JSON file holds: the list it is, or the one list an object holds (a "rows" or "items" key); undefined for
// anything else. The Data panel's reader takes the same rule (core/data/readers.ts).
export function jsonRowList(parsed: unknown): readonly unknown[] | undefined {
  return Array.isArray(parsed) ? parsed : parsed !== null && typeof parsed === 'object' ? Object.values(parsed).find(Array.isArray) : undefined;
}

export function dataRows(file: ProjectFile): readonly DataRow[] | null {
  let source: string;
  try {
    source = text(file);
  } catch {
    return null;
  }
  const tabs = /\.tsv$/i.test(file.path) || file.type === 'text/tab-separated-values';
  if (tabs || /\.csv$/i.test(file.path) || file.type === 'text/csv') {
    // a .tsv is tab separated; a .csv says its delimiter in its header (a pt-BR Excel file uses semicolons, DATA-4)
    const [head, ...body] = csvLines(source, tabs ? '\t' : delimiterOf(source));
    if (head === undefined || body.length === 0) return null;
    return body.map((values) => ({ names: head.map((name) => name.trim()), values: head.map((_, i) => values[i] ?? '') }));
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return null;
  }
  // an object holding one array (a "rows" or "items" key) reads as that array
  const list = jsonRowList(parsed);
  if (!Array.isArray(list) || list.length === 0) return null;
  const rows = list.map((item): DataRow | null => {
    if (Array.isArray(item)) return { names: item.map(() => ''), values: item.map(cell) };
    if (item !== null && typeof item === 'object') return { names: Object.keys(item), values: Object.values(item).map(cell) };
    return { names: [''], values: [cell(item)] };
  });
  return rows.every((row): row is DataRow => row !== null) ? rows : null;
}
