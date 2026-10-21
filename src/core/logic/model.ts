// The application layer of a project (spec app-logic): what turns a page into an application of any kind — a to-do
// list, a text editor, a spreadsheet, a drawing board, a game — without a feature of its own for each. It is the
// pattern the visual application builders share (WeWeb's variables, formulas and workflows; Retool's and Plasmic's
// code components; Alpine's directives), written into the page as plain data:
//  - the project's STATE: named variables with a type and a first value, optionally kept in the visitor's browser;
//  - the elements' LOGIC: expressions that fill an element's text, show it, repeat it over a list, bind an attribute,
//    a class, a style or a component's property, keep a field and a variable equal, and code that runs on an event;
//  - SCRIPTS: the project's own JavaScript modules, whose exported functions every expression calls as fn.name();
//  - CODE COMPONENTS: modules that draw anything into an element (a grid, a canvas, a chart) and talk to the page
//    through properties and events;
//  - LIBRARIES: any JavaScript module of the web by a name (an import map), so a script or a component imports it.
// The editing canvas never runs any of it; the preview and the exported site do (js/app-layer/main.js,
// core/logic/compile.ts).
import type { JsonValue } from '../../generated/commands.ts';

export const VARIABLE_TYPES = ['text', 'number', 'boolean', 'list', 'object'] as const;
export type VariableType = (typeof VARIABLE_TYPES)[number];

// A variable of the project's state: `state.<name>` in every expression and script.
export interface AppVariable {
  readonly name: string;
  readonly type: VariableType;
  readonly initial: JsonValue;
  // kept in the visitor's browser (localStorage) between visits; absent while it starts over on every visit
  readonly persist?: true;
  // the name the visitor's browser keeps a persisted variable under, set when it is renamed so the values visitors
  // saved before the rename still reach it; absent while it is the variable's own name
  readonly kept?: string;
}

// A script or a code component: a JavaScript module of the project, by its name.
export interface AppModule {
  readonly name: string;
  readonly code: string;
}

// A library: a module of the web the scripts and components import by its name (`import confetti from 'confetti'`).
export interface AppLibrary {
  readonly name: string;
  readonly url: string;
}

// A table of the app's database (app.db, the runtime): its name and who reads and who adds rows. A published site
// keeps its rows on the platform (the site-data function checks these rules); elsewhere they stay in the visitor's
// browser, under the same rules.
//  read: public (anyone), members (signed-in members), owner (each member their own rows), admin (the site's admins)
//  write: public (anyone adds), members (signed-in members add), admin (only admins add); a row is changed or removed
//  by the member who added it or by an admin
export const READ_ACCESS = ['public', 'members', 'owner', 'admin'] as const;
export const WRITE_ACCESS = ['public', 'members', 'admin'] as const;
export type ReadAccess = (typeof READ_ACCESS)[number];
export type WriteAccess = (typeof WRITE_ACCESS)[number];
export interface AppTable {
  readonly name: string;
  readonly read: ReadAccess;
  readonly write: WriteAccess;
}
// a table's name: lower-case letters, digits and _, starting with a letter (the platform's column check)
export const TABLE_NAME = /^[a-z][a-z0-9_]{0,39}$/u;

// DocumentJson.app; each list absent while it is empty, the whole absent while the project has no application layer.
export interface AppLayer {
  readonly variables?: readonly AppVariable[];
  readonly scripts?: readonly AppModule[];
  readonly components?: readonly AppModule[];
  readonly libraries?: readonly AppLibrary[];
  readonly tables?: readonly AppTable[];
}

// One event handler of an element: the event and the code it runs.
export interface AppHandler {
  readonly event: string;
  readonly code: string;
}

// The fields of an element's logic whose value is one expression or one name.
export const LOGIC_FIELDS = ['text', 'html', 'show', 'each', 'as', 'key', 'model', 'component'] as const;
export type LogicField = (typeof LOGIC_FIELDS)[number];

