// The start of a site's application (spec app-logic; the user's final-use audit, USE-3): js/app-layer/start.js, the one
// script a page with an application links, a classic deferred script. It writes the import map and starts
// js/app-layer/main.js:
//  - served by a web server (http:, https:, and the app packages' own schemes, packages.ts), each module from its file
//    beside it, as before;
//  - opened from disk (file:) or written into the editor's preview (about:srcdoc), where the browser loads no module
//    file (Chrome refuses a module's file on file://, and the preview's frame has no folder), from the modules' own
//    text, which this script carries, as data: addresses.
// The page linked the import map and main.js as a module itself, so a site opened from disk by double-clicking
// index.html ran no application and said nothing. The preview writes this same script into the page (export.ts
// previewPage), so the preview runs the application exactly as a site opened from disk does.
import type { DocumentJson } from '../document/model.ts';
import { fileAt, fileBytes, relativePath } from '../files/files.ts';
import { importMap } from '../logic/compile.ts';
import { APP_MAIN_SCRIPT, APP_START_SCRIPT } from './paths.ts';

export interface CompiledApp {
  readonly main: string;
  readonly runtime: string;
  readonly modules: readonly { readonly path: string; readonly code: string }[];
}

// a JSON text written into a script: "</script" and the line separators escaped, so it never ends the element it is
// written in (the preview) nor reads differently in any JavaScript engine
const json = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const importsOf = (map: string): Readonly<Record<string, string>> => (JSON.parse(map) as { imports: Record<string, string> }).imports;

export function appStartScript(document: DocumentJson, app: CompiledApp): string {
  // each module by its name: the file beside this script, and the module's own text (a library stored in the project is
  // its file's text); a library on the web keeps its address in both, and is written into the map as it is
  const files = importsOf(importMap(document, (path) => relativePath(APP_START_SCRIPT, path), app.runtime, app));
  const texts = importsOf(importMap(document, (path, code) => code ?? (() => {
    const file = fileAt(document, path);
    return file === null ? '' : new TextDecoder().decode(fileBytes(file));
  })(), app.runtime, app));
  const web: Record<string, string> = {};
  const local: Record<string, string> = {};
  const sources: Record<string, string> = {};
  for (const [name, address] of Object.entries(files)) {
    if (address === texts[name] || /^https:\/\//u.test(address)) web[name] = address;
    else {
      local[name] = address;
      sources[name] = texts[name] ?? '';
    }
  }
  return [
    '// The start of this site\'s application (written by the builder): the import map of its modules, then main.js.',
    '// Served by a web server, each module loads from its file beside this script; opened from disk (file://), where the',
    '// browser loads no module file, each one runs from its text below.',
    '(function () {',
    "  'use strict';",
    "  var here = document.currentScript && document.currentScript.src ? document.currentScript.src : '';",
    "  var fromText = here === '' || /^(file|about|data|blob):$/.test(location.protocol);",
    `  var web = ${json(web)};`,
    `  var files = ${json(local)};`,
    `  var sources = ${json(sources)};`,
    `  var main = ${json(app.main)};`,
    "  var dataAddress = function (code) { return 'data:text/javascript;charset=utf-8,' + encodeURIComponent(code); };",
    '  var imports = {};',
    '  Object.keys(web).forEach(function (name) { imports[name] = web[name]; });',
    '  Object.keys(files).forEach(function (name) { imports[name] = fromText ? dataAddress(sources[name]) : new URL(files[name], here).href; });',
    "  var map = document.createElement('script');",
    "  map.type = 'importmap';",
    '  map.textContent = JSON.stringify({ imports: imports });',
    '  document.head.appendChild(map);',
    "  var start = document.createElement('script');",
    "  start.type = 'module';",
    `  if (fromText) start.textContent = main; else start.src = new URL(${json(relativePath(APP_START_SCRIPT, APP_MAIN_SCRIPT))}, here).href;`,
    '  document.head.appendChild(start);',
    '})();',
    '',
  ].join('\n');
}
