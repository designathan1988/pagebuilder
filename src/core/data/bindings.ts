// Bound elements (spec content-data, "binding"): what an element can show of an item, how it shows a value, and what
// it shows now. A binding is the element's own mark (`bind`): a field of the item — or a path through reference
// fields to a field of the item a reference names ("author.name") — and the part of the element it fills (its text, an
// image's source or alternative text, a link's address), with the format the value is written in; or a show binding,
// which says whether the element shows for the item. The item comes from where the element stands: the n-th repeated
// item of a bound list shows the n-th item of the list's query, an item of a nested list the n-th item its parent's
// item names, and every element of a page made for an item shows that item.
import type { MessageId } from '../../generated/ids.ts';
import en from '../../i18n/locales/en.json' with { type: 'json' };
import ptBR from '../../i18n/locales/pt-BR.json' with { type: 'json' };
import type { DocNode, DocumentJson, Page } from '../document/model.ts';
import type { ModelRules } from '../document/validate.ts';
import type { IdGenerator } from '../ports/ids.ts';
import { imageSource } from '../design/components.ts';
import { readAddress } from '../elements/address.ts';
import { canonical, hasMarks, plainText, type InlineRun } from '../text/inline.ts';
import { fold, slug } from '../text/fold.ts';
import { cellText, collectionNamed, fieldText, itemTitle, lookupIn, readFieldCell, referencedIds, refuse, titleField, type Lookup } from './collections.ts';
import { ITEM_PAGE, PATH_SEPARATOR, SHOW, isReferenceType, type BindFormat, type BindTarget, type Bound, type Cell, type Collection, type DataList, type Field, type Item } from './model.ts';
export { fieldFits, targetsOf } from './targets.ts';

// What a content operation needs of the store: new ids, the model's rules, the words of the person's language.
export interface DataContext {
  readonly ids: IdGenerator;
  readonly rules: ModelRules;
  words(key: MessageId, params?: Readonly<Record<string, string | number>>): string;
}

// Whether a child of a bound list is one of its repeated items: an instance of the list's component, or any child of a
// nested list (every child of a nested list is one of its items).
export const repeats = (list: DataList, child: DocNode): boolean => list.via !== undefined || (list.component !== undefined && child.component === list.component);

// ---------------------------------------------------------------- the pages made for items

// The addresses of the pages made for items (spec content-data, "one page per item"): collection name and item id →
// the page's file. A page copied for one item is that item's; a template page stands for every item of its collection,
// each at the folder of its collection and its slug (itemPaths), and takes precedence over a copy.
export type ItemPages = ReadonlyMap<string, string>;
const itemPageKey = (collection: string, item: string): string => `${collection}\u0000${item}`;
export function itemPagesOf(document: DocumentJson): ItemPages {
  const pages = new Map<string, string>();
  for (const page of document.pages) {
    const mark = page.tree.dataItem;
    if (mark !== undefined && mark.template !== true && mark.item !== undefined) pages.set(itemPageKey(mark.collection, mark.item), page.file);
  }
  for (const [collection, paths] of templatePaths(document)) for (const [item, path] of paths) pages.set(itemPageKey(collection, item), path);
  return pages;
}

// The address of an item's own page, or undefined while it has none.
export const itemPageOf = (pages: ItemPages, collection: string, item: string): string | undefined => pages.get(itemPageKey(collection, item));

