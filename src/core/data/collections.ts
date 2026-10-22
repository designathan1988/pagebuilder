// The project's collections (spec content-data): a collection is a named table of typed fields and items. This module
// owns what a value of each type may be (its canonical form), the schema's rules, the import of rows (append, replace,
// update by key), the edits of fields and items, and the query a list shows. Everything here is pure: a function
// returns the collection after the change, or throws a DataRefusal naming the row, the column and the value at fault,
// in the words of the catalogue, before anything is changed.
import { message, type Message, type MessageParam } from '../commands/registry.ts';
import type { MessageId } from '../../generated/ids.ts';
import { holdsControl, readAddress } from '../elements/address.ts';
import { canonical, parseInline, plainText, runsFromTypedMarkup, type InlineRun } from '../text/inline.ts';
import { fold, slug } from '../text/fold.ts';
import { FIELD_TYPES, PAGINGS, isReferenceType, type Cell, type Collection, type Field, type FieldType, type Filter, type Item, type Query } from './model.ts';
import { registerReferenceKind } from '../store/references.ts';

// A predictable refusal of a content operation: the message the status bar says. Handlers catch it and answer
// `refused`; anything else a content function throws is a defect.
export class DataRefusal extends Error {
  override name = 'DataRefusal';
  // (a field, not a parameter property: the tools run this module with Node's type stripping, which takes none)
  readonly refusal: Message;
  constructor(refusal: Message) {
    super(refusal.key);
    this.refusal = refusal;
  }
}
export function refuse(key: MessageId, params: Readonly<Record<string, MessageParam>> = {}): never {
  throw new DataRefusal(message(key, params));
}

const NONE: readonly Collection[] = [];
export const collectionsOf = (document: { readonly collections?: readonly Collection[] }): readonly Collection[] => document.collections ?? NONE;
export const collectionNamed = (document: { readonly collections?: readonly Collection[] }, name: string): Collection | undefined => collectionsOf(document).find((c) => c.name === name);

// ---------------------------------------------------------------- values

