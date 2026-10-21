// The commands of the application layer (spec app-logic): the project's variables, scripts, code components and
// libraries (app.*), and the logic of the selected element (logic.*). Each computes the document it leads to and is
// refused with the validator's own reason when that document breaks the model (core/logic/validate.ts); a variable,
// a component, a script or a table that is renamed is renamed in every expression, handler and module that names it,
// and one that code still names is not removed (core/logic/references.ts). The element a logic.* command writes is the
// one its `target` names (the element a field's typing began on: rules G1 and G2), else the selected one.
import type { NodeId } from '../../generated/commands.ts';
import type { MessageId } from '../../generated/ids.ts';
import { message, registerHandler, type HandlerContext, type Message, type Outcome } from '../commands/registry.ts';
import { locate, type DocNode, type DocumentJson } from '../document/model.ts';
import { documentPatches } from '../data/patches.ts';
import { firstLockRefusal } from '../nodes/flags.ts';
import {
  LOGIC_FIELDS,
  READ_ACCESS,
  RESERVED_NAMES,
  VARIABLE_TYPES,
  WRITE_ACCESS,
  emptyOf,
  initialFits,
  readBinding,
  type AppHandler,
  type AppLayer,
  type AppLibrary,
  type AppModule,
  type AppTable,
  type AppVariable,
  type LogicField,
  type NodeLogic,
  type VariableType,
} from './model.ts';
import { exportedNames, renameComponent, renameScript, renameTable, renameVariable, usesScript, usesVariable } from './references.ts';
import { appProblems, nameRefusal } from './validate.ts';

const refused = (key: MessageId, params: Readonly<Record<string, string>> = {}): Outcome<never> => ({ kind: 'refused', message: message(key, params) });

// The document a command leads to, as patches; refused with the first problem the application layer's validator
// finds in it that the document before did not have.
function change<Ui>(context: HandlerContext<Ui>, after: DocumentJson, said: Message): Outcome<Ui> {
  const before = context.state.document;
  const known = new Set(appProblems(before).map((one) => `${one.path} ${one.message}`));
  const problem = appProblems(after).find((one) => !known.has(`${one.path} ${one.message}`));
  if (problem !== undefined) return { kind: 'refused', message: message('status.app.invalid', { reason: problem.message }) };
  const patches = documentPatches(before, after);
  return patches.length === 0 ? { kind: 'change' } : { kind: 'change', patches, message: said };
}

// The application layer with one list replaced, in its place: an empty list goes, and an empty layer goes.
function withList<K extends keyof AppLayer>(document: DocumentJson, key: K, list: NonNullable<AppLayer[K]>): DocumentJson {
  const app = Object.fromEntries(Object.entries(document.app ?? {}).filter(([name]) => name !== key || list.length > 0).map(([name, held]) => [name, name === key ? list : held]));
  if (list.length > 0 && !(key in app)) app[key] = list;
  const { app: _old, ...without } = document;
  void _old;
  return Object.keys(app).length === 0 ? without : { ...without, app: app as AppLayer };
}

// Every node of the document (pages and components) rewritten by `rewrite`; a node it leaves alone stays the same.
function mapNodes(document: DocumentJson, rewrite: (node: DocNode) => DocNode): DocumentJson {
  const visit = (node: DocNode): DocNode => {
    const own = rewrite(node);
    const children = own.children.map(visit);
    return children.every((child, i) => child === own.children[i]) ? own : { ...own, children };
  };
  return {
    ...document,
    pages: document.pages.map((page) => {
      const tree = visit(page.tree);
      return tree === page.tree ? page : { ...page, tree };
    }),
    ...(document.components === undefined ? {} : { components: document.components.map((one) => ({ ...one, tree: visit(one.tree) })) }),
  };
}

