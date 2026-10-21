// The application layer as the site runs it (spec app-logic): js/app-layer/main.js, the project's modules beside it
// under js/app-layer/, and the import map every page's start script writes (core/export/app-start.ts), so each module
// imports the runtime, the scripts, the
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
import { APP_MAIN_SCRIPT, APP_MODULES_FOLDER, APP_RUNTIME_SCRIPT, APP_START_SCRIPT } from '../export/paths.ts';
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

// ---------------------------------------------------------------- reading code without a parser

const IDENTIFIER_CHAR = /[\w$]/u;
// the words after which a "/" starts a regular expression, never a division
const BEFORE_REGEX = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);

// The code with the text of every string, template, comment and regular expression written as spaces (its line breaks
// kept), so what is left is the code's own tokens at their places: where a brace opens, where a name is declared,
// where an HTML-like comment stands. A template's ${…} stays code.
export function codeTokensOnly(code: string): string {
  const out = [...code];
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < out.length; k += 1) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' ';
  };
  const stack: ('code' | 'template')[] = [];
  let last = '';
  let word = '';
  let i = 0;
  // a template's text from `from` up to its end (`) or its next ${ (left as code)
  const template = (from: number): number => {
    let j = from;
    while (j < code.length && code[j] !== '`' && !(code[j] === '$' && code[j + 1] === '{')) j += code[j] === '\\' ? 2 : 1;
    blank(from, j);
    if (code[j] === '$') {
      stack.push('template');
      last = '{';
      return j + 2;
    }
    last = ')';
    return j + 1;
  };
  while (i < code.length) {
    const c = code[i] ?? '';
    const next = code[i + 1];
    if (c === '/' && next === '/') {
      const end = code.indexOf('\n', i);
      const to = end < 0 ? code.length : end;
      blank(i, to);
      i = to;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = code.indexOf('*/', i + 2);
      const to = end < 0 ? code.length : end + 2;
      blank(i, to);
      i = to;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < code.length && code[j] !== c && code[j] !== '\n') j += code[j] === '\\' ? 2 : 1;
      blank(i + 1, j);
      i = j + 1;
      last = ')';
      word = '';
      continue;
    }
    if (c === '`') {
      i = template(i + 1);
      word = '';
      continue;
    }
    if (c === '}' && stack[stack.length - 1] === 'template') {
      stack.pop();
      i = template(i + 1);
      word = '';
      continue;
    }
    if (c === '/' && (last === '' || /[(,=:[!&|?{};+\-*%<>~^]/u.test(last) || BEFORE_REGEX.has(word))) {
      let j = i + 1;
      let inClass = false;
      while (j < code.length && code[j] !== '\n' && (inClass || code[j] !== '/')) {
        if (code[j] === '\\') j += 1;
        else if (code[j] === '[') inClass = true;
        else if (code[j] === ']') inClass = false;
        j += 1;
      }
      blank(i + 1, j);
      i = j + 1;
      while (i < code.length && IDENTIFIER_CHAR.test(code[i] ?? '')) i += 1;
      last = ')';
      word = '';
      continue;
    }
    if (c === '{') stack.push('code');
    else if (c === '}') stack.pop();
    if (IDENTIFIER_CHAR.test(c)) {
      word = IDENTIFIER_CHAR.test(last) ? word + c : c;
      last = c;
    } else if (!/\s/u.test(c)) {
      last = c;
      word = '';
    }
    i += 1;
  }
  return out.join('');
}

// Why code holds an HTML-like comment ("<!--" anywhere, "-->" opening a line), or null: a classic script reads one as
// a comment and the site's modules (js/app-layer/main.js) refuse it, so the code is refused where it is checked.
export function htmlCommentIn(code: string): string | null {
  const tokens = codeTokensOnly(code);
  return tokens.includes('<!--') || /^[ \t]*-->/mu.test(tokens) ? 'HTML comments are not allowed in modules' : null;
}

const RUNTIME_NAMES = ['state', 'app', 'fn'] as const;