const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
// a decimal written with a comma, as pt-BR writes it ("42,5"), with no other separator
const COMMA_NUMBER = /^[+-]?\d+,\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TRUE_WORDS = ['true', 'yes', '1', 'sim', 'verdadeiro'];
const FALSE_WORDS = ['false', 'no', '0', 'nao', 'falso'];
const IMAGE_FILE = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i;
// an email address: a name, an @ and a domain with a dot, nothing an address does not hold
const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:.]+$/;
const HEX_COLOR = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
// a video's web address: a video service's page or a video file
const VIDEO_ADDRESS = /^https?:\/\/((www\.|m\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)\/|.*\.(mp4|webm|mov|m4v|ogv)([?#].*)?$)/i;
const PAGE_PATH = /^[\w-]+(\/[\w-]+)*\.html?(#[\w-]*)?$/i;

// A number grouped by thousands and maybe with a fraction, its group mark one of "." and "," and its decimal mark the
// other ("1.234,56", "1,234.56", "1.234.567"): never a leading zero in its first group ("0.500" is a fraction).
const GROUPED_NUMBER = /^[+-]?[1-9]\d{0,2}([.,])\d{3}(?:\1\d{3})*(?:([.,])\d+)?$/;
// one group mark and one group of three digits, nothing else ("1.500", "12,345"): a fraction or a thousand, as the
// language reading it says
const ONE_GROUP = /^[+-]?[1-9]\d{0,2}[.,]\d{3}$/;

// The group mark a language writes thousands with, when it is "." or "," ("pt-BR" → ".", "en" → ","); undefined for a
// language that groups with another mark (a space) or that Intl does not know.
const groupMarks = new Map<string, string | undefined>();
function groupMarkOf(language: string): string | undefined {
  if (groupMarks.has(language)) return groupMarks.get(language);
  let mark: string | undefined;
  try {
    // seven digits: a language that groups four digits only from five on (es, pt-PT) still shows its mark
    const group = new Intl.NumberFormat(language, { useGrouping: true }).formatToParts(1234567.5).find((part) => part.type === 'group')?.value;
    mark = group === '.' || group === ',' ? group : undefined;
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    mark = undefined;
  }
  groupMarks.set(language, mark);
  return mark;
}

// A number as a person or a file writes it, with the decimal places it is written with, or null (DATA-3): a plain one
// ("42", "-3.5", "1e3"), a decimal comma ("42,5"), or one grouped by thousands ("1.234,56", "1,234.56"). One group
// mark before three digits alone ("1.500") is a thousand in a language that groups with that mark (pt-BR's 1.500 is
// R$ 1.500) and a fraction otherwise. What the site writes (cellText, no grouping) reads back as the same number.
export function readNumber(text: string, language?: string): { readonly value: number; readonly decimals: number } | null {
  const finite = (written: string, fraction: string): { readonly value: number; readonly decimals: number } | null => {
    const value = Number(written);
    return Number.isFinite(value) ? { value, decimals: fraction.length } : null;
  };
  const mark = ONE_GROUP.test(text) ? text.replace(/[^.,]/g, '') : '';
  if (mark !== '' && language !== undefined && groupMarkOf(language) === mark) return finite(text.replace(mark, ''), '');
  if (NUMBER.test(text)) return finite(text, /^[^e]*\.(\d+)/i.exec(text)?.[1] ?? '');
  if (COMMA_NUMBER.test(text)) return finite(text.replace(',', '.'), text.split(',')[1] ?? '');
  const grouped = GROUPED_NUMBER.exec(text);
  if (grouped === null) return null;
  const [, group, decimal] = grouped;
  if (decimal !== undefined && decimal === group) return null;
  const [whole = '', fraction = ''] = decimal === undefined ? [text] : [text.slice(0, text.lastIndexOf(decimal)), text.slice(text.lastIndexOf(decimal) + 1)];
  return finite(`${whole.replaceAll(group ?? '', '')}${fraction === '' ? '' : `.${fraction}`}`, fraction);
}

// A calendar date that exists (2026-02-30 does not).
function realDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

// The canonical value a field takes for what a person typed or a file held, `undefined` for an empty one, or `null`
// when the value is not one of the field's type. Text is trimmed at its ends; a number keeps the number it reads as; a
// date is a real YYYY-MM-DD date; a link is an address the link rule allows; an image is a project path, a file name
// or a web address (which one it names is resolved when an element shows it: core/design/components.ts imageSource).
// The site's language, when given, says what a thousands mark is (readNumber).
export function readCell(type: FieldType, value: unknown, language?: string): Cell | undefined | null {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  const text = typeof value === 'string' ? value.trim() : null;
  switch (type) {
    case 'text':
      return typeof value === 'number' || typeof value === 'boolean' ? String(value) : text;
    case 'richtext': {
      // a text typed in a cell may mark itself with tags (<b>, <i>, <a href>): read as the marks they name
      if (text !== null) {
        const typed = canonical(runsFromTypedMarkup(text));
        return plainText(typed).trim() === '' ? undefined : typed;
      }
      const runs = parseInline(value);
      if (runs === null || runs === 'unsafe') return null;
      const runsCanonical = canonical(runs);
      return plainText(runsCanonical).trim() === '' ? undefined : runsCanonical;
    }
    case 'number': {
      if (typeof value === 'number') return Number.isFinite(value) ? value : null;
      if (text === null) return null;
      return readNumber(text, language)?.value ?? null;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : null;
      const word = text === null ? '' : fold(text);
      if (TRUE_WORDS.includes(word)) return true;
      if (FALSE_WORDS.includes(word)) return false;
      return null;
    }
    case 'date':
      return text !== null && realDate(text) ? text : null;
    case 'link': {
      if (text === null) return null;
      // a page of the project by its file ("about.html", "blog/post.html#top") is a path, never a domain
      if (PAGE_PATH.test(text)) return text;
      const address = readAddress(text);
      return address.ok ? address.value : null;
    }
    case 'image':
    case 'file': {
      // a control character hides a scheme from the check below (the URL parser strips it: DATA-8); no file holds one
      if (text === null || holdsControl(text)) return null;
      // a web address must be one the link rule allows; a path or a file name is resolved by the element that shows it
      if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return readAddress(text).ok ? text : null;
      return /\s$|^\s/.test(text) ? null : text;
    }
    case 'reference':
    case 'option':
      // the id of an item, or a choice: which one it names is the field's to say (readFieldCell)
      return text;
    case 'multireference': {
      // the ids (or the names a person types, parted by commas, semicolons or lines), each once, in order
      const parts: readonly unknown[] | null = Array.isArray(value) ? value : text === null ? null : text.split(/[,;\n]/);
      if (parts === null || !parts.every((part) => typeof part === 'string')) return null;
      const ids = [...new Set((parts as readonly string[]).map((part) => part.trim()).filter((part) => part !== ''))];
      return ids.length === 0 ? undefined : ids;
    }
    case 'slug': {
      // the words of an address: lower case, no accents, words joined by "-" (text/fold.ts slug)
      if (text === null) return null;
      const word = slug(text);
      return word === '' ? null : word;
    }
    case 'email':
      return text !== null && EMAIL.test(text) ? text : null;
    case 'video': {
      // a web address (a video service's page or a video file on the web)
      if (text === null || !/^https?:\/\//i.test(text)) return null;
      const address = readAddress(text);
      return address.ok ? address.value : null;
    }
    case 'colour': {
      // a hexadecimal colour, written in full and in lower case ("#F80" → "#ff8800")
      const hex = text === null ? undefined : HEX_COLOR.exec(text)?.[1];
      if (hex === undefined) return null;
      const full = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join('') : hex;
      return `#${full.toLowerCase()}`;
    }
  }
}

// ---------------------------------------------------------------- values of a field

// The collections a value of a field may name: a collection of the project by its name (the document's).
export type Lookup = (collection: string) => Collection | undefined;
export const lookupIn =
  (document: { readonly collections?: readonly Collection[] }): Lookup =>
  (name) =>
    collectionNamed(document, name);
const NO_COLLECTIONS: Lookup = () => undefined;

// The field whose value names an item for a person (its title): the first text field, else the first slug, else the
// first field.
export function titleField(collection: Collection): Field | undefined {
  return collection.fields.find((f) => f.type === 'text') ?? collection.fields.find((f) => f.type === 'slug') ?? collection.fields[0];
}

// The words an item is named by: its title, else its id.
export function itemTitle(collection: Collection, item: Item, language?: string): string {
  const title = titleField(collection);
  const value = title === undefined ? undefined : item.values[title.key];
  const text = value === undefined || title === undefined || isReferenceType(title.type) ? '' : cellText(value, { yes: 'true', no: 'false' }, { language, decimals: title.decimals }).trim();
  return text === '' ? item.id : text;
}

// The item a person names in a collection: by its id, its slug, or its title (accents and case aside); undefined when
// no item answers.
export function itemNamed(collection: Collection, typed: string): Item | undefined {
  const named = typed.trim();
  const byId = collection.items.find((item) => item.id === named);
  if (byId !== undefined) return byId;
  const slugs = collection.fields.filter((f) => f.type === 'slug');
  const word = slug(named);
  const bySlug = word === '' ? undefined : collection.items.find((item) => slugs.some((f) => item.values[f.key] === word));
  if (bySlug !== undefined) return bySlug;
  const folded = fold(named);
  return collection.items.find((item) => fold(itemTitle(collection, item)) === folded);
}

// The canonical value a field takes for what a person typed or a file held (readCell), with what only the field knows:
// an option is one of its choices (the choice's own spelling), a reference names an item of its collection (by id, slug
// or title, kept as the item's id). `undefined` for an empty value, `null` for one the field cannot hold.
export function readFieldCell(field: Field, value: unknown, language: string | undefined, lookup: Lookup): Cell | undefined | null {
  const read = readCell(field.type, value, language);
  if (read === null || read === undefined) return read;
  if (field.type === 'option') {
    const choice = (field.options ?? []).find((option) => fold(option) === fold(read as string));
    return choice ?? null;
  }
  if (!isReferenceType(field.type)) return read;
  const target = field.collection === undefined ? undefined : lookup(field.collection);
  if (target === undefined) return null;
  const names = field.type === 'reference' ? [read as string] : (read as readonly string[]);
  const ids: string[] = [];
  for (const name of names) {
    const item = itemNamed(target, name);
    if (item === undefined) return null;
    if (!ids.includes(item.id)) ids.push(item.id);
  }
  return field.type === 'reference' ? (ids[0] ?? null) : ids;
}

// The ids a reference value names (one for a reference, the list for a multireference).
export const referencedIds = (value: Cell | undefined): readonly string[] => (typeof value === 'string' ? [value] : Array.isArray(value) ? (value as readonly unknown[]).filter((id): id is string => typeof id === 'string') : []);

// A value of a field as text, as a grid cell, a preview and a bound text show it: a reference by its item's title,
// several by their titles parted by commas, any other as cellText says.
export function fieldText(field: Field, value: Cell | undefined, words: { readonly yes: string; readonly no: string }, style: NumberStyle | undefined, lookup: Lookup): string {
  if (value === undefined) return '';
  if (isReferenceType(field.type)) {
    const target = field.collection === undefined ? undefined : lookup(field.collection);
    return referencedIds(value)
      .map((id) => {
        const item = target?.items.find((one) => one.id === id);
        return item === undefined || target === undefined ? id : itemTitle(target, item, style?.language);
      })
      .join(', ');
  }
  return cellText(value, words, style);
}

// The value of a field already stored is one it can hold now: canonical for its type, one of its choices, an item of
// its collection (a reference to an item that went is released by the derivation, derive.ts).
export function fieldHolds(field: Field, value: unknown, lookup: Lookup): boolean {
  if (!isCanonical(field.type, value)) return false;
  if (field.type === 'option') return (field.options ?? []).includes(value as string);
  if (!isReferenceType(field.type)) return true;
  const target = field.collection === undefined ? undefined : lookup(field.collection);
  return target !== undefined && referencedIds(value as Cell).every((id) => target.items.some((item) => item.id === id));
}

// The same value as the cell holds it, for a field of this type; a stored value that is not canonical is a defect.
export function isCanonical(type: FieldType, value: unknown): boolean {
  if (value === undefined) return false;
  const read = readCell(type, value);
  if (read === null || read === undefined) return false;
  return JSON.stringify(read) === JSON.stringify(value);
}

// How a number is written for a reader: in the site's language (its decimal separator, never a thousands one, so the
// text reads back as the same number) with the field's decimal places.
export interface NumberStyle {
  readonly language?: string | undefined;
  readonly decimals?: number | undefined;
}
export const MAX_DECIMALS = 10;

// A cell as text: what a grid cell, a preview and a bound text show (a boolean in the person's words, a number in the
// site's language when a style is given: "6,50", not "6.5", DEF-0620).
export function cellText(value: Cell | undefined, words: { readonly yes: string; readonly no: string }, style?: NumberStyle): string {
  if (value === undefined) return '';
  if (typeof value === 'boolean') return value ? words.yes : words.no;
  if (typeof value === 'number' && style !== undefined) return numberText(value, style);
  if (Array.isArray(value)) return plainText(value as readonly InlineRun[]);
  return String(value);
}

function numberText(value: number, style: NumberStyle): string {
  const decimals = style.decimals ?? 0;
  try {
    return new Intl.NumberFormat(style.language ?? 'en', { useGrouping: false, minimumFractionDigits: decimals, maximumFractionDigits: Math.max(decimals, 20) }).format(value);
  } catch (error) {
    // a language tag Intl does not know is written as a plain number, said by the error it raised
    if (error instanceof RangeError) return new Intl.NumberFormat('en', { useGrouping: false, minimumFractionDigits: decimals, maximumFractionDigits: Math.max(decimals, 20) }).format(value);
    throw error;
  }
}

// The decimal places a column of a file writes its numbers with: the most any filled value has ("6,50" → 2), 0 when
// none has a fraction. A thousands mark is no fraction ("1.500" on a pt-BR site has none, DATA-3).
export function decimalsOf(values: readonly unknown[], language?: string): number {
  let most = 0;
  for (const value of values) {
    if (typeof value !== 'string') continue;
    most = Math.max(most, readNumber(value.trim(), language)?.decimals ?? 0);
  }
  return Math.min(most, MAX_DECIMALS);
}

// A code written with digits that a number would change (DATA-6): a leading zero ("01310100", a CEP; "0,5" is a
// number), or more significant digits than a number keeps exactly (a phone with its country, a long SKU).
const MOST_DIGITS = 15;
function digitCode(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (/^[+-]?0\d/.test(text)) return true;
  const digits = text.replace(/e.*$/i, '').replace(/\D/g, '').replace(/^0+/, '');
  return digits.length > MOST_DIGITS;
}

// The kind of value a column of a file holds, guessed from its filled cells: every one a yes/no, a number, a date, an
// image file or address, a web address; else text. The person can change every guess before importing.
export function guessType(values: readonly unknown[], language?: string): FieldType {
  const filled = values.filter((value) => value !== null && value !== undefined && !(typeof value === 'string' && value.trim() === ''));
  if (filled.length === 0) return 'text';
  const all = (type: FieldType) => filled.every((value) => readCell(type, value, language) !== null);
  if (filled.every((value) => typeof value === 'boolean') || (all('boolean') && filled.every((value) => typeof value === 'string' && !/^[01]$/.test(value.trim())))) return 'boolean';
  // a column of codes stays text: a number would lose their zeros or their last digits (the person may still choose it)
  if (all('number') && !filled.some(digitCode)) return 'number';
  if (all('date')) return 'date';
  if (filled.every((value) => typeof value === 'string' && IMAGE_FILE.test(value.trim().split(/[?#]/)[0] ?? ''))) return 'image';
  if (filled.every((value) => typeof value === 'string' && VIDEO_ADDRESS.test(value.trim()) && readCell('video', value) !== null)) return 'video';
  if (filled.every((value) => typeof value === 'string' && /^https?:\/\//i.test(value.trim()) && readCell('link', value) !== null)) return 'link';
  if (all('email')) return 'email';
  // a colour is written with its "#" in a file ("#e11d48"): six hexadecimal digits alone are a code
  if (filled.every((value) => typeof value === 'string' && value.trim().startsWith('#')) && all('colour')) return 'colour';
  return 'text';
}

// ---------------------------------------------------------------- the schema

const FIELD_KEY = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
const RESERVED = ['__proto__', 'constructor', 'prototype'];

// The key a new field takes from its label: the label's letters and digits, without accents, joined by "_", and a
// number when it is taken ("nome", "nome_2"). A key never changes once made, so renaming a field keeps its bindings.
export function keyFor(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const words = fold(label).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const base = words === '' ? 'field' : /^[0-9]/.test(words) ? `f_${words}` : words;
  let key = base;
  for (let n = 2; used.has(key) || RESERVED.includes(key); n += 1) key = `${base}_${n}`;
  return key;
}

// Why a schema is not one, or null: at least one field, keys unique and well formed, labels present and unique (a
// person tells two columns apart by their labels), types known.
export function schemaRefusal(collection: string, fields: readonly Field[]): Message | null {
  if (fields.length === 0) return message('status.data.noFields', { collection });
  const keys = new Set<string>();
  const labels = new Set<string>();
  for (const field of fields) {
    if (!FIELD_KEY.test(field.key) || RESERVED.includes(field.key) || keys.has(field.key)) return message('status.data.badField', { collection, field: field.key });
    const label = fold(field.label.trim());
    if (label === '') return message('status.data.fieldLabelEmpty', { collection });
    if (labels.has(label)) return message('status.data.fieldLabelTaken', { collection, label: field.label.trim() });
    if (!(FIELD_TYPES as readonly string[]).includes(field.type)) return message('status.data.badField', { collection, field: field.key });
    if (field.decimals !== undefined && (field.type !== 'number' || !Number.isInteger(field.decimals) || field.decimals < 0 || field.decimals > MAX_DECIMALS)) return message('status.data.badField', { collection, field: field.key });
    // a reference names the collection of its items (whether it is one of the project's is the document's to say,
    // data/validate.ts); the choices of an option are texts, each once; a slug is made from a field of its collection
    if (isReferenceType(field.type) !== (typeof field.collection === 'string' && field.collection.trim() !== '')) return message('status.data.badField', { collection, field: field.key });
    const options: unknown = field.options;
    if ((field.type === 'option') !== (options !== undefined) || (options !== undefined && (!Array.isArray(options) || options.some((o) => typeof o !== 'string' || o.trim() !== o || o === '') || new Set(options.map((o: string) => fold(o))).size !== options.length))) return message('status.data.badField', { collection, field: field.key });
    if (field.from !== undefined && (field.type !== 'slug' || !fields.some((f) => f.key === field.from && f.key !== field.key && !isReferenceType(f.type)))) return message('status.data.badField', { collection, field: field.key });
    keys.add(field.key);
    labels.add(label);
  }
  return null;
}

// Why a name cannot be a collection's (empty, or another collection's), or null.
export function nameRefusal(collections: readonly Collection[], name: string, except?: string): Message | null {
  const trimmed = name.trim();
  if (trimmed === '') return message('status.data.nameEmpty');
  if (collections.some((c) => c.name !== except && fold(c.name) === fold(trimmed))) return message('status.data.nameTaken', { name: trimmed });
  return null;
}

// ---------------------------------------------------------------- items

// The values of an item read from a row (field key → what the row holds), each in its canonical form; a value that is
// not one of its field's type is refused naming the row (counted from 1, as a person counts the rows of a file), the
// column and the value.
function valuesOf(collection: string, fields: readonly Field[], row: Readonly<Record<string, unknown>>, rowNumber: number, language: string | undefined, lookup: Lookup): Record<string, Cell> {
  const values: Record<string, Cell> = {};
  for (const field of fields) {
    if (!Object.hasOwn(row, field.key)) continue;
    const read = readFieldCell(field, row[field.key], language, lookup);
    if (read === null) refuse('status.data.badValue', { collection, row: rowNumber, column: field.label, value: shownValue(row[field.key]), type: { key: `data.type.${field.type}` as MessageId } });
    if (read !== undefined) values[field.key] = read;
  }
  return values;
}
const shownValue = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value) ?? '');

export function createCollection(collections: readonly Collection[], name: string, fields: readonly Field[]): Collection {
  const named = nameRefusal(collections, name);
  if (named !== null) throw new DataRefusal(named);
  const schema = schemaRefusal(name.trim(), fields);
  if (schema !== null) throw new DataRefusal(schema);
  return { name: name.trim(), fields: fields.map((f) => ({ key: f.key, label: f.label.trim(), type: f.type, ...(f.type === 'number' && f.decimals !== undefined && f.decimals > 0 ? { decimals: f.decimals } : {}), ...(f.collection === undefined ? {} : { collection: f.collection }), ...(f.options === undefined ? {} : { options: f.options }), ...(f.from === undefined ? {} : { from: f.from }) })), items: [] };
}

export type ImportMode = 'append' | 'replace' | 'update';

// The collection with the rows imported (each row: field key → value): appended after its items, in place of them,
// or updating the item whose key field holds the row's key (rows with a new key are appended). An update needs a key
// that is filled and unique in the collection and in the rows; the whole import is refused at its first bad row.
// A replace keeps the ids of the items it replaces (DATA-7), so the pages made for them and the links to those pages
// stay: the item holding the row's key when a key is named, else the item at the row's place; a row past them is new.
export function importRows(collection: Collection, rows: readonly Readonly<Record<string, unknown>>[], mode: ImportMode, key: string | null, next: () => string, language?: string, lookup: Lookup = NO_COLLECTIONS): Collection {
  const keyField = key === null ? undefined : collection.fields.find((f) => f.key === key);
  if (mode === 'update' && (keyField === undefined || keyField.type === 'richtext')) refuse('status.data.keyNeeded', { collection: collection.name });
  const items: Item[] = mode === 'replace' ? [] : [...collection.items];
  const at = new Map<string, number>();
  if (keyField !== undefined && mode === 'update') {
    items.forEach((item, index) => {
      const held = item.values[keyField.key];
      if (held !== undefined) at.set(JSON.stringify(held), index);
    });
  }
  const replacedBy = new Map<string, string>();
  if (keyField !== undefined && mode === 'replace') {
    for (const item of collection.items) {
      const held = item.values[keyField.key];
      if (held !== undefined && !replacedBy.has(JSON.stringify(held))) replacedBy.set(JSON.stringify(held), item.id);
    }
  }
  const reused = new Set<string>();
  const replacedId = (index: number, values: Readonly<Record<string, Cell>>): string => {
    const held = keyField === undefined ? undefined : values[keyField.key];
    const id = keyField === undefined ? collection.items[index]?.id : held === undefined ? undefined : replacedBy.get(JSON.stringify(held));
    if (id === undefined || reused.has(id)) return next();
    reused.add(id);
    return id;
  };
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const values = valuesOf(collection.name, collection.fields, row, rowNumber, language, lookup);
    if (mode !== 'update' || keyField === undefined) {
      items.push({ id: mode === 'replace' ? replacedId(index, values) : next(), values });
      return;
    }
    const keyValue = values[keyField.key];
    if (keyValue === undefined) refuse('status.data.keyEmpty', { collection: collection.name, row: rowNumber, column: keyField.label });
    const identity = JSON.stringify(keyValue);
    if (seen.has(identity)) refuse('status.data.keyRepeated', { collection: collection.name, row: rowNumber, column: keyField.label, value: cellText(keyValue, { yes: 'true', no: 'false' }) });
    seen.add(identity);
    const existing = at.get(identity);
    const previous = existing === undefined ? undefined : items[existing];
    if (existing === undefined || previous === undefined) items.push({ id: next(), values });
    else items[existing] = { id: previous.id, values: { ...previous.values, ...values } };
  });
  return slugsUnique({ ...collection, items });
}

// The collection with one value of an item set from what a person typed ('' empties it).
export function setCell(collection: Collection, itemId: string, fieldKey: string, typed: unknown, language?: string, lookup: Lookup = NO_COLLECTIONS): Collection {
  const field = collection.fields.find((f) => f.key === fieldKey);
  const index = collection.items.findIndex((item) => item.id === itemId);
  const item = collection.items[index];
  // a name of an item or a field the collection does not hold went stale under its door (the random probe)
  if (field === undefined || item === undefined) refuse('status.stale');
  const read = readFieldCell(field, typed, language, lookup);
  if (read === null) refuse('status.data.badValue', { collection: collection.name, row: index + 1, column: field.label, value: shownValue(typed), type: { key: `data.type.${field.type}` as MessageId } });
  const { [field.key]: _old, ...others } = item.values;
  void _old;
  const values = read === undefined ? others : { ...others, [field.key]: read };
  return slugsUnique({ ...collection, items: collection.items.map((one) => (one.id === itemId ? { id: one.id, values } : one)) });
}

export function addItem(collection: Collection, id: string): Collection {
  return { ...collection, items: [...collection.items, { id, values: {} }] };
}

export function deleteItems(collection: Collection, ids: readonly string[]): Collection {
  const gone = new Set(ids);
  for (const id of gone) if (!collection.items.some((item) => item.id === id)) refuse('status.stale');
  return { ...collection, items: collection.items.filter((item) => !gone.has(item.id)) };
}

// The item moved to a place of the collection (0 first), the others keeping their order.
export function moveItem(collection: Collection, id: string, to: number): Collection {
  const from = collection.items.findIndex((item) => item.id === id);
  const moved = collection.items[from];
  if (moved === undefined) refuse('status.stale');
  const rest = collection.items.filter((item) => item.id !== id);
  const place = Math.max(0, Math.min(rest.length, Math.trunc(to)));
  return { ...collection, items: [...rest.slice(0, place), moved, ...rest.slice(place)] };
}

// ---------------------------------------------------------------- fields

// A new field: a reference names the collection given (the command chooses one), an option starts with no choice.
export function addField(collection: Collection, label: string, type: FieldType, target?: string): Collection {
  const field: Field = { key: keyFor(label, collection.fields.map((f) => f.key)), label: label.trim(), type, ...(isReferenceType(type) && target !== undefined ? { collection: target } : {}), ...(type === 'option' ? { options: [] } : {}) };
  const fields = [...collection.fields, field];
  const refused = schemaRefusal(collection.name, fields);
  if (refused !== null) throw new DataRefusal(refused);
  return { ...collection, fields };
}

// A field changed (the field menu): its label, its type, its decimal places (DATA-1: how many decimals a number shows
// on the page; 0 stores none, as a new field holds), the collection a reference names, the choices of an option, the
// field a slug is made from. Every value it holds is read again whenever what it may hold changed — through the text
// it shows (a number 42 becomes the text "42", a reference its item's title, a title the reference to the item it
// names) — and the change is refused at the first item whose value the field can no longer hold: nothing is converted
// silently or dropped. The decimal places stay with a number field and go when it becomes another type; asked of
// another type, or outside 0 to MAX_DECIMALS, they are refused with their own reason.
export interface FieldChange {
  readonly label?: string;
  readonly type?: FieldType;
  readonly decimals?: number;
  readonly collection?: string;
  readonly options?: readonly string[];
  readonly from?: string;
}
export function setField(collection: Collection, key: string, change: FieldChange, lookup: Lookup = NO_COLLECTIONS, language?: string): Collection {
  const field = collection.fields.find((f) => f.key === key);
  if (field === undefined) refuse('status.stale');
  const type = change.type ?? field.type;
  if (change.decimals !== undefined && type !== 'number') refuse('status.data.decimalsNumberOnly', { collection: collection.name, label: field.label });
  if (change.decimals !== undefined && (!Number.isInteger(change.decimals) || change.decimals < 0 || change.decimals > MAX_DECIMALS)) refuse('status.data.decimalsRange', { collection: collection.name, max: MAX_DECIMALS });
  if ((change.collection !== undefined && !isReferenceType(type)) || (change.options !== undefined && type !== 'option') || (change.from !== undefined && type !== 'slug')) refuse('status.data.badField', { collection: collection.name, field: field.label });
  const decimals = change.decimals ?? (type === 'number' ? field.decimals : undefined);
  const target = isReferenceType(type) ? (change.collection ?? field.collection) : undefined;
  if (isReferenceType(type) && (target === undefined || lookup(target) === undefined)) refuse('status.data.noTarget', { collection: collection.name, label: field.label });
  // a slug made from this field needs it to hold words (a reference holds ids)
  const madeFrom = collection.fields.find((f) => f.type === 'slug' && f.from === key);
  if (madeFrom !== undefined && isReferenceType(type)) refuse('status.data.slugSource', { collection: collection.name, label: field.label, slug: madeFrom.label });
  // an option field's choices: the ones asked, else the ones it had, else the values it holds (each once)
  const held = collection.items.map((item) => fieldText(field, item.values[key], { yes: 'true', no: 'false' }, { language, decimals: field.decimals }, lookup).trim()).filter((text) => text !== '');
  const wanted = type !== 'option' ? undefined : (change.options ?? field.options ?? held);
  const options = wanted === undefined ? undefined : wanted.map((option) => option.trim()).filter((option, i, all) => option !== '' && all.findIndex((other) => fold(other) === fold(option)) === i);
  const from = type !== 'slug' ? undefined : change.from === undefined ? field.from : change.from === '' ? undefined : change.from;
  const next: Field = {
    key,
    label: change.label === undefined ? field.label : change.label.trim(),
    type,
    ...(decimals !== undefined && decimals > 0 ? { decimals } : {}),
    ...(target === undefined ? {} : { collection: target }),
    ...(options === undefined ? {} : { options }),
    ...(from === undefined ? {} : { from }),
  };
  const fields = collection.fields.map((f) => (f.key === key ? next : f));
  const refused = schemaRefusal(collection.name, fields);
  if (refused !== null) throw new DataRefusal(refused);
  const reread = next.type !== field.type || next.collection !== field.collection || JSON.stringify(next.options) !== JSON.stringify(field.options);
  if (!reread) return { ...collection, fields };
  const items = collection.items.map((item, index) => {
    const value = item.values[key];
    if (value === undefined) return item;
    // rich text keeps its runs only as rich text; any other value goes through the text it shows
    const source = next.type === 'richtext' && field.type === 'richtext' ? value : fieldText(field, value, { yes: 'true', no: 'false' }, undefined, lookup);
    const read = readFieldCell(next, source, undefined, lookup);
    if (read === null) refuse('status.data.badValue', { collection: collection.name, row: index + 1, column: next.label, value: fieldText(field, value, { yes: 'true', no: 'false' }, undefined, lookup), type: { key: `data.type.${next.type}` as MessageId } });
    const { [key]: _old, ...others } = item.values;
    void _old;
    return { id: item.id, values: read === undefined ? others : { ...others, [key]: read } };
  });
  return slugsUnique({ ...collection, fields, items });
}

// The collection, refused when two of its items hold the same slug (a slug is the address of the item's page).
export function slugsUnique(collection: Collection): Collection {
  for (const field of collection.fields) {
    if (field.type !== 'slug') continue;
    const seen = new Set<string>();
    collection.items.forEach((item, index) => {
      const value = item.values[field.key];
      if (typeof value !== 'string') return;
      if (seen.has(value)) refuse('status.data.slugTaken', { collection: collection.name, row: index + 1, column: field.label, value });
      seen.add(value);
    });
  }
  return collection;
}

// The slugs an item has not been given, made from the field each is made from (its title): the words of the title,
// numbered when another item holds them ("bolo", "bolo-2"). A slug a person typed stays as it is.
export function filledSlugs(collection: Collection): Collection {
  const slugFields = collection.fields.filter((f) => f.type === 'slug');
  if (slugFields.length === 0) return collection;
  let items = collection.items;
  for (const field of slugFields) {
    const source = collection.fields.find((f) => f.key === field.from) ?? collection.fields.find((f) => f.type === 'text');
    if (source === undefined || !items.some((item) => item.values[field.key] === undefined && item.values[source.key] !== undefined)) continue;
    const taken = new Set(items.map((item) => item.values[field.key]).filter((value): value is string => typeof value === 'string'));
    items = items.map((item) => {
      const title = item.values[source.key];
      if (item.values[field.key] !== undefined || title === undefined) return item;
      const base = slug(cellText(title, { yes: 'yes', no: 'no' }, { decimals: source.decimals }));
      if (base === '') return item;
      let word = base;
      for (let n = 2; taken.has(word); n += 1) word = `${base}-${n}`;
      taken.add(word);
      return { id: item.id, values: { ...item.values, [field.key]: word } };
    });
  }
  return items === collection.items ? collection : { ...collection, items };
}

export function removeField(collection: Collection, key: string): Collection {
  const fields = collection.fields.filter((f) => f.key !== key);
  const refused = schemaRefusal(collection.name, fields);
  if (refused !== null) throw new DataRefusal(refused);
  const items = collection.items.map((item) => {
    const { [key]: _old, ...values } = item.values;
    void _old;
    return { id: item.id, values };
  });
  return { ...collection, fields, items };
}

// ---------------------------------------------------------------- the query

// How two values of a field compare: empty last, then by the field's type (texts as a person sorts them, accents and
// case set aside); null when they do not compare (two rich texts compare by their text).
function compare(a: Cell | undefined, b: Cell | undefined): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  const left = Array.isArray(a) ? plainText(a as readonly InlineRun[]) : String(a);
  const right = Array.isArray(b) ? plainText(b as readonly InlineRun[]) : String(b);
  return left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true });
}

// What a value of a field is compared and sorted by: a reference by the titles of the items it names, parted by
// commas, as the grid shows it; any other value as it is.
const compared = (field: Field, value: Cell | undefined, lookup: Lookup): Cell | undefined => (value === undefined || !isReferenceType(field.type) ? value : fieldText(field, value, { yes: 'true', no: 'false' }, undefined, lookup));

function holds(filter: Filter, field: Field, value: Cell | undefined, lookup: Lookup): boolean {
  if (filter.operator === 'empty') return value === undefined;
  if (filter.operator === 'filled') return value !== undefined;
  if (value === undefined) return false;
  const typed = filter.value ?? '';
  // a reference holds a text when one of the items it names is titled so (eq), none is (neq), or a title holds it
  if (isReferenceType(field.type)) {
    const target = field.collection === undefined ? undefined : lookup(field.collection);
    const titles = referencedIds(value).map((id) => {
      const item = target?.items.find((one) => one.id === id);
      return fold(item === undefined || target === undefined ? id : itemTitle(target, item));
    });
    const wanted = fold(typed.trim());
    if (filter.operator === 'eq') return titles.includes(wanted);
    if (filter.operator === 'neq') return !titles.includes(wanted);
    if (filter.operator === 'contains') return titles.some((title) => title.includes(wanted));
  }
  // a number holds the digits the site writes, with its decimal places and either decimal mark ("6,5" finds 6.50)
  if (filter.operator === 'contains' && typeof value === 'number') return numberText(value, { language: 'en', decimals: field.decimals }).includes(typed.trim().replace(',', '.'));
  if (filter.operator === 'contains') return fold(cellText(value, { yes: 'true', no: 'false' })).includes(fold(typed.trim()));
  // the other operators compare with the typed text read as the field's type (a reference: as the titles' text)
  const other = isReferenceType(field.type) ? typed.trim() : readCell(field.type, typed);
  if (other === null || other === undefined || other === '') return false;
  const order = compare(compared(field, value, lookup), other);
  switch (filter.operator) {
    case 'eq':
      return order === 0;
    case 'neq':
      return order !== 0;
    case 'lt':
      return order < 0;
    case 'lte':
      return order <= 0;
    case 'gt':
      return order > 0;
    case 'gte':
      return order >= 0;
  }
}

// Why a query cannot be read for this collection (a field it names is not one, a count is not a whole number), or null.
export function queryRefusal(collection: Collection, query: Query): Message | null {
  const named = [...(query.filters ?? []).map((f) => f.field), ...(query.order ?? []).map((s) => s.field)];
  const unknown = named.find((key) => !collection.fields.some((f) => f.key === key));
  if (unknown !== undefined) return message('status.data.unknownField', { collection: collection.name, field: unknown });
  for (const count of [query.offset, query.limit]) if (count !== undefined && (!Number.isSafeInteger(count) || count < 0)) return message('status.data.badCount', { collection: collection.name });
  // a page shows one item at least
  if (query.pageSize !== undefined && (!Number.isSafeInteger(query.pageSize) || query.pageSize < 1)) return message('status.data.badCount', { collection: collection.name });
  if (query.paging !== undefined && !(PAGINGS as readonly string[]).includes(query.paging)) return message('status.data.badCount', { collection: collection.name });
  return null;
}

// The items a query shows, in order: the filters (every one, or any one), then a stable sort by each order key in
// turn (items equal on every key keep the collection's order), then offset and limit. Every page of a paged list: the
// canvas shows the first one (firstPage).
export function queryItems(collection: Collection, query: Query, lookup: Lookup = NO_COLLECTIONS): readonly Item[] {
  const refused = queryRefusal(collection, query);
  if (refused !== null) throw new DataRefusal(refused);
  const fieldOf = (key: string): Field => collection.fields.find((f) => f.key === key) as Field;
  const filters = query.filters ?? [];
  const kept = collection.items.filter((item) => {
    if (filters.length === 0) return true;
    const results = filters.map((filter) => holds(filter, fieldOf(filter.field), item.values[filter.field], lookup));
    return query.match === 'any' ? results.some(Boolean) : results.every(Boolean);
  });
  const order = query.order ?? [];
  const sorted = kept
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      for (const sort of order) {
        const field = fieldOf(sort.field);
        const by = compare(compared(field, a.item.values[sort.field], lookup), compared(field, b.item.values[sort.field], lookup));
        // an empty value stays last whichever the direction
        const empty = a.item.values[sort.field] === undefined || b.item.values[sort.field] === undefined;
        if (by !== 0) return sort.direction === 'desc' && !empty ? -by : by;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.item);
  const offset = query.offset ?? 0;
  return sorted.slice(offset, query.limit === undefined ? undefined : offset + query.limit);
}

// The one rule of what a page of a list holds (the review's R-2): a page has `pageSize` items that show, counted after
// the show filter (`shows`: the repeated item's show binding holds for it), as a visitor sees the list. The first page
// is the rows up to the last of its items that show, the ones the show binding hides among them included (they stay
// hidden): what the canvas shows, and what the site shows before the list script reveals more (materialize.ts marks
// the rows past it, core/export/lists.ts counts only the items that show). `more`: an item that shows lies past it.
// Every row is on the first page while the list has no page size.
export function firstPage<T>(rows: readonly T[], query: Query, shows: (row: T) => boolean): { readonly rows: readonly T[]; readonly more: boolean } {
  const size = query.pageSize;
  if (size === undefined) return { rows, more: false };
  let counted = 0;
  for (let i = 0; i < rows.length; i += 1) {
    if (!shows(rows[i] as T)) continue;
    counted += 1;
    if (counted === size) return { rows: rows.slice(0, i + 1), more: rows.slice(i + 1).some(shows) };
  }
  return { rows, more: false };
}

// A query in its canonical form: no empty list, no default, so two equal queries are the same JSON.
export function canonicalQuery(query: Query): Query {
  return {
    ...(query.filters !== undefined && query.filters.length > 0 ? { filters: query.filters.map((f) => (f.value === undefined || f.operator === 'empty' || f.operator === 'filled' ? { field: f.field, operator: f.operator } : { field: f.field, operator: f.operator, value: f.value })) } : {}),
    ...(query.match === 'any' ? { match: 'any' as const } : {}),
    ...(query.order !== undefined && query.order.length > 0 ? { order: query.order.map((s) => ({ field: s.field, direction: s.direction })) } : {}),
    ...(query.offset !== undefined && query.offset > 0 ? { offset: query.offset } : {}),
    ...(query.limit !== undefined ? { limit: query.limit } : {}),
    ...(query.pageSize !== undefined ? { pageSize: query.pageSize } : {}),
    // "load more" is the default way to the next pages
    ...(query.pageSize !== undefined && query.paging === 'pages' ? { paging: 'pages' as const } : {}),
  };
}

// a collection an argument names (manifest refers: collection), by its name
registerReferenceKind('collection', (document, name) => collectionNamed(document, name) !== undefined);
