// The application part of the site-scripts port (core/ports/site-scripts.ts, spec app-logic): the runtime the site's
// js/app-layer/main.js starts (js/app-layer/runtime.js) and the parser that says which expression or handler of the
// project does not parse, so the export writes it as a function that reports it (core/logic/compile.ts).
import runtimeSource from './runtime.js?raw';
import { htmlCommentIn, type CodeKind } from '../../core/logic/compile.ts';
import { withSiteWords } from './words.ts';

// the visitor's words of the runtime (its WORDS): the error box's hint and the messages of app.db and app.auth's codes
const runtime = withSiteWords(runtimeSource, {
  closeErrors: 'siteRuntime.app.closeErrors',
  'error.login_required': 'siteRuntime.app.error.loginRequired',
  'error.forbidden': 'siteRuntime.app.error.forbidden',
  'error.unknown_table': 'siteRuntime.app.error.unknownTable',
  'error.not_found': 'siteRuntime.app.error.notFound',
  'error.invalid_email': 'siteRuntime.app.error.invalidEmail',
  'error.weak_password': 'siteRuntime.app.error.weakPassword',
  'error.email_taken': 'siteRuntime.app.error.emailTaken',
  'error.invalid_credentials': 'siteRuntime.app.error.invalidCredentials',
  'error.invalid_data': 'siteRuntime.app.error.invalidData',
  'error.invalid_query': 'siteRuntime.app.error.invalidQuery',
  'error.table_full': 'siteRuntime.app.error.tableFull',
  'error.unavailable': 'siteRuntime.app.error.unavailable',
  // the preview's error box: what failed (an element's field, a loop of bindings, a value that would run code)
  binding: 'siteRuntime.app.binding',
  loop: 'siteRuntime.app.loop',
  unsafeAddress: 'siteRuntime.app.unsafeAddress',
  'field.text': 'siteRuntime.app.field.text',
  'field.html': 'siteRuntime.app.field.html',
  'field.show': 'siteRuntime.app.field.show',
  'field.each': 'siteRuntime.app.field.each',
  'field.key': 'siteRuntime.app.field.key',
  'field.model': 'siteRuntime.app.field.model',
});

export const appRuntimeScript = (): string => runtime;

// The engine's own parser, through the Function constructors: the code is parsed, never run. A module (import/export)
// is not checked here: the browser reports it when the site imports it, and the runtime says which script it was.
// The site runs every expression and handler inside js/app-layer/main.js, a module, so the code is read with a
// module's grammar (the audit's LOGIC-1): in strict mode ('use strict'), with `await` a reserved word (an expression is
// read as an async function's too) and with no HTML-like comment (htmlCommentIn). A piece that only a classic script
// accepts would otherwise stop the whole application.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as FunctionConstructor;
export function checkAppSyntax(kind: CodeKind, code: string): string | null {
  if (kind === 'module') return null;
  const comment = htmlCommentIn(code);
  if (comment !== null) return comment;
  try {
    if (kind === 'expression') {
      new Function('state', 'app', 'fn', '$l', `'use strict'; return (\n${code}\n);`);
      new AsyncFunction('state', 'app', 'fn', '$l', `'use strict'; return (\n${code}\n);`);
    } else new AsyncFunction('$event', '$el', 'state', 'app', 'fn', '$l', `'use strict'; ${code}`);
    return null;
  } catch (error) {
    // a page whose Content Security Policy refuses the constructors cannot check: the code is written as it is
    if (error instanceof EvalError) return null;
    return error instanceof Error ? error.message : String(error);
  }
}