// The kinds of a binding: an HTML attribute, a class switched on and off, a CSS property, a code component's property.
export const BINDING_KINDS = ['attr', 'class', 'style', 'prop'] as const;
export type BindingKind = (typeof BINDING_KINDS)[number];

// DocNode.logic: each field absent while it is not set, the whole absent while the element has no logic.
export interface NodeLogic {
  // the element's text is the expression's value
  readonly text?: string;
  // the element's content is the expression's value read as HTML
  readonly html?: string;
  // the element shows while the expression is true
  readonly show?: string;
  // the element repeats once per item of the list the expression gives; `as` names the item (default "item"), and
  // `index` its place; `key` gives an item's identity so a redraw keeps the elements of the items that stay
  readonly each?: string;
  readonly as?: string;
  readonly key?: string;
  // a field (input, textarea, select, contenteditable) and the variable path are kept equal both ways
  readonly model?: string;
  // the code component drawn into the element
  readonly component?: string;
  // "attr:href", "class:active", "style:color", "prop:rows" → expression
  readonly binds?: { readonly [binding: string]: string };
  readonly on?: readonly AppHandler[];
}

// The names: a JavaScript identifier for a variable, a script, a component and an item.
export const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u;
// A library's name as an import names it (a package name, scoped or not, with an optional path).
export const LIBRARY_NAME = /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(?:\/[\w.-]+)*\/?$/u;
// A name an element or a component's own code would collide with: the words the runtime gives every expression.
export const RESERVED_NAMES: readonly string[] = ['state', 'app', 'fn', 'item', 'index', '$event', '$el'];
// An event: a DOM event of the element (click, input, keydown…), of the window or the document ("window:keydown"),
// or one of the runtime's own: mount (the page is ready), frame (every animation frame: $event.dt, $event.time),
// every:<ms> (a timer).
export const EVENT_NAME = /^(?:(?:window|document):)?[a-z][a-z0-9-]*$|^every:[1-9]\d{1,6}$/u;
// A place a field writes to: a variable path (state.name, state.form.email, state.items[0].done) or a field of a
// repeated item (item.done).
export const ASSIGNABLE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[[^\]\n]+\])+$/u;
// A binding's key by its kind: an attribute's name, a class name, a CSS property, a component's property.
export const BINDING_KEY: Readonly<Record<BindingKind, RegExp>> = {
  attr: /^(?!on)[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?$/u,
  class: /^-?[_a-zA-Z\u00a0-\uffff][\w\u00a0-\uffff-]*$/u,
  style: /^(?:--[\w-]+|[a-z][a-z-]*)$/u,
  prop: /^[A-Za-z_$][\w$]*$/u,
};
// the longest code one handler, expression or module holds (a module is a file of the project, not a library)
export const MOST_CODE = 200_000;

export const NO_LOGIC: NodeLogic = {};
export const logicOf = (node: { readonly logic?: NodeLogic }): NodeLogic => node.logic ?? NO_LOGIC;
export const hasLogic = (node: { readonly logic?: NodeLogic }): boolean => node.logic !== undefined && Object.keys(node.logic).length > 0;

// "attr:href" → ['attr', 'href'], or null when it names no binding
export function readBinding(binding: string): { readonly kind: BindingKind; readonly key: string } | null {
  const at = binding.indexOf(':');
  if (at < 0) return null;
  const kind = binding.slice(0, at) as BindingKind;
  const key = binding.slice(at + 1);
  if (!(BINDING_KINDS as readonly string[]).includes(kind) || !BINDING_KEY[kind].test(key)) return null;
  return { kind, key };
}

// Whether a first value is one of its type's: a text, a finite number, a boolean, a list, an object.
export function initialFits(type: VariableType, value: unknown): boolean {
  switch (type) {
    case 'text':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'list':
      return Array.isArray(value);
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
}

// The first value a new variable of a type takes.
export function emptyOf(type: VariableType): JsonValue {
  switch (type) {
    case 'text':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'list':
      return [];
    case 'object':
      return {};
  }
}