// The template pages of the document and the file each item of their collection is written at by the export: the
// folder of the collection's name, the item's slug (its slug field, else the words of its title, else its id), ".html";
// a file another page or an earlier item holds is numbered ("bolo-2.html").
export function templatePaths(document: DocumentJson): ReadonlyMap<string, ReadonlyMap<string, string>> {
  const all = new Map<string, Map<string, string>>();
  const taken = new Set(document.pages.filter((page) => page.tree.dataItem?.template !== true).map((page) => page.file));
  for (const page of document.pages) {
    const mark = page.tree.dataItem;
    if (mark?.template !== true || all.has(mark.collection)) continue;
    const collection = collectionNamed(document, mark.collection);
    if (collection === undefined) continue;
    const folder = slug(collection.name) === '' ? 'items' : slug(collection.name);
    const slugField = collection.fields.find((f) => f.type === 'slug');
    const named = collection.fields.find((f) => f.key === mark.field);
    const paths = new Map<string, string>();
    for (const item of collection.items) {
      const own = slugField === undefined ? undefined : item.values[slugField.key];
      const words = named === undefined ? undefined : item.values[named.key];
      const fromField = named === undefined || words === undefined ? '' : slug(fieldText(named, words, siteYesNo(document.language), { language: document.language, decimals: named.decimals }, lookupIn(document)));
      const word = typeof own === 'string' && own !== '' ? own : fromField || slug(itemTitle(collection, item, document.language)) || slug(item.id) || 'item';
      let path = `${folder}/${word}.html`;
      for (let n = 2; taken.has(path); n += 1) path = `${folder}/${word}-${n}.html`;
      taken.add(path);
      paths.set(item.id, path);
    }
    all.set(collection.name, paths);
  }
  return all;
}

// The template page of a collection, or undefined.
export const templateOf = (document: DocumentJson, collection: string): Page | undefined => document.pages.find((page) => page.tree.dataItem?.template === true && page.tree.dataItem.collection === collection);

// ---------------------------------------------------------------- what an element shows

// What an element shows now for a target: its text, its source, its alternative text or its address; undefined when
// it shows none.
export function shownBy(node: DocNode, to: BindTarget): string | undefined {
  const attribute = (name: string): string | undefined => {
    const value = (node.attributes as Readonly<Record<string, unknown>>)[name];
    return value === undefined ? undefined : String(value);
  };
  switch (to) {
    case 'text':
      return node.text ?? undefined;
    case 'image':
      return attribute('src');
    case 'alt':
      return attribute('alt');
    case 'link':
      return attribute('href');
  }
}

// Where a value is, to say it in a refusal: the row (counted from 1) and the column's label.
export interface Place {
  readonly collection: Collection;
  readonly item: Item;
  readonly row: number;
}

// The place of an item in its collection (its row counted from 1), or null when the collection holds no such item.
export function placeOf(collection: Collection, id: string): Place | null {
  const index = collection.items.findIndex((item) => item.id === id);
  const item = collection.items[index];
  return item === undefined ? null : { collection, item, row: index + 1 };
}

// The words a value is written with on the site: the site's language (a Portuguese site says "Sim"/"Não"), English for
// any other, never the language the person reads the editor in (DATA-2: what the page said depended on who edited it
// last).
const siteCatalogue = (language: string | undefined): Readonly<Record<string, string>> => ((language ?? 'en').toLowerCase().startsWith('pt') ? ptBR : en);
export function siteYesNo(language: string | undefined): { readonly yes: string; readonly no: string } {
  const catalogue = siteCatalogue(language);
  return { yes: catalogue['data.yes'] ?? 'Yes', no: catalogue['data.no'] ?? 'No' };
}
// a site word of the catalogue (the load-more button, the page links, the yes/no pairs)
export const siteWord = (language: string | undefined, key: MessageId): string => siteCatalogue(language)[key] ?? en[key as keyof typeof en] ?? key;

// The field and the item a binding's path reaches from a place: the field of the place's item, or, through each
// reference field of the path, the field of the item the reference names. Undefined when a field of the path is not
// one, a step is no single reference, or a reference on the way is empty.
export interface Reached {
  readonly collection: Collection;
  readonly item: Item;
  readonly field: Field;
  readonly row: number;
}
export function reachedBy(lookup: Lookup, place: Place, path: string): Reached | undefined {
  const steps = path.split(PATH_SEPARATOR);
  let at: Place = place;
  for (const [i, key] of steps.entries()) {
    const field = at.collection.fields.find((f) => f.key === key);
    if (field === undefined) return undefined;
    if (i === steps.length - 1) return { collection: at.collection, item: at.item, field, row: at.row };
    if (field.type !== 'reference' || field.collection === undefined) return undefined;
    const target = lookup(field.collection);
    const id = at.item.values[field.key];
    const next = target === undefined || typeof id !== 'string' ? null : placeOf(target, id);
    if (next === null) return undefined;
    at = next;
  }
  return undefined;
}

