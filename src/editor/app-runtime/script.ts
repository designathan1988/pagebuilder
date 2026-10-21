// The application part of the site-scripts port (core/ports/site-scripts.ts, spec app-logic): the runtime the site's
// js/app-layer/main.js starts (js/app-layer/runtime.js) and the parser that says which expression or handler of the
// project does not parse, so the export writes it as a function that reports it (core/logic/compile.ts).
import runtimeSource from './runtime.js?raw';
import type { CodeKind } from '../../core/logic/compile.ts';

export const appRuntimeScript = (): string => runtimeSource;

// The engine's own parser, through the Function constructors: the code is parsed, never run. A module (import/export)
// is not checked here: the browser reports it when the site imports it, and the runtime says which script it was.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as FunctionConstructor;
export function checkAppSyntax(kind: CodeKind, code: string): string | null {
  if (kind === 'module') return null;
  try {
    if (kind === 'expression') new Function('state', 'app', 'fn', '$l', `return (\n${code}\n);`);
    else new AsyncFunction('$event', '$el', 'state', 'app', 'fn', '$l', code);
    return null;
  } catch (error) {
    // a page whose Content Security Policy refuses the constructors cannot check: the code is written as it is
    if (error instanceof EvalError) return null;
    return error instanceof Error ? error.message : String(error);
  }
}
