// The application layer (spec app-logic): its fixtures are valid documents, a broken name or field is refused with its
// reason, and the export writes js/app-layer/main.js, the runtime, the modules and the import map of every page.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkAppSyntax } from '../../editor/app-runtime/script.ts';
import { appProblems, itemNameRefusal } from './validate.ts';
import { manifest } from '../../manifest/runtime.ts';
import type { DocumentJson } from '../document/model.ts';
import { rulesFromManifest, validateDocument } from '../document/validate.ts';
import { previewPage, siteArchive, siteFiles } from '../export/export.ts';
import type { SiteScripts } from '../ports/site-scripts.ts';
import { compileApp } from './compile.ts';

const RULES = rulesFromManifest(manifest.elements, manifest.properties, manifest.html);
// the test application (every part of the layer, one broken expression among them) and the start screen's examples
const fixture = (name: string) =>
  JSON.parse(readFileSync(name === 'test-app' ? 'src/core/logic/fixtures/test-app.json' : `src/editor/examples/${name}.json`, 'utf8')) as DocumentJson;
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as FunctionConstructor;
const scripts: SiteScripts = {
  forms: () => '',
  app: () => readFileSync('src/editor/app-runtime/runtime.js', 'utf8'),
  checkSyntax: (kind, code) => {
    if (kind === 'module') return null;
    try {
      if (kind === 'expression') new Function(`return (\n${code}\n);`);
      else new AsyncFunction(code);
      return null;
    } catch (error) {
      return (error as Error).message;
    }
  },
};
const EXAMPLES = readdirSync('src/editor/examples').filter((file) => file.endsWith('.json')).map((file) => file.slice(0, -'.json'.length));
const APPS = ['test-app', ...EXAMPLES];

