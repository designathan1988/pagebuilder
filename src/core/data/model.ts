// The content of a project (spec content-data): typed collections of items, the marks that bind an element to a field
// of an item, the lists and the pages those marks fill, and the shared regions every page shows.
//
// Where each part lives decides what follows it for free:
//  - the collections are a field of the project (`collections`), named like components are: a unique name is what
//    every binding refers to, so a scenario, a person and a saved file all read the same reference;
//  - a binding is a mark on the element it fills (`bind`), so it travels with the element when it is copied,
//    duplicated, made a component or deleted, and never points at an element that is gone;
//  - a bound list is a mark on the element that holds the repeated items (`dataList`): its items are that element's
//    children that are instances of the list's component, in order, the n-th showing the n-th item of the query;
//  - a page made for an item names the item on its root (`dataItem`);
//  - a shared region is a component whose definition says it is shared (`shared`): its instances show the same content
//    on every page that holds one.
// No part names a node by its id, so nothing is left dangling when nodes come and go.
import type { InlineRun } from '../text/inline.ts';

// The kinds of value a field holds (spec content-data, "schema"): besides the plain ones, an item of another
// collection (reference) or several (multireference), one of fixed choices (option), the item's own address word
// (slug), an email address, a file of the project or a web address (file), a video's web address and a colour.
export const FIELD_TYPES = ['text', 'richtext', 'image', 'number', 'date', 'link', 'boolean', 'reference', 'multireference', 'option', 'slug', 'email', 'file', 'video', 'colour'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
// the types whose values name items of another collection (Field.collection)
export const REFERENCE_TYPES: readonly FieldType[] = ['reference', 'multireference'];
export const isReferenceType = (type: FieldType): boolean => REFERENCE_TYPES.includes(type);

// A column of a collection: a key that never changes (what bindings and item values use), the label a person reads and
// renames, and the kind of value it holds.
export interface Field {
  readonly key: string;
  readonly label: string;
  readonly type: FieldType;
  // a number field: the decimal places its values are shown with (a price "6,50" keeps two), read from the file it
  // came from; absent: as many as the value has
  readonly decimals?: number;
  // a reference or multireference field: the collection whose items it names (by their ids)
  readonly collection?: string;
  // an option field: the choices a value is one of, in the order the menu offers them
  readonly options?: readonly string[];
  // a slug field: the field an item's slug is made from while it has none (its title); absent: the collection's first
  // text field
  readonly from?: string;
}

// One value of an item, in its canonical form: a text, a number, a boolean, a calendar date (YYYY-MM-DD), an address
// (link, image, file, video), the runs of a rich text, the id of the item a reference names, or the ids of the items a
// multireference names (in the order the person put them). An empty value is absent from the item.
export type Cell = string | number | boolean | readonly InlineRun[] | readonly string[];

export interface Item {
  // generated, stable while the item lives: what an item page names, what an update by key keeps
  readonly id: string;
  readonly values: Readonly<Record<string, Cell>>;
}

export interface Collection {
  readonly name: string;
  readonly fields: readonly Field[];
  readonly items: readonly Item[];
}

// Which items a list shows, and in which order: the filters first, then the order, then offset and limit.
export const FILTER_OPERATORS = ['contains', 'eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'empty', 'filled'] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];
export interface Filter {
  readonly field: string;
  readonly operator: FilterOperator;
  // the text the person typed (read as the field's type when compared); absent for empty and filled
  readonly value?: string;
}
export interface Sort {
  readonly field: string;
  readonly direction: 'asc' | 'desc';
}
export interface Query {
  readonly filters?: readonly Filter[];
  // every filter must hold ("all", the default) or one is enough ("any")
  readonly match?: 'all' | 'any';
  readonly order?: readonly Sort[];
  readonly offset?: number;
  readonly limit?: number;
  // the items a page of the list shows: the canvas shows the first page, the site the rest a page at a time
  readonly pageSize?: number;
  // how the site reaches the next pages while pageSize is set: a "load more" button (the default) or page links
  readonly paging?: Paging;
}
export const PAGINGS = ['more', 'pages'] as const;
export type Paging = (typeof PAGINGS)[number];

// What a bound element shows of its item: its text, an image's source or its alternative text, or a link's address.
export const BIND_TARGETS = ['text', 'image', 'alt', 'link'] as const;
export type BindTarget = (typeof BIND_TARGETS)[number];
// The binding that shows or hides an element by a field of its item (spec content-data, "conditional visibility").
export const SHOW = 'show';
// When an element with a show binding shows: while the field is set, while it is empty, while it equals a value, while
// it differs from it.
export const SHOW_WHEN = ['filled', 'empty', 'eq', 'neq'] as const;
export type ShowWhen = (typeof SHOW_WHEN)[number];
// How a bound value is written (spec content-data, "formatted values"), in the site's language: a number plain (the
// field's decimal places), grouped by thousands, as a currency or as a percent (12 → 12 %); a date short to full, or
// its month and year; a yes/no field in one of three pairs of words.
export const BIND_FORMATS = ['plain', 'grouped', 'currency', 'percent', 'date-short', 'date-medium', 'date-long', 'date-full', 'month-year', 'yes-no', 'true-false', 'on-off'] as const;
export type BindFormat = (typeof BIND_FORMATS)[number];
// the currencies a currency format offers (ISO 4217); absent on a binding: the site's language's own
export const CURRENCIES = ['BRL', 'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR', 'MXN', 'ARS', 'CLP', 'COP'] as const;
// The key a link binds to for the address of the item's own page (spec content-data, "one page per item"). A field key
// starts with a letter or an underscore, so it never collides with a field.
export const ITEM_PAGE = '@page';
// A binding: the field it shows (a field's key, or a path through reference fields, "author.name": the name of the item
// the author field names), the part of the element it fills, and how the value is written there; or, its target SHOW,
// the field whose value says whether the element shows.
export interface Bound {
  readonly field: string;
  readonly to: BindTarget | typeof SHOW;
  readonly format?: BindFormat;
  readonly currency?: string;
  readonly when?: ShowWhen;
  readonly value?: string;
}
// the separator of a path through reference fields (a field key never holds it)
export const PATH_SEPARATOR = '.';

// The mark of the element whose children repeat the items of a collection.
export interface DataList {
  readonly collection: string;
  // the component whose instances, among the element's children, are the list's items; absent on a nested list (via)
  readonly component?: string;
  readonly query: Query;
  // a nested list (spec content-data, "nested lists"): the multireference field of the item the list stands in whose
  // items it shows; every child of the element is one of its repeated items, the first the one the others copy
  readonly via?: string;
}

// The mark of the root of a page made for an item. A page made as a template (template: true) stands for every item of
// its collection: the export writes one page per item (collection folder / item slug), and the editor shows the item
// chosen (`item`, absent while the collection holds none). A page without the flag is a copy made for one item.
export interface DataItem {
  readonly collection: string;
  readonly item?: string;
  readonly template?: true;
  // a template: the field whose words name each item's page and its file while the collection has no slug field
  readonly field?: string;
}

// The derived flag of an element a show binding hides for its item, or of a repeated item past a list's first page on
// the site: written by the materialization only, never by a person (DocNode.dataHidden).
export type DataHidden = true;

// The mark of a component definition shown as one region on many pages: whether pages made later receive it, and
// where a page receives it (the first child of its root, a header; or the last, a footer).
export interface SharedRegion {
  readonly newPages: boolean;
  readonly at: 'start' | 'end';
}
