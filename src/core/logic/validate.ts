// The application layer's part of the document model (core/document/validate.ts calls it on every commit and on every
// load, spec app-logic): the project's variables, scripts, code components and libraries, and every element's logic.
// What is checked is the shape and the names; the code itself is the person's, and the preview says when it fails.
import type { DocNode, DocumentJson } from '../document/model.ts';
import { walk } from '../document/model.ts';
import {
  ASSIGNABLE,
  EVENT_NAME,
  IDENTIFIER,
  LIBRARY_NAME,
  LOGIC_FIELDS,
  MOST_CODE,
  READ_ACCESS,
  RESERVED_NAMES,
  TABLE_NAME,
  VARIABLE_TYPES,
  WRITE_ACCESS,
  initialFits,
  readBinding,
  type VariableType,
} from './model.ts';

export interface AppProblem {
  readonly path: string;
  readonly message: string;
}

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> => value !== null && typeof value === 'object' && !Array.isArray(value);
const codeText = (value: unknown): boolean => typeof value === 'string' && value.length <= MOST_CODE;
const expression = (value: unknown): boolean => codeText(value) && (value as string).trim() !== '';
// a library's address: a module on the web (https), or a file of the project by its path
const LIBRARY_URL = /^(?:https:\/\/[^\s"'<>]+|[\w.-]+(?:\/[\w.-]+)*\.m?js)$/u;

// Why a name of the project's application layer is not one, or null.
export function nameRefusal(name: unknown): string | null {
  if (typeof name !== 'string' || !IDENTIFIER.test(name)) return 'a name is a JavaScript identifier: letters, digits, _ and $, not starting with a digit';
  if (RESERVED_NAMES.includes(name)) return `${name} is a word every expression already has`;
  return null;
}

// The words an item name cannot be: the item is declared as a constant inside the site's module
// (js/app-layer/main.js, core/logic/compile.ts), where JavaScript's reserved words, its strict mode's own words
// (arguments, eval, let, static, implements…) and the compiler's own names ($l, the item's locals; $v, a field's value)
// stop the module (the audit's LOGIC-2).
const NOT_AN_ITEM = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for',
  'function', 'if', 'import', 'in', 'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while',
  'with', 'yield', 'let', 'static', 'implements', 'interface', 'package', 'private', 'protected', 'public', 'await', 'arguments', 'eval', '$l', '$v',
]);

// Why an item's name (a repeated element's `as`) is not one, or null.
export function itemNameRefusal(name: unknown): string | null {
  if (name === 'item') return null;
  if (typeof name === 'string' && NOT_AN_ITEM.has(name)) return `${name} is a word of JavaScript or of the site's code, not a name`;
  return nameRefusal(name);
}

function listProblems(value: unknown, at: string, what: string, each: (one: Readonly<Record<string, unknown>>, at: string) => string | null, problems: AppProblem[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length === 0) {
    problems.push({ path: at, message: `the ${what} are a list, absent while there is none` });
    return;
  }
  const names = new Set<string>();
  value.forEach((one: unknown, i) => {
    if (!isObject(one)) return problems.push({ path: `${at}/${i}`, message: `each of the ${what} is an object` });
    const why = nameOf(one, what) ?? each(one, `${at}/${i}`);
    if (why !== null) return problems.push({ path: `${at}/${i}`, message: why });
    const name = one.name as string;
    if (names.has(name)) problems.push({ path: `${at}/${i}/name`, message: `${name} is made twice` });
    names.add(name);
  });
}

const nameOf = (one: Readonly<Record<string, unknown>>, what: string): string | null => {
  if (what === 'libraries') return typeof one.name === 'string' && LIBRARY_NAME.test(one.name) ? null : 'a library is named as an import names it';
  if (what === 'tables') return typeof one.name === 'string' && TABLE_NAME.test(one.name) ? null : 'a table is named in lower-case letters, digits and _, starting with a letter';
  return nameRefusal(one.name);
};