// The field a binding's path ends at, read from a collection's schema (the path's steps through reference fields): what
// the menus offer and the validator checks; undefined when the path names no field.
export function pathField(lookup: Lookup, collection: Collection, path: string): Field | undefined {
  const steps = path.split(PATH_SEPARATOR);
  let at: Collection | undefined = collection;
  for (const [i, key] of steps.entries()) {
    const field: Field | undefined = at?.fields.find((f) => f.key === key);
    if (field === undefined) return undefined;
    if (i === steps.length - 1) return field;
    if (field.type !== 'reference' || field.collection === undefined) return undefined;
    at = lookup(field.collection);
  }
  return undefined;
}

// The currency a site's language writes prices in, when a binding names none.
const CURRENCY_OF: Readonly<Record<string, string>> = { 'pt-br': 'BRL', pt: 'EUR', 'pt-pt': 'EUR', en: 'USD', 'en-us': 'USD', 'en-gb': 'GBP', 'en-ca': 'CAD', 'en-au': 'AUD', 'en-in': 'INR', es: 'EUR', 'es-mx': 'MXN', 'es-ar': 'ARS', 'es-cl': 'CLP', 'es-co': 'COP', fr: 'EUR', de: 'EUR', it: 'EUR', nl: 'EUR', ja: 'JPY', zh: 'CNY' };
export function siteCurrency(language: string | undefined): string {
  const tag = (language ?? 'en').toLowerCase();
  return CURRENCY_OF[tag] ?? CURRENCY_OF[tag.split('-')[0] ?? 'en'] ?? 'USD';
}

// Intl in the site's language, in English when Intl does not know the language's tag (said by the error it raises).
function inLanguage<T>(language: string | undefined, make: (tag: string) => T): T {
  try {
    return make(language ?? 'en');
  } catch (error) {
    if (error instanceof RangeError) return make('en');
    throw error;
  }
}

const DATE_STYLES: Readonly<Partial<Record<BindFormat, Intl.DateTimeFormatOptions>>> = {
  'date-short': { dateStyle: 'short' },
  'date-medium': { dateStyle: 'medium' },
  'date-long': { dateStyle: 'long' },
  'date-full': { dateStyle: 'full' },
  'month-year': { month: 'long', year: 'numeric' },
};
const WORD_PAIRS: Readonly<Partial<Record<BindFormat, readonly [MessageId, MessageId]>>> = {
  'yes-no': ['data.yes', 'data.no'],
  'true-false': ['data.word.true', 'data.word.false'],
  'on-off': ['data.word.on', 'data.word.off'],
};

// The formats a field's values can be written in (the binding's format menu): a number's, a date's, a yes/no's; none
// for the others.
export function formatsOf(field: Field): readonly BindFormat[] {
  if (field.type === 'number') return ['plain', 'grouped', 'currency', 'percent'];
  if (field.type === 'date') return ['date-short', 'date-medium', 'date-long', 'date-full', 'month-year'];
  if (field.type === 'boolean') return ['yes-no', 'true-false', 'on-off'];
  return [];
}

