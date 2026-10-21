// The application layer as the site runs it (spec app-logic): js/app-layer/main.js, the project's modules beside it
// under js/app-layer/, and the import map every page carries, so each module imports the runtime, the scripts, the
// code components and the libraries by name ('@app/runtime', '@app/script/<name>', '@app/component/<name>',
// '<library>').
//  - Every expression and handler is written as a function of its own in js/app-layer/main.js, the element's item
//    names (each repeated ancestor's `as` and index) declared from its locals: nothing is evaluated from text when the
//    page runs, so a site with a strict Content Security Policy runs it.
//  - A piece of code that does not parse is written as a function that throws the parser's message, so one mistake
//    stops only its own binding, and the preview says which (the runtime's error box).
//  - The runtime itself is the composition layer's (SiteScripts.app: the editor's app-runtime/runtime.js).
import type { DocNode, DocumentJson } from '../document/model.ts';
import { walk } from '../document/model.ts';
import { APP_MAIN_SCRIPT, APP_MODULES_FOLDER, APP_RUNTIME_SCRIPT } from '../export/paths.ts';
import { hasLogic, readBinding, type AppModule, type NodeLogic } from './model.ts';


const APP_FOLDER = APP_MODULES_FOLDER;
const APP_RUNTIME = APP_RUNTIME_SCRIPT;
export const RUNTIME_SPECIFIER = '@app/runtime';
const scriptPath = (name: string) => `${APP_FOLDER}/scripts/${name}.js`;
const componentPath = (name: string) => `${APP_FOLDER}/components/${name}.js`;

// What a piece of code is: an expression (its value), a handler's statements (awaited), or a module (import/export).
export type CodeKind = 'expression' | 'statements' | 'module';
// The parser the composition layer lends: the parser's message for code that does not parse, else null. Without one,
// the code is written as it is.
export type SyntaxCheck = (kind: CodeKind, code: string) => string | null;

// Whether the site runs the application layer: a variable, a script, a component or an element's logic anywhere.
export function siteUsesApp(document: DocumentJson): boolean {
  const app = document.app;
  if (app !== undefined && ((app.variables?.length ?? 0) > 0 || (app.scripts?.length ?? 0) > 0 || (app.components?.length ?? 0) > 0)) return true;
  return document.pages.some((page) => [...walk(page.tree)].some(hasLogic));
}

const json = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

interface Compiled {
  readonly main: string;
  readonly modules: readonly { readonly path: string; readonly code: string }[];
}