// Every piece of code of the document (the elements' expressions and handlers, the modules) rewritten by `rewrite`.
function mapCode(document: DocumentJson, rewrite: (code: string) => string): DocumentJson {
  const logicOf = (logic: NodeLogic): NodeLogic => {
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(logic)) {
      if (key === 'binds') next.binds = Object.fromEntries(Object.entries(value as Record<string, string>).map(([k, v]) => [k, rewrite(v)]));
      else if (key === 'on') next.on = (value as readonly AppHandler[]).map((one) => ({ event: one.event, code: rewrite(one.code) }));
      else if (key === 'as' || key === 'component') next[key] = value;
      else next[key] = rewrite(value as string);
    }
    return next as NodeLogic;
  };
  const nodes = mapNodes(document, (node) => (node.logic === undefined ? node : { ...node, logic: logicOf(node.logic) }));
  const app = nodes.app;
  if (app === undefined) return nodes;
  const modules = (list: readonly AppModule[]): readonly AppModule[] => list.map((one) => ({ name: one.name, code: rewrite(one.code) }));
  return { ...nodes, app: { ...app, ...(app.scripts === undefined ? {} : { scripts: modules(app.scripts) }), ...(app.components === undefined ? {} : { components: modules(app.components) }) } };
}

// The pieces of code an element's logic holds: its expressions, its bindings' and its events' code (`as` and
// `component` are names, not code).
function codeOf(logic: NodeLogic): readonly string[] {
  return Object.entries(logic).flatMap(([key, value]): string[] => {
    if (key === 'binds') return Object.values(value as Record<string, string>);
    if (key === 'on') return (value as readonly AppHandler[]).map((one) => one.code);
    return key === 'as' || key === 'component' ? [] : [value as string];
  });
}

// The first element (by its name) or module (by its name, the module `self` aside) whose code `uses` reads true for:
// where a removal would leave code naming what is gone. Null when nothing does.
function firstUse(document: DocumentJson, uses: (code: string) => boolean, self?: AppModule): string | null {
  const trees = [...document.pages.map((page) => page.tree), ...(document.components ?? []).map((one) => one.tree)];
  const visit = (node: DocNode): string | null => {
    if (node.logic !== undefined && codeOf(node.logic).some(uses)) return node.name;
    for (const child of node.children) {
      const found = visit(child);
      if (found !== null) return found;
    }
    return null;
  };
  for (const tree of trees) {
    const found = visit(tree);
    if (found !== null) return found;
  }
  const modules = [...(document.app?.scripts ?? []), ...(document.app?.components ?? [])];
  return modules.find((one) => one !== self && uses(one.code))?.name ?? null;
}

// Why a name is refused, in the person's words: a word every expression already has, or no identifier.
function nameProblem(name: string): Outcome<never> | null {
  if (nameRefusal(name) === null) return null;
  return RESERVED_NAMES.includes(name) ? refused('status.app.reserved', { name }) : refused('status.app.badName', { name });
}