// The runtime's names a module declares or imports itself at its top level (const app = …, function fn() {},
// import state from …): importing them too would declare them twice, and the module would not load.
function ownNames(code: string): ReadonlySet<string> {
  const tokens = codeTokensOnly(code);
  const own = new Set<string>();
  // the names a binding pattern or an import clause binds: a property's key ("{ state: s }") and an imported name
  // given another one ("{ app as a }") bind nothing of their own
  const add = (pattern: string) => {
    const bound = pattern.replace(/[\w$]+\s+as\s+/gu, '');
    for (const name of RUNTIME_NAMES) if (new RegExp(`(?<![\\w$.])${name}(?![\\w$])(?!\\s*:)`, 'u').test(bound)) own.add(name);
  };
  const opens = (c: string | undefined) => c === '{' || c === '(' || c === '[';
  const closes = (c: string | undefined) => c === '}' || c === ')' || c === ']';
  const variable = /(?:const|let|var)\s+/uy;
  const named = /(?:async\s+)?(?:function\s*\*?\s*|class\s+)([A-Za-z_$][\w$]*)/uy;
  const imported = /import\s+([^'"(]*?)\s*from\b/uy;
  let depth = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const c = tokens[i];
    if (opens(c)) depth += 1;
    else if (closes(c)) depth -= 1;
    if (depth !== 0 || !/[cvlfaiu]/u.test(c ?? '') || /[\w$.]/u.test(tokens[i - 1] ?? '')) continue;
    for (const read of [named, imported]) {
      read.lastIndex = i;
      const found = read.exec(tokens);
      if (found !== null) add(found[1] ?? '');
    }
    variable.lastIndex = i;
    if (variable.exec(tokens) === null) continue;
    // each declarator's pattern, up to its "=", its "," or the statement's end
    let j = variable.lastIndex;
    while (j < tokens.length) {
      const start = j;
      let nested = 0;
      while (j < tokens.length && !(nested === 0 && /[=;,\n]/u.test(tokens[j] ?? '') && j > start)) {
        if (opens(tokens[j])) nested += 1;
        else if (closes(tokens[j])) nested -= 1;
        j += 1;
      }
      add(tokens.slice(start, j));
      if (tokens[j] === ',') {
        j += 1;
        continue;
      }
      if (tokens[j] !== '=') break;
      // the declarator's value, up to the next declarator's ","
      j += 1;
      nested = 0;
      while (j < tokens.length && !(nested === 0 && (tokens[j] === ',' || tokens[j] === ';'))) {
        if (opens(tokens[j])) nested += 1;
        else if (closes(tokens[j])) {
          if (nested === 0) break;
          nested -= 1;
        }
        j += 1;
      }
      if (tokens[j] !== ',') break;
      j += 1;
    }
  }
  return own;
}

// The modules as the site holds them: the person's code, with the runtime's three names imported (on its first line,
// so every line keeps its number) when it does not import them itself — only the names it does not declare itself.
function moduleCode(module: AppModule): string {
  if (/from\s+['"]@app\/runtime['"]/u.test(module.code)) return module.code;
  const own = ownNames(module.code);
  const names = RUNTIME_NAMES.filter((name) => !own.has(name));
  return names.length === 0 ? module.code : `import { ${names.join(', ')} } from '${RUNTIME_SPECIFIER}'; ${module.code}`;
}

// The files the application is written as while the project has one (the start script, main, runtime, then each
// module), in that order.
export function appPaths(document: DocumentJson): readonly string[] {
  if (!siteUsesApp(document)) return [];
  const app = document.app ?? {};
  return [APP_START_SCRIPT, APP_MAIN_SCRIPT, APP_RUNTIME, ...(app.scripts ?? []).map((one) => scriptPath(one.name)), ...(app.components ?? []).map((one) => componentPath(one.name))];
}

export function compileApp(document: DocumentJson, check?: SyntaxCheck): Compiled {
  const app = document.app ?? {};
  // the runtime names the element and the field when it reports the message (runtime.js report)
  const failing = (why: string) => `function () { throw new SyntaxError(${json(why)}); }`;
  // The person's code is checked as it is, then the whole function written around it: the item names its head
  // declares and a field's setter are the compiler's own code, and one that does not parse would stop main.js whole.
  const fnOf = (kind: 'expression' | 'statements' | 'setter', code: string, locals: readonly string[]): string => {
    const head = locals.length === 0 ? '' : `const ${locals.map((name) => `${name} = $l.${name}`).join(', ')};\n`;
    const source =
      kind === 'expression'
        ? `function (state, app, fn, $l) {\n${head}return (\n${code}\n);\n}`
        : kind === 'setter'
          ? `function (state, $l, $v) {\n${head}${code} = $v;\n}`
          : `async function ($event, $el, state, app, fn, $l) {\n${head}${code}\n}`;
    const why = check === undefined ? null : (check(kind === 'statements' ? 'statements' : 'expression', code) ?? check('expression', `(${source})`));
    return why === null ? source : failing(why);
  };
  const nodes: string[] = [];
  const visit = (node: DocNode, locals: readonly string[]) => {
    const logic: NodeLogic | undefined = hasLogic(node) ? node.logic : undefined;
    let inner = locals;
    if (logic !== undefined) {
      const own = logic.each !== undefined ? [...new Set([...locals.filter((name) => name !== (logic.as ?? 'item') && name !== 'index'), logic.as ?? 'item', 'index'])] : locals;
      const parts: string[] = [`name: ${json(node.name)}`];
      if (logic.each !== undefined) {
        parts.push(`each: ${fnOf('expression', logic.each, locals)}`, `as: ${json(logic.as ?? 'item')}`);
        if (logic.key !== undefined) parts.push(`key: ${fnOf('expression', logic.key, own)}`);
      }
      if (logic.text !== undefined) parts.push(`text: ${fnOf('expression', logic.text, own)}`);
      if (logic.html !== undefined) parts.push(`html: ${fnOf('expression', logic.html, own)}`);
      if (logic.show !== undefined) parts.push(`show: ${fnOf('expression', logic.show, own)}`);
      if (logic.model !== undefined) parts.push(`model: [${fnOf('expression', logic.model, own)}, ${fnOf('setter', logic.model, own)}]`);
      if (logic.component !== undefined) parts.push(`component: ${json(logic.component)}`);
      const lists: Record<'attr' | 'class' | 'style' | 'prop', string[]> = { attr: [], class: [], style: [], prop: [] };
      for (const [binding, code] of Object.entries(logic.binds ?? {})) {
        const read = readBinding(binding);
        if (read === null) continue;
        lists[read.kind].push(read.kind === 'prop' ? `${json(read.key)}: ${fnOf('expression', code, own)}` : `[${json(read.key)}, ${fnOf('expression', code, own)}]`);
      }
      if (lists.attr.length > 0) parts.push(`attrs: [${lists.attr.join(', ')}]`);
      if (lists.class.length > 0) parts.push(`classes: [${lists.class.join(', ')}]`);
      if (lists.style.length > 0) parts.push(`styles: [${lists.style.join(', ')}]`);
      if (lists.prop.length > 0) parts.push(`props: {${lists.prop.join(', ')}}`);
      if (logic.on !== undefined) parts.push(`on: [${logic.on.map((one) => `[${json(one.event)}, ${fnOf('statements', one.code, own)}]`).join(', ')}]`);
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
