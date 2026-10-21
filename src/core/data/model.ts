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

// The kinds of value a field holds (spec content-data, "schema").
export const FIELD_TYPES = ['text', 'richtext', 'image', 'number', 'date', 'link', 'boolean'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

// A column of a collection: a key that never changes (what bindings and item values use), the label a person reads and
// renames, and the kind of value it holds.
export interface Field {
  readonly key: string;
  readonly label: string;
  readonly type: FieldType;
  // a number field: the decimal places its values are shown with (a price "6,50" keeps two), read from the file it
  // came from; absent: as many as the value has
  readonly decimals?: number;
}

// One value of an item, in its canonical form: a text, a number, a boolean, a calendar date (YYYY-MM-DD), an address
// (link and image) or the runs of a rich text. An empty value is absent from the item.
export type Cell = string | number | boolean | readonly InlineRun[];

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
}

// What a bound element shows of its item: its text, an image's source or its alternative text, or a link's address.
export const BIND_TARGETS = ['text', 'image', 'alt', 'link'] as const;
export type BindTarget = (typeof BIND_TARGETS)[number];
// The key a link binds to for the address of the item's own page (spec content-data, "one page per item"). A field key
// starts with a letter or an underscore, so it never collides with a field.
export const ITEM_PAGE = '@page';
export interface Bound {
  readonly field: string;
  readonly to: BindTarget;
}

// The mark of the element whose children repeat the items of a collection.
export interface DataList {
  readonly collection: string;
  // the component whose instances, among the element's children, are the list's items
  readonly component: string;
  readonly query: Query;
}

// The mark of the root of a page made for an item.
export interface DataItem {
  readonly collection: string;
  readonly item: string;
}

// The mark of a component definition shown as one region on many pages: whether pages made later receive it, and
// where a page receives it (the first child of its root, a header; or the last, a footer).
export interface SharedRegion {
  readonly newPages: boolean;
  readonly at: 'start' | 'end';
}