// A name no record of a list has: the base, else the base and the first free number from 2.
function freeName(list: readonly { readonly name: string }[], base: string): string {
  const taken = new Set(list.map((one) => one.name));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}${n}`)) n += 1;
  return `${base}${n}`;
}

// ---------------------------------------------------------------- app.*: the project's variables

export const setVariableCommand = registerHandler('app.setVariable', (context, { name, type, initial, persist, previous }): Outcome<never> => {
  const document = context.state.document;
  const variables = document.app?.variables ?? [];
  const typed = typeof name === 'string' ? name.trim() : freeName(variables, context.words('app.defaultVariable'));
  const why = nameProblem(typed);
  if (why !== null) return why;
  const held = typeof previous === 'string' ? variables.find((one) => one.name === previous) : variables.find((one) => one.name === typed);
  if (variables.some((one) => one.name === typed && one !== held)) return refused('status.app.taken', { name: typed });
  const kind: VariableType = typeof type === 'string' && (VARIABLE_TYPES as readonly string[]).includes(type) ? (type as VariableType) : (held?.type ?? 'text');
  let first = initial === undefined ? (held !== undefined && initialFits(kind, held.initial) ? held.initial : emptyOf(kind)) : initial;
  // a first value typed as text for a number, a list or an object is read as JSON
  if (typeof first === 'string' && kind !== 'text') {
    try {
      first = JSON.parse(first);
    } catch {
      return refused('status.app.badValue', { name: typed, type: kind });
    }
  }
  if (!initialFits(kind, first)) return refused('status.app.badValue', { name: typed, type: kind });
  const keep = typeof persist === 'boolean' ? persist : held?.persist === true;
  // a persisted variable keeps the name its visitors' values were saved under across renames (the audit's LOGIC-12);
  // renamed back to that name, it needs none
  const storedAs = keep && held !== undefined ? (held.kept ?? held.name) : undefined;
  const variable: AppVariable = { name: typed, type: kind, initial: first, ...(keep ? { persist: true as const } : {}), ...(storedAs !== undefined && storedAs !== typed ? { kept: storedAs } : {}) };
  // two persisted variables kept under one name would overwrite each other's saved values in the visitor's browser
  const stored = variable.kept ?? variable.name;
  const sharer = keep ? variables.find((one) => one !== held && one.persist === true && (one.kept ?? one.name) === stored) : undefined;
  if (sharer !== undefined) return refused('status.app.keptTaken', { name: typed, stored, other: sharer.name });
  const list = held === undefined ? [...variables, variable] : variables.map((one) => (one === held ? variable : one));
  let after = withList(document, 'variables', list);
  if (held !== undefined && held.name !== typed) after = mapCode(after, renameVariable(held.name, typed));
  return change(context, after, message(held === undefined ? 'status.app.variableAdded' : 'status.app.variableChanged', { name: typed }));
}, (state, args) => {
  // the Keep door is pressed while the variable it stands for (previous, else name) is kept in the browser
  const named = typeof args.previous === 'string' ? args.previous : args.name;
  return state.document.app?.variables?.some((one) => one.name === named && one.persist === true) ?? false;
});

export const removeVariableCommand = registerHandler('app.removeVariable', (context, { name }): Outcome<never> => {
  const document = context.state.document;
  const variables = document.app?.variables ?? [];
  if (!variables.some((one) => one.name === name)) return { kind: 'change' };
  // a variable code still reads stays until that code reads it no more (the code would read nothing)
  const where = firstUse(document, usesVariable(name));
  if (where !== null) return refused('status.app.inUse', { name, where });
  return change(context, withList(document, 'variables', variables.filter((one) => one.name !== name)), message('status.app.variableRemoved', { name }));
});

// ---------------------------------------------------------------- app.*: scripts and code components

const listKey = (kind: string): 'scripts' | 'components' => (kind === 'component' ? 'components' : 'scripts');

// The first code of a new module, its comments in the person's language: a script exports a function; a component
// draws into its element.
const starter = (key: 'scripts' | 'components', words: (key: MessageId) => string): string =>
  key === 'scripts'
    ? [`// ${words('app.starter.script')}`, 'export function greet(name) {', "  return 'Hello, ' + name + '!'", '}', ''].join('\n')
    : [
        `// ${words('app.starter.component')}`,
        'export default {',
        '  mount(el, props, ctx) {',
        "    const box = document.createElement('div');",
        "    box.textContent = props.text ?? 'Component';",
        '    el.replaceChildren(box);',
        '    return {',
        "      update(next) { box.textContent = next.text ?? 'Component'; },",
        '      destroy() {},',
        '    };',
        '  },',
        '};',
        '',
      ].join('\n');