// A value as the site writes it with a binding's format, in the site's language: a number plain (its field's decimal
// places, no thousands mark, so it reads back), grouped, as a currency (the binding's, else the language's; the
// field's decimal places, else the currency's) or as a percent (12 → "12 %"); a date in one of Intl's styles; a yes/no
// in a pair of words; a reference as its items' titles; any other value as its text.
export function formattedText(field: Field, value: Cell, bound: Pick<Bound, 'format' | 'currency'>, language: string | undefined, lookup: Lookup): string {
  const format = bound.format !== undefined && formatsOf(field).includes(bound.format) ? bound.format : undefined;
  if (typeof value === 'number' && format !== undefined && format !== 'plain') {
    const decimals = field.decimals;
    const options: Intl.NumberFormatOptions =
      format === 'currency'
        ? { style: 'currency', currency: bound.currency ?? siteCurrency(language), ...(decimals === undefined ? {} : { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) }
        : format === 'percent'
          ? { style: 'percent', minimumFractionDigits: decimals ?? 0, maximumFractionDigits: Math.max(decimals ?? 0, 2) }
          : { useGrouping: true, minimumFractionDigits: decimals ?? 0, maximumFractionDigits: Math.max(decimals ?? 0, 20) };
    return inLanguage(language, (tag) => new Intl.NumberFormat(tag, options).format(format === 'percent' ? value / 100 : value));
  }
  if (typeof value === 'string' && field.type === 'date' && format !== undefined) {
    const style = DATE_STYLES[format];
    if (style !== undefined) return inLanguage(language, (tag) => new Intl.DateTimeFormat(tag, { ...style, timeZone: 'UTC' }).format(new Date(`${value}T00:00:00.000Z`)));
  }
  if (typeof value === 'boolean') {
    const [yes, no] = WORD_PAIRS[format ?? 'yes-no'] ?? ['data.yes', 'data.no'];
    return siteWord(language, value ? yes : no);
  }
  return fieldText(field, value, siteYesNo(language), { language, decimals: field.decimals }, lookup);
}

// A text a person typed over a formatted value on the canvas, read back as the value the field holds: the number of a
// currency or a percent written in the site's language (its symbols and spaces aside), the item a title names; null
// when it reads as none.
export function readBack(field: Field, typed: string, bound: Pick<Bound, 'format'>, language: string | undefined, lookup: Lookup): Cell | undefined | null {
  const plain = readFieldCell(field, typed, language, lookup);
  if (plain !== null || field.type !== 'number' || bound.format === undefined || bound.format === 'plain') return plain;
  const digits = typed.replace(/[^\d.,+-]/g, '');
  // a percent is stored as the number it shows (12 shows "12 %")
  const read = readFieldCell(field, digits, language, lookup);
  return typeof read === 'number' ? read : null;
}

// Whether an element with a show binding shows for an item: its field set (a yes/no: yes), empty (a yes/no: no), equal
// to the binding's value (a reference: one of its items titled so) or not.
export function showHolds(document: DocumentJson, bound: Bound, place: Place): boolean {
  const lookup = lookupIn(document);
  const reached = reachedBy(lookup, place, bound.field);
  const value = reached?.item.values[reached.field.key];
  const set = value !== undefined && value !== false;
  switch (bound.when ?? 'filled') {
    case 'filled':
      return set;
    case 'empty':
      return !set;
    case 'eq':
    case 'neq': {
      const equal = reached !== undefined && value !== undefined && valueEquals(reached.field, value, bound.value ?? '', document.language, lookup);
      return bound.when === 'eq' ? equal : !equal;
    }
  }
}

// A value equal to a text a person typed: the text read as the field's value, else (a reference, a text) by the words
// it shows, accents and case aside.
function valueEquals(field: Field, value: Cell, typed: string, language: string | undefined, lookup: Lookup): boolean {
  if (isReferenceType(field.type)) {
    const target = field.collection === undefined ? undefined : lookup(field.collection);
    return referencedIds(value).some((id) => {
      const item = target?.items.find((one) => one.id === id);
      return item !== undefined && target !== undefined && fold(itemTitle(target, item)) === fold(typed.trim());
    });
  }
  const read = readFieldCell(field, typed, language, lookup);
  if (read !== null && read !== undefined) return JSON.stringify(read) === JSON.stringify(value);
  return fold(cellText(value, { yes: 'true', no: 'false' }, { language, decimals: field.decimals })) === fold(typed.trim());
}

// What a binding makes an element show for its item: the value as text (in the binding's format), the image the value
// names (a project path, a project image by its file name, a web address), the address of a link (an email's mailto:),
// or of the item's page. Undefined when the item holds no value there: the element then shows none (fillNode). A
// value the target cannot show is refused, naming the row, the column and the value. A show binding shows nothing
// (showHolds).
export function valueFor(document: DocumentJson, bound: Bound, place: Place, pages: ItemPages): string | readonly InlineRun[] | undefined {
  if (bound.to === SHOW) return undefined;
  if (bound.field === ITEM_PAGE) return itemPageOf(pages, place.collection.name, place.item.id);
  const lookup = lookupIn(document);
  const reached = reachedBy(lookup, place, bound.field);
  if (reached === undefined) return undefined;
  const { field } = reached;
  const value: Cell | undefined = reached.item.values[field.key];
  if (value === undefined) return undefined;
  const text = formattedText(field, value, bound, document.language, lookup);
  switch (bound.to) {
    case 'text':
      return field.type === 'richtext' && Array.isArray(value) ? canonical(value as readonly InlineRun[]) : text;
    case 'alt':
      return text;
    case 'image': {
      const source = imageSource(document, text);
      if (source === null) refuse('status.data.imageNotFound', { row: reached.row, column: field.label, value: text });
      return source;
    }
    case 'link': {
      const address = readAddress(field.type === 'email' ? `mailto:${text}` : text);
      if (!address.ok || address.value === '') refuse('status.data.badLink', { row: reached.row, column: field.label, value: text });
      return address.value;
    }
  }
}

// The element showing its own bindings' values for an item (its children untouched). A text written by a binding takes
// the rich text's marks when the field holds some, and loses any marks it had otherwise. A show binding hides the
// element (dataHidden) while it does not hold for the item.
function fillNode(document: DocumentJson, node: DocNode, place: Place, pages: ItemPages, own: DocNode | undefined): DocNode {
  let next = node;
  for (const bound of node.bind ?? []) {
    if (bound.to === SHOW) {
      const { dataHidden: _was, ...shown } = next;
      void _was;
      next = showHolds(document, bound, place) ? shown : { ...shown, dataHidden: true };
      continue;
    }
    const value = valueFor(document, bound, place, pages);
    if (value === undefined) {
      // an item with no value there shows none — never the value another item left on the element (an item page
      // written from the template, a card reused for another item), nor a placeholder of the component's that a
      // visitor would read as the item's ("Author" for a post with none): its text empty, its address gone (an item
      // with no page yet: its link goes nowhere rather than somewhere wrong). An image keeps the component's own
      // picture and its alternative text (a new card keeps the template's photo), else none.
      const fallback = bound.to === 'image' || bound.to === 'alt' ? own : undefined;
      if (bound.to === 'text') {
        const { inline: _inline, ...plain } = next;
        void _inline;
        next = { ...plain, text: '' };
      } else {
        const attribute = bound.to === 'image' ? 'src' : bound.to === 'alt' ? 'alt' : 'href';
        const { [attribute]: _gone, ...attributes } = next.attributes as Readonly<Record<string, unknown>>;
        void _gone;
        const kept = (fallback?.attributes as Readonly<Record<string, unknown>> | undefined)?.[attribute];
        next = { ...next, attributes: (kept !== undefined ? { ...attributes, [attribute]: kept } : bound.to === 'alt' ? { ...attributes, alt: '' } : attributes) as DocNode['attributes'] };
      }
      continue;
    }
    if (bound.to === 'text') {
      const runs = typeof value === 'string' ? null : value;
      const { inline: _inline, ...plain } = next;
      void _inline;
      next = runs !== null && hasMarks(runs) ? { ...plain, text: plainText(runs), inline: runs } : { ...plain, text: runs === null ? (value as string) : plainText(runs) };
    } else {
      const attribute = bound.to === 'image' ? 'src' : bound.to === 'alt' ? 'alt' : 'href';
      next = { ...next, attributes: { ...next.attributes, [attribute]: value } };
    }
  }
  return next;
}

// Every element of a subtree that a fill of it reaches: the subtree's elements, except the repeated items of a bound
// list inside it (they show the list's items, not this one's).
export function* reached(root: DocNode): Generator<DocNode> {
  yield root;
  const list = root.dataList;
  for (const child of root.children) {
    if (list !== undefined && repeats(list, child)) continue;
    yield* reached(child);
  }
}

// A subtree showing an item: every element it reaches filled by its own bindings.
// (component: the component whose instance the subtree stands in, when its root is no instance's root — a nested list's
// item inside a card)
export function fillTree(document: DocumentJson, root: DocNode, place: Place, pages: ItemPages, component?: string): DocNode {
  const visit = (node: DocNode, within: string | undefined): DocNode => {
    const inside = node.component ?? within;
    const filled = node.bind === undefined ? node : fillNode(document, node, place, pages, definitionPart(document, inside, node));
    const list = node.dataList;
    const children = node.children.map((child) => (list !== undefined && repeats(list, child) ? child : visit(child, inside)));
    return children.every((child, i) => child === node.children[i]) ? filled : { ...filled, children };
  };
  return visit(root, component);
}

// What an element shows once its bindings show an item (in the instance of `component` it stands in): what a fill
// writes, which an edit of the element is told from.
export const filledFor = (document: DocumentJson, node: DocNode, place: Place, pages: ItemPages, component: string | undefined): DocNode => fillNode(document, node, place, pages, definitionPart(document, component, node));

// The element of a component's definition an element of its instance comes from (its part), or undefined.
export function definitionPart(document: DocumentJson, component: string | undefined, node: DocNode): DocNode | undefined {
  if (component === undefined || node.componentPart === undefined) return undefined;
  let at: DocNode | undefined = document.components?.find((c) => c.name === component)?.tree;
  for (const index of node.componentPart) at = at?.children[index];
  return at;
}

// The bindings of a subtree, where a fill of it reaches.
export const boundIn = (root: DocNode): DocNode[] => [...reached(root)].filter((node) => (node.bind ?? []).length > 0);

// The field keys of a collection's own fields a binding path names, with each collection the path passes through:
// "author.name" from Posts uses Posts' author and Authors' name.
export function pathUses(lookup: Lookup, collection: Collection, path: string): readonly { readonly collection: string; readonly field: string }[] {
  const uses: { collection: string; field: string }[] = [];
  let at: Collection | undefined = collection;
  for (const key of path.split(PATH_SEPARATOR)) {
    if (at === undefined) break;
    uses.push({ collection: at.name, field: key });
    const field: Field | undefined = at.fields.find((f) => f.key === key);
    at = field?.type === 'reference' && field.collection !== undefined ? lookup(field.collection) : undefined;
  }
  return uses;
}

// The paths a binding menu offers for a collection: its fields, and the fields of the collection each of its single
// reference fields names ("author.name"), one step deep, each with the words a person reads ("Author › Name").
export function bindablePaths(lookup: Lookup, collection: Collection): readonly { readonly path: string; readonly label: string; readonly field: Field }[] {
  const paths: { path: string; label: string; field: Field }[] = [];
  for (const field of collection.fields) {
    paths.push({ path: field.key, label: field.label, field });
    const target = field.type === 'reference' && field.collection !== undefined ? lookup(field.collection) : undefined;
    for (const inner of target?.fields ?? []) paths.push({ path: `${field.key}${PATH_SEPARATOR}${inner.key}`, label: `${field.label} › ${inner.label}`, field: inner });
  }
  return paths;
}

// The title of an item for a person, re-exported for the views (collections.ts itemTitle).
export { itemTitle, titleField };