// The modules as the site holds them: the person's code, with the runtime's three names imported when it does not
// import them itself.
function moduleCode(module: AppModule): string {
  return /from\s+['"]@app\/runtime['"]/u.test(module.code) ? module.code : `import { state, app, fn } from '${RUNTIME_SPECIFIER}';\n${module.code}`;
}

// The files the application is written as while the project has one (main, runtime, then each module), in that order.
export function appPaths(document: DocumentJson): readonly string[] {
  if (!siteUsesApp(document)) return [];
  const app = document.app ?? {};
  return [APP_MAIN_SCRIPT, APP_RUNTIME, ...(app.scripts ?? []).map((one) => scriptPath(one.name)), ...(app.components ?? []).map((one) => componentPath(one.name))];
}

export function compileApp(document: DocumentJson, check?: SyntaxCheck): Compiled {
  const app = document.app ?? {};
  const failing = (where: string, why: string) => `function () { throw new SyntaxError(${json(`${where}: ${why}`)}); }`;
  const fnOf = (kind: 'expression' | 'statements' | 'setter', code: string, locals: readonly string[], where: string): string => {
    const head = locals.length === 0 ? '' : `const ${locals.map((name) => `${name} = $l.${name}`).join(', ')};\n`;
    if (kind === 'expression') {
      const why = check?.('expression', code) ?? null;
      return why !== null ? failing(where, why) : `function (state, app, fn, $l) {\n${head}return (\n${code}\n);\n}`;
    }
    if (kind === 'setter') return `function (state, $l, $v) {\n${head}${code} = $v;\n}`;
    const why = check?.('statements', code) ?? null;
    return why !== null ? failing(where, why) : `async function ($event, $el, state, app, fn, $l) {\n${head}${code}\n}`;
  };
  const nodes: string[] = [];
  const visit = (node: DocNode, locals: readonly string[]) => {
    const logic: NodeLogic | undefined = hasLogic(node) ? node.logic : undefined;
    let inner = locals;
    if (logic !== undefined) {
      const where = node.name;
      const own = logic.each !== undefined ? [...new Set([...locals.filter((name) => name !== (logic.as ?? 'item') && name !== 'index'), logic.as ?? 'item', 'index'])] : locals;
      const parts: string[] = [`name: ${json(node.name)}`];
      if (logic.each !== undefined) {
        parts.push(`each: ${fnOf('expression', logic.each, locals, `${where} (repetir)`)}`, `as: ${json(logic.as ?? 'item')}`);
        if (logic.key !== undefined) parts.push(`key: ${fnOf('expression', logic.key, own, `${where} (chave)`)}`);
      }
      if (logic.text !== undefined) parts.push(`text: ${fnOf('expression', logic.text, own, `${where} (texto)`)}`);
      if (logic.html !== undefined) parts.push(`html: ${fnOf('expression', logic.html, own, `${where} (HTML)`)}`);
      if (logic.show !== undefined) parts.push(`show: ${fnOf('expression', logic.show, own, `${where} (mostrar)`)}`);
      if (logic.model !== undefined) parts.push(`model: [${fnOf('expression', logic.model, own, `${where} (campo)`)}, ${fnOf('setter', logic.model, own, `${where} (campo)`)}]`);
      if (logic.component !== undefined) parts.push(`component: ${json(logic.component)}`);
      const lists: Record<'attr' | 'class' | 'style' | 'prop', string[]> = { attr: [], class: [], style: [], prop: [] };
      for (const [binding, code] of Object.entries(logic.binds ?? {})) {
        const read = readBinding(binding);
        if (read === null) continue;
        lists[read.kind].push(read.kind === 'prop' ? `${json(read.key)}: ${fnOf('expression', code, own, `${where} (${binding})`)}` : `[${json(read.key)}, ${fnOf('expression', code, own, `${where} (${binding})`)}]`);
      }
      if (lists.attr.length > 0) parts.push(`attrs: [${lists.attr.join(', ')}]`);
      if (lists.class.length > 0) parts.push(`classes: [${lists.class.join(', ')}]`);
      if (lists.style.length > 0) parts.push(`styles: [${lists.style.join(', ')}]`);
      if (lists.prop.length > 0) parts.push(`props: {${lists.prop.join(', ')}}`);
      if (logic.on !== undefined) parts.push(`on: [${logic.on.map((one) => `[${json(one.event)}, ${fnOf('statements', one.code, own, `${where} (${one.event})`)}]`).join(', ')}]`);
      nodes.push(`${json(node.id)}: {\n${parts.join(',\n')}\n}`);
      inner = own;
    }
    for (const child of node.children) visit(child, inner);
  };
  for (const page of document.pages) visit(page.tree, []);
  const data = Object.fromEntries((document.collections ?? []).map((collection) => [collection.name, collection.items.map((item) => ({ id: item.id, ...item.values }))]));
  const main = [
    `// The application of this site (written by the builder from the project's application layer).`,
    `import { start } from '${RUNTIME_SPECIFIER}';`,
    'start({',
    `variables: ${json(app.variables ?? [])},`,
    `data: ${json(data)},`,
    `tables: ${json(app.tables ?? [])},`,
    `scripts: {${(app.scripts ?? []).map((one) => `${json(one.name)}: () => import('@app/script/${one.name}')`).join(', ')}},`,
    `components: {${(app.components ?? []).map((one) => `${json(one.name)}: () => import('@app/component/${one.name}')`).join(', ')}},`,
    `nodes: {\n${nodes.join(',\n')}\n}`,
    '});',
    '',
  ].join('\n');
  const modules = [...(app.scripts ?? []).map((one) => ({ path: scriptPath(one.name), code: moduleCode(one) })), ...(app.components ?? []).map((one) => ({ path: componentPath(one.name), code: moduleCode(one) }))];
  return { main, modules };
}

// The import map of a page: every module of the application by its name, at the address `at` gives it (the export: a
// path relative to the page; the preview: the module's own text as a data: address). A library at a project file is
// given by `at` too; one on the web keeps its address.
export function importMap(document: DocumentJson, at: (path: string, code: string | null) => string, runtime = '', compiled: Compiled = { main: '', modules: [] }): string {
  const app = document.app ?? {};
  const imports: Record<string, string> = { [RUNTIME_SPECIFIER]: at(APP_RUNTIME, runtime) };
  for (const one of app.scripts ?? []) imports[`@app/script/${one.name}`] = at(scriptPath(one.name), compiled.modules.find((m) => m.path === scriptPath(one.name))?.code ?? '');
  for (const one of app.components ?? []) imports[`@app/component/${one.name}`] = at(componentPath(one.name), compiled.modules.find((m) => m.path === componentPath(one.name))?.code ?? '');
  for (const one of app.libraries ?? []) imports[one.name] = one.url.startsWith('https://') ? one.url : at(one.url, null);
  return json({ imports });
}

// The specifier map's own rule: a relative address starts with ./ or ../ (MDN, <script type="importmap">)
export const mapAddress = (relative: string): string => (relative.startsWith('.') || relative.startsWith('/') ? relative : `./${relative}`);