export const setModuleCommand = registerHandler('app.setModule', (context, { kind, name, code, previous }): Outcome<never> => {
  const document = context.state.document;
  const key = listKey(kind);
  const list: readonly AppModule[] = document.app?.[key] ?? [];
  const typed = typeof name === 'string' ? name.trim() : freeName(list, context.words(key === 'components' ? 'app.defaultComponent' : 'app.defaultScript'));
  const why = nameProblem(typed);
  if (why !== null) return why;
  const held = list.find((one) => one.name === (typeof previous === 'string' ? previous : typed));
  if (list.some((one) => one.name === typed && one !== held)) return refused('status.app.taken', { name: typed });
  const next: AppModule = { name: typed, code: typeof code === 'string' ? code : (held?.code ?? starter(key, (id) => context.words(id))) };
  let after = withList(document, key, held === undefined ? [...list, next] : list.map((one) => (one === held ? next : one)));
  if (held !== undefined && held.name !== typed) {
    if (key === 'components') {
      after = mapNodes(after, (node) => (node.logic?.component === held.name ? { ...node, logic: { ...node.logic, component: typed } } : node));
      after = mapCode(after, renameComponent(held.name, typed));
    } else after = mapCode(after, renameScript(held.name, typed));
  }
  const said = held === undefined ? 'status.app.moduleAdded' : 'status.app.moduleChanged';
  return change(context, after, message(said, { name: typed }));
});

export const removeModuleCommand = registerHandler('app.removeModule', (context, { kind, name }): Outcome<never> => {
  const document = context.state.document;
  const key = listKey(kind);
  const list: readonly AppModule[] = document.app?.[key] ?? [];
  const gone = list.find((one) => one.name === name);
  if (gone === undefined) return { kind: 'change' };
  // a script code still calls stays until that code calls it no more: its module, its specifier, or a function only it
  // exports (another script that exports the same name still answers fn.<name>)
  if (key === 'scripts') {
    const others = new Set(list.filter((one) => one !== gone).flatMap((one) => exportedNames(one.code)));
    const where = firstUse(document, usesScript(name, exportedNames(gone.code).filter((one) => !others.has(one))), gone);
    if (where !== null) return refused('status.app.inUse', { name, where });
  }
  // a component an element draws stays until that element draws no more (the element's logic would name nothing)
  if (key === 'components') {
    const user = [...document.pages.flatMap((page) => [page.tree]), ...(document.components ?? []).map((one) => one.tree)].flatMap((tree) => {
      const found: DocNode[] = [];
      const visit = (node: DocNode) => {
        if (node.logic?.component === name) found.push(node);
        node.children.forEach(visit);
      };
      visit(tree);
      return found;
    })[0];
    if (user !== undefined) return refused('status.app.componentInUse', { name, element: user.name });
  }
  return change(context, withList(document, key, list.filter((one) => one.name !== name)), message('status.app.moduleRemoved', { name }));
});

// ---------------------------------------------------------------- app.*: libraries

export const setLibraryCommand = registerHandler('app.setLibrary', (context, { name, url, previous }): Outcome<never> => {
  const document = context.state.document;
  const list: readonly AppLibrary[] = document.app?.libraries ?? [];
  const typed = typeof name === 'string' ? name.trim() : '';
  const address = typeof url === 'string' ? url.trim() : '';
  const held = list.find((one) => one.name === (typeof previous === 'string' ? previous : typed));
  if (list.some((one) => one.name === typed && one !== held)) return refused('status.app.taken', { name: typed });
  const next: AppLibrary = { name: typed, url: address };
  return change(context, withList(document, 'libraries', held === undefined ? [...list, next] : list.map((one) => (one === held ? next : one))), message('status.app.libraryChanged', { name: typed }));
});

export const removeLibraryCommand = registerHandler('app.removeLibrary', (context, { name }): Outcome<never> => {
  const document = context.state.document;
  const list = document.app?.libraries ?? [];
  if (!list.some((one) => one.name === name)) return { kind: 'change' };
  return change(context, withList(document, 'libraries', list.filter((one) => one.name !== name)), message('status.app.libraryRemoved', { name }));
});

// ---------------------------------------------------------------- app.*: the database's tables