describe('the application layer', () => {
  it.each(APPS)('%s is a valid document', (name) => {
    expect(validateDocument(fixture(name), [], RULES)).toEqual([]);
  });

  it.each(EXAMPLES)('%s parses every expression and handler (no function that reports a syntax error)', (name) => {
    expect(compileApp(fixture(name), scripts.checkSyntax).main).not.toContain('throw new SyntaxError(');
    // read with the module's grammar the site runs it with, too
    expect(compileApp(fixture(name), checkAppSyntax).main).not.toContain('throw new SyntaxError(');
  });

  it('refuses a variable whose first value is not of its type, a reserved name and an unknown component', () => {
    const doc = fixture('test-app');
    const broken = { ...doc, app: { ...doc.app, variables: [{ name: 'state', type: 'number', initial: 'x' }] } } as DocumentJson;
    const messages = validateDocument(broken, [], RULES).map((one) => one.message);
    expect(messages.some((m) => m.includes('every expression already has'))).toBe(true);
    const noComponent = { ...doc, app: { ...doc.app, components: undefined } } as unknown as DocumentJson;
    expect(validateDocument(JSON.parse(JSON.stringify(noComponent)) as DocumentJson, [], RULES).some((one) => one.message.includes('no code component'))).toBe(true);
  });

  it('accepts the name a persisted variable is kept under, hands it to the runtime, and refuses two kept under one name (LOGIC-12)', () => {
    const doc = fixture('test-app');
    const withKept = (variables: readonly unknown[]) => ({ ...doc, app: { ...doc.app, variables } }) as unknown as DocumentJson;
    const renamed = withKept([{ name: 'basket', type: 'list', initial: [], persist: true, kept: 'cart' }]);
    expect(appProblems(renamed)).toEqual([]);
    expect(compileApp(renamed).main).toContain('"kept":"cart"');
    expect(appProblems(withKept([{ name: 'basket', type: 'list', initial: [], kept: 'cart' }]))).toHaveLength(1);
    expect(appProblems(withKept([{ name: 'cart', type: 'list', initial: [], persist: true, kept: 'cart' }]))).toHaveLength(1);
    expect(appProblems(withKept([{ name: 'basket', type: 'list', initial: [], persist: true, kept: 'cart' }, { name: 'cart', type: 'list', initial: [], persist: true }]))).toHaveLength(1);
  });

  it('writes each expression as a function, the item names declared, and a broken one as a function that reports it', () => {
    const { main, modules } = compileApp(fixture('test-app'), scripts.checkSyntax);
    expect(main).toContain("const todo = $l.todo, index = $l.index;");
    expect(main).toContain('throw new SyntaxError(');
    expect(main).not.toContain('eval(');
    expect(modules.map((m) => m.path)).toEqual(['js/app-layer/scripts/util.js', 'js/app-layer/components/Etiqueta.js']);
    expect(modules[0]?.code.startsWith("import { state, app, fn } from '@app/runtime';")).toBe(true);
  });

  it('links the start script from every page, and archives the application files', () => {
    const site = siteFiles(fixture('test-app'), RULES, true, scripts);
    const html = site.pages[0]?.html ?? '';
    // one classic script, which a page opened from disk runs too (final-use audit USE-3): no module tag, no import map
    expect(html).toContain('<script defer src="js/app-layer/start.js"></script>');
    expect(html).not.toContain('type="module"');
    expect(html).not.toContain('importmap');
    expect(html).toMatch(/data-app="a\d+"/u);
    // the start script names each module's file beside it, and carries each module's text for a page opened from disk
    const start = site.app?.start ?? '';
    expect(start).toContain('var files = {"@app/runtime":"runtime.js","@app/script/util":"scripts/util.js","@app/component/Etiqueta":"components/Etiqueta.js"};');
    expect(start).toContain('"@app/script/util":"import { state, app, fn } from \'@app/runtime\';');
    expect(start).toContain('/^(file|about|data|blob):$/.test(location.protocol)');
    expect(() => new Function(start)).not.toThrow();
    const archive = new TextDecoder('latin1').decode(siteArchive(fixture('test-app'), RULES, scripts));
    for (const path of ['js/app-layer/start.js', 'js/app-layer/main.js', 'js/app-layer/runtime.js', 'js/app-layer/scripts/util.js', 'js/app-layer/components/Etiqueta.js']) expect(archive).toContain(path);
  });

  it('refuses what only a classic script parses, so one piece never stops main.js (the audit LOGIC-1 and LOGIC-2)', () => {
    const node = (id: string, logic: object, children: object[] = []) => ({ id, name: id, type: 'box', tag: 'div', attributes: {}, children, logic });
    const broken = [
      node('with', { on: [{ event: 'click', code: 'with (state) { count++ }' }] }),
      node('octal', { text: '010' }),
      node('delete', { on: [{ event: 'click', code: 'var x = 1; delete x;' }] }),
      node('reserved', { on: [{ event: 'click', code: 'let package = 1; state.n = package;' }] }),
      node('comment', { text: 'state.a <!-- note' }),
      node('closing', { on: [{ event: 'click', code: 'state.a = 1\n--> note' }] }),
      node('await', { text: 'await' }),
      node('item', { each: 'state.list', as: '$v' }, [node('field', { model: 'state.x' })]),
      node('junk', { model: 'state.a[(]' }),
    ];
    const document = { version: fixture('test-app').version, pages: [{ id: 'p', file: 'index.html', tree: node('root', { text: 'state.a' }, broken) }], app: { variables: [{ name: 'a', type: 'text', initial: '' }] } } as unknown as DocumentJson;
    const { main } = compileApp(document, checkAppSyntax);
    // every broken piece is a function that throws its own message, and main.js parses as the module it is
    expect(main.match(/throw new SyntaxError\(/gu)?.length).toBe(10);
    expect(main).not.toMatch(/\((?:texto|repetir|chave|mostrar|campo)\)/u);
    const file = join(tmpdir(), `logic-main-${process.pid}.mjs`);
    writeFileSync(file, main);
    expect(() => execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })).not.toThrow();
    // a string or a comment holding the marks is no HTML comment
    expect(checkAppSyntax('expression', "'<!--' + `-->` /* <!-- */")).toBeNull();
    // the item names the module would refuse are refused by the document's own check
    for (const as of ['class', 'arguments', 'eval', '$l', '$v', 'await', 'let']) expect(itemNameRefusal(as)).not.toBeNull();
    expect(itemNameRefusal('todo')).toBeNull();
  });

  it('imports into a module only the runtime names it does not declare, on its first line (the audit LOGIC-11)', () => {
    const doc = fixture('test-app');
    const withCode = (code: string) => compileApp({ ...doc, app: { scripts: [{ name: 'game', code }] } }).modules[0]?.code ?? '';
    expect(withCode('const app = new Map();\nexport const x = state.n;')).toBe("import { state, fn } from '@app/runtime'; const app = new Map();\nexport const x = state.n;");
    expect(withCode('function fn() {}\nlet { a: state } = {};')).toBe("import { app } from '@app/runtime'; function fn() {}\nlet { a: state } = {};");
    expect(withCode('function f() { const app = 1; return app; }')).toBe("import { state, app, fn } from '@app/runtime'; function f() { const app = 1; return app; }");
    expect(withCode("import * as app from 'x';\nconst s = 'const state = 1';")).toBe("import { state, fn } from '@app/runtime'; import * as app from 'x';\nconst s = 'const state = 1';");
  });

  it('runs the preview from data: modules', () => {
    const html = previewPage(fixture('test-app'), RULES, 0, scripts);
    // the start script itself, written in: in the preview's frame (about:srcdoc) it runs the modules from their text
    expect(html).toContain(siteFiles(fixture('test-app'), RULES, false, scripts).app?.start.slice(0, 200) ?? 'no start');
    expect(html).toContain("'data:text/javascript;charset=utf-8,' + encodeURIComponent(code)");
    expect(html).toContain('<html data-app-debug');
    expect(html).not.toContain('src="js/app-layer/start.js"');
    // the browser tests read the preview of every example application (APP_OUT=<folder>)
    const out = process.env.APP_OUT;
    if (out !== undefined) {
      mkdirSync(out, { recursive: true });
      for (const name of APPS) {
        writeFileSync(`${out}/${name}.html`, previewPage(fixture(name), RULES, 0, scripts));
        writeFileSync(`${out}/${name}.zip`, siteArchive(fixture(name), RULES, scripts));
      }
    }
  });
});