export function appProblems(document: DocumentJson): readonly AppProblem[] {
  const problems: AppProblem[] = [];
  const app: unknown = document.app;
  if (app !== undefined) {
    if (!isObject(app) || Object.keys(app).length === 0) problems.push({ path: '/app', message: 'the application layer is an object with at least one list, absent while there is none' });
    else {
      const extra = Object.keys(app).filter((key) => !['variables', 'scripts', 'components', 'libraries', 'tables'].includes(key));
      if (extra.length > 0) problems.push({ path: '/app', message: `the application layer holds variables, scripts, components, libraries and tables, not ${extra.join(', ')}` });
      listProblems(app.variables, '/app/variables', 'variables', (one) => {
        if (!(VARIABLE_TYPES as readonly unknown[]).includes(one.type)) return `a variable's type is one of ${VARIABLE_TYPES.join(', ')}`;
        if (!initialFits(one.type as VariableType, one.initial)) return `the first value is not a ${String(one.type)}`;
        if ('persist' in one && one.persist !== true) return 'persist is true, or absent';
        if ('kept' in one && (nameRefusal(one.kept) !== null || one.kept === one.name || one.persist !== true)) return 'kept is the stored name of a persisted variable, other than its name, or absent';
        const extraKeys = Object.keys(one).filter((key) => !['name', 'type', 'initial', 'persist', 'kept'].includes(key));
        return extraKeys.length > 0 ? `a variable holds only its name, type, first value, persist and kept, not ${extraKeys.join(', ')}` : null;
      }, problems);
      // two persisted variables kept under one name would write each other's saved values in the visitor's browser
      const stored = new Set<string>();
      (Array.isArray(app.variables) ? app.variables : []).forEach((one: unknown, i) => {
        if (!isObject(one) || one.persist !== true) return;
        const name = typeof one.kept === 'string' ? one.kept : one.name;
        if (typeof name !== 'string') return;
        if (stored.has(name)) problems.push({ path: `/app/variables/${i}`, message: `another persisted variable is already kept under ${name}` });
        stored.add(name);
      });
      const moduleCheck = (one: Readonly<Record<string, unknown>>) => (codeText(one.code) && Object.keys(one).length === 2 ? null : 'a module holds its name and its code');
      listProblems(app.scripts, '/app/scripts', 'scripts', moduleCheck, problems);
      listProblems(app.components, '/app/components', 'components', moduleCheck, problems);
      listProblems(app.libraries, '/app/libraries', 'libraries', (one) => (typeof one.url === 'string' && LIBRARY_URL.test(one.url) && Object.keys(one).length === 2 ? null : 'a library holds its name and the https address or project file of its module'), problems);
      listProblems(app.tables, '/app/tables', 'tables', (one) => {
        if (!(READ_ACCESS as readonly unknown[]).includes(one.read)) return `who reads a table is one of ${READ_ACCESS.join(', ')}`;
        if (!(WRITE_ACCESS as readonly unknown[]).includes(one.write)) return `who adds to a table is one of ${WRITE_ACCESS.join(', ')}`;
        return Object.keys(one).length === 3 ? null : 'a table holds its name, who reads it and who adds to it';
      }, problems);
    }
  }
  const components = new Set((isObject(app) && Array.isArray(app.components) ? app.components : []).map((one: unknown) => (isObject(one) ? one.name : null)));
  document.pages.forEach((page, p) => {
    const at = new Map<string, string>();
    const visit = (node: DocNode, path: string) => {
      at.set(node.id, path);
      node.children.forEach((child, i) => visit(child, `${path}/children/${i}`));
    };
    visit(page.tree, `/pages/${p}/tree`);
    for (const node of walk(page.tree)) if ('logic' in node) problems.push(...logicProblems(node, at.get(node.id) ?? `/pages/${p}`, components));
  });
  (document.components ?? []).forEach((component, c) => {
    for (const node of walk(component.tree)) if ('logic' in node) problems.push(...logicProblems(node, `/components/${c}`, components));
  });
  return problems;
}

// Why an element's logic is not one: each field an expression or a name of its kind, the bindings by kind and key,
// the handlers by event.
export function logicProblems(node: DocNode, at: string, components: ReadonlySet<unknown>): readonly AppProblem[] {
  const problems: AppProblem[] = [];
  const bad = (path: string, message: string) => problems.push({ path: `${at}/logic${path}`, message });
  const logic: unknown = node.logic;
  if (!isObject(logic)) {
    bad('', 'logic is an object of fields');
    return problems;
  }
  // An empty one is no logic: the commands drop it, a document written by hand may keep it.
  if (Object.keys(logic).length === 0) return problems;
  for (const key of Object.keys(logic)) if (![...LOGIC_FIELDS, 'binds', 'on'].includes(key)) bad(`/${key}`, `${key} is no field of an element's logic`);
  for (const field of ['text', 'html', 'show', 'each', 'key'] as const) if (field in logic && !expression(logic[field])) bad(`/${field}`, 'an expression is non-empty code');
  if ('text' in logic && 'html' in logic) bad('/html', 'an element shows a text or an HTML, not both');
  if ('as' in logic) {
    const why = itemNameRefusal(logic.as);
    if (why !== null) bad('/as', `the item is named by an identifier: ${why}`);
  }
  if (('as' in logic || 'key' in logic) && !('each' in logic)) bad('/each', 'an item name and a key belong to a repeated element');
  if ('model' in logic && (typeof logic.model !== 'string' || !ASSIGNABLE.test(logic.model))) bad('/model', 'a field writes to a variable path (state.name, state.form.email) or a field of an item (item.done)');
  if ('component' in logic && !components.has(logic.component)) bad('/component', `${String(logic.component)} is no code component of the project`);
  if ('binds' in logic) {
    const binds: unknown = logic.binds;
    if (!isObject(binds) || Object.keys(binds).length === 0) bad('/binds', 'the bindings are an object of at least one binding, absent while there is none');
    else
      for (const [key, value] of Object.entries(binds)) {
        const read = readBinding(key);
        if (read === null) bad(`/binds/${key}`, 'a binding is attr:, class:, style: or prop: and the name it binds');
        else if (read.kind === 'prop' && !('component' in logic)) bad(`/binds/${key}`, 'a property binds a code component of the element');
        if (!expression(value)) bad(`/binds/${key}`, 'an expression is non-empty code');
      }
  }
  if ('on' in logic) {
    const on: unknown = logic.on;
    if (!Array.isArray(on) || on.length === 0) bad('/on', 'the handlers are a list of at least one, absent while there is none');
    else
      on.forEach((one: unknown, i) => {
        if (!isObject(one) || typeof one.event !== 'string' || !EVENT_NAME.test(one.event) || !codeText(one.code) || Object.keys(one).length !== 2) bad(`/on/${i}`, 'a handler names an event (click, window:keydown, mount, frame, every:1000) and the code it runs');
      });
  }
  return problems;
}