// A table added (no name: the first free "table", "table2"…, read by anyone, added to by members), renamed, or given
// who reads it and who adds to it. A rename changes the table the site's code names (every app.db call that names it
// is rewritten); the rows already kept stay under the old name.
export const setTableCommand = registerHandler('app.setTable', (context, { name, read, write, previous }): Outcome<never> => {
  const document = context.state.document;
  const list: readonly AppTable[] = document.app?.tables ?? [];
  const held = typeof previous === 'string' ? list.find((one) => one.name === previous) : undefined;
  if (typeof previous === 'string' && held === undefined) return { kind: 'change' };
  const typed = typeof name === 'string' ? name.trim() : (held?.name ?? freeName(list, context.words('app.defaultTable')));
  if (list.some((one) => one.name === typed && one !== held)) return refused('status.app.taken', { name: typed });
  const next: AppTable = {
    name: typed,
    read: (READ_ACCESS as readonly unknown[]).includes(read) ? (read as AppTable['read']) : (held?.read ?? 'public'),
    write: (WRITE_ACCESS as readonly unknown[]).includes(write) ? (write as AppTable['write']) : (held?.write ?? 'members'),
  };
  const said = message(held === undefined ? 'status.app.tableAdded' : 'status.app.tableChanged', { name: typed });
  const after = withList(document, 'tables', held === undefined ? [...list, next] : list.map((one) => (one === held ? next : one)));
  return change(context, held !== undefined && held.name !== typed ? mapCode(after, renameTable(held.name, typed)) : after, said);
});

export const removeTableCommand = registerHandler('app.removeTable', (context, { name }): Outcome<never> => {
  const document = context.state.document;
  const list = document.app?.tables ?? [];
  if (!list.some((one) => one.name === name)) return { kind: 'change' };
  return change(context, withList(document, 'tables', list.filter((one) => one.name !== name)), message('status.app.tableRemoved', { name }));
});

// ---------------------------------------------------------------- logic.*: the selected element's logic

// The element the command writes (the one `target` names: the element a field's typing began on; else the selected
// one) and where it stands; refused while there is none or it is locked.
function selected<Ui>(context: HandlerContext<Ui>, target?: unknown): { readonly node: DocNode; readonly path: readonly (string | number)[] } | Outcome<never> {
  const primary = typeof target === 'string' ? (target as NodeId) : context.state.selection[0];
  const found = primary === undefined ? null : locate(context.state.document, primary);
  if (found === null) return refused('status.app.noElement');
  const locked = firstLockRefusal(context.state.document, [found.node.id as NodeId], 'status.locked.edit');
  if (locked !== null) return { kind: 'refused', message: locked };
  return { node: found.node, path: found.path };
}

// The document with the selected element's logic replaced (an empty logic goes).
function withLogic(document: DocumentJson, nodeId: string, logic: NodeLogic): DocumentJson {
  const empty = Object.keys(logic).length === 0;
  return mapNodes(document, (node) => {
    if (node.id !== nodeId) return node;
    const { logic: _old, ...rest } = node;
    void _old;
    return empty ? (rest as DocNode) : { ...rest, logic };
  });
}

const without = (logic: NodeLogic, ...keys: readonly string[]): NodeLogic => Object.fromEntries(Object.entries(logic).filter(([key]) => !keys.includes(key))) as NodeLogic;

export const setLogicCommand = registerHandler('logic.set', (context, { field, value, target }): Outcome<never> => {
  const found = selected(context, target);
  if ('kind' in found) return found;
  const logic = found.node.logic ?? {};
  if (!(LOGIC_FIELDS as readonly string[]).includes(field)) return { kind: 'change' };
  const text = typeof value === 'string' ? value.trim() : '';
  const key = field as LogicField;
  // a repeated element that stops repeating loses its item's name and key; showing a text replaces showing an HTML
  let next = text === '' ? without(logic, key, ...(key === 'each' ? ['as', 'key'] : [])) : { ...without(logic, key === 'text' ? 'html' : key === 'html' ? 'text' : ''), [key]: text };
  // an element that stops drawing a component loses the component's properties
  if (key === 'component' && text === '' && next.binds !== undefined) {
    const binds = Object.fromEntries(Object.entries(next.binds).filter(([one]) => !one.startsWith('prop:')));
    next = Object.keys(binds).length === 0 ? without(next, 'binds') : { ...next, binds };
  }
  return change(context, withLogic(context.state.document, found.node.id, next), message(text === '' ? 'status.app.logicCleared' : 'status.app.logicSet', { element: found.node.name }));
});

export const setBindingCommand = registerHandler('logic.setBinding', (context, { binding, value, previous, target }): Outcome<never> => {
  const found = selected(context, target);
  if ('kind' in found) return found;
  const name = typeof binding === 'string' ? binding.trim() : '';
  if (readBinding(name) === null) return refused('status.app.badBinding', { binding: name });
  const logic = found.node.logic ?? {};
  const text = typeof value === 'string' ? value.trim() : '';
  // a binding renamed to the name another binding of the element has would take that one's place: refused, as a
  // variable's or a script's rename to a name taken is
  if (typeof previous === 'string' && previous !== name && Object.hasOwn(logic.binds ?? {}, name)) return refused('status.app.taken', { name });
  const gone = (key: string) => key === name || (typeof previous === 'string' && key === previous);
  // the binding keeps its place when renamed or changed; a new one goes last
  const kept = Object.entries(logic.binds ?? {}).flatMap(([key, code]): [string, string][] => (key === (typeof previous === 'string' ? previous : name) ? (text === '' ? [] : [[name, text]]) : gone(key) ? [] : [[key, code]]));
  const binds = Object.fromEntries(kept.some(([key]) => key === name) || text === '' ? kept : [...kept, [name, text]]);
  const next = Object.keys(binds).length === 0 ? without(logic, 'binds') : { ...logic, binds };
  return change(context, withLogic(context.state.document, found.node.id, next), message('status.app.logicSet', { element: found.node.name }));
});

export const addHandlerCommand = registerHandler('logic.addHandler', (context, { event, code }): Outcome<never> => {
  const found = selected(context);
  if ('kind' in found) return found;
  const logic = found.node.logic ?? {};
  const handler: AppHandler = { event: typeof event === 'string' && event.trim() !== '' ? event.trim() : 'click', code: typeof code === 'string' ? code : '' };
  return change(context, withLogic(context.state.document, found.node.id, { ...logic, on: [...(logic.on ?? []), handler] }), message('status.app.handlerAdded', { event: handler.event, element: found.node.name }));
});

export const updateHandlerCommand = registerHandler('logic.updateHandler', (context, { handler, event, code, target }): Outcome<never> => {
  const found = selected(context, target);
  if ('kind' in found) return found;
  const logic = found.node.logic ?? {};
  const held = logic.on?.[handler];
  if (held === undefined) return { kind: 'change' };
  const next: AppHandler = { event: typeof event === 'string' && event.trim() !== '' ? event.trim() : held.event, code: typeof code === 'string' ? code : held.code };
  const on = (logic.on ?? []).map((one, i) => (i === handler ? next : one));
  return change(context, withLogic(context.state.document, found.node.id, { ...logic, on }), message('status.app.logicSet', { element: found.node.name }));
});

export const removeHandlerCommand = registerHandler('logic.removeHandler', (context, { handler, target }): Outcome<never> => {
  const found = selected(context, target);
  if ('kind' in found) return found;
  const logic = found.node.logic ?? {};
  if (logic.on?.[handler] === undefined) return { kind: 'change' };
  const on = logic.on.filter((_one, i) => i !== handler);
  return change(context, withLogic(context.state.document, found.node.id, on.length === 0 ? without(logic, 'on') : { ...logic, on }), message('status.app.handlerRemoved', { element: found.node.name }));
});

export const clearLogicCommand = registerHandler('logic.clear', (context): Outcome<never> => {
  const found = selected(context);
  if ('kind' in found) return found;
  if (found.node.logic === undefined) return { kind: 'change' };
  return change(context, withLogic(context.state.document, found.node.id, {}), message('status.app.logicCleared', { element: found.node.name }));
});
