// Where the code of the application layer names a variable, a script, a code component or a table (spec app-logic):
// the one reader the renames rewrite through and the removals ask, so a rename leaves no reference behind and a
// removal never leaves code naming what is gone (the logic audit's LOGIC-12 and LOGIC-13).
//
// A name is a whole JavaScript identifier ([\w$], so `price$` is one name), named from its root (`state.x`, never
// `history.state.x` or `$event.state.x`: a root right after a `.` is another object's member). What each kind is named
// by:
// - a variable: `state.name`, `state?.name`, `state['name']` and `const { name } = state`;
// - a script: `fn.name`, `fn['name']` (its module) and the specifier '@app/script/name';
// - a code component: the specifier '@app/component/name' (an element names it in its logic's `component`);
// - a table: the first argument of `app.db.list|get|add|update|remove('name', …)`.
// Text inside strings and comments that reads the same is read the same: the reader is lexical, as the renames always
// were.

const escape = (text: string): string => text.replace(/[$.*+?^()[\]{}|\\]/gu, '\\$&');

// a root object, not another object's member
const ROOT = '(?<![\\w$.])';
// the end of an identifier
const END = '(?![\\w$])';
// a member access: `.` or `?.`
const DOT = '\\s*(?:\\?\\.|\\.)\\s*';
// a computed member access: `[` or `?.[`
const OPEN = '\\s*(?:\\?\\.)?\\[\\s*';

// Every place `root.name` or `root['name']` stands, rewritten to `to` (or read, when `to` is null).
function memberPatterns(root: string, name: string): readonly RegExp[] {
  return [
    new RegExp(`(${ROOT}${escape(root)}${DOT})${escape(name)}${END}`, 'gu'),
    new RegExp(`(${ROOT}${escape(root)}${OPEN})(['"\`])${escape(name)}\\2(?=\\s*\\])`, 'gu'),
  ];
}

const renameMember = (root: string, from: string, to: string) => (code: string): string => {
  const [dot, bracket] = memberPatterns(root, from) as [RegExp, RegExp];
  return code.replace(dot, (_all, head: string) => `${head}${to}`).replace(bracket, (_all, head: string, quote: string) => `${head}${quote}${to}${quote}`);
};

const usesMember = (root: string, name: string, code: string): boolean => memberPatterns(root, name).some((pattern) => new RegExp(pattern.source, 'u').test(code));

// `{ a, b: alias, c = 1 } = state`: the pattern's properties (no nested pattern: the braces hold no other brace)
const DESTRUCTURED = (root: string) => new RegExp(`\\{([^{}]*)\\}(\\s*=\\s*${escape(root)})(?![\\w$.\\[])`, 'gu');

// one property of a destructuring pattern, its key first: `name`, `name = fallback`, `name: alias`, `...rest`
const PROPERTY = /^(\s*)([A-Za-z_$][\w$]*)(\s*)([:=]?)([\s\S]*)$/u;

function renameDestructured(root: string, from: string, to: string, code: string): string {
  return code.replace(DESTRUCTURED(root), (all, inside: string, tail: string) => {
    let changed = false;
    const parts = inside.split(',').map((part) => {
      const found = PROPERTY.exec(part);
      if (found === null || found[2] !== from) return part;
      changed = true;
      const lead = found[1] ?? '';
      const gap = found[3] ?? '';
      const sign = found[4] ?? '';
      const rest = found[5] ?? '';
      // `name: alias` keeps its alias; a bare `name` (or `name = fallback`) keeps its local name under the new key
      return sign === ':' ? `${lead}${to}${gap}:${rest}` : `${lead}${to}: ${from}${gap}${sign}${rest}`;
    });
    return changed ? `{${parts.join(',')}}${tail}` : all;
  });
}

function usesDestructured(root: string, name: string, code: string): boolean {
  for (const match of code.matchAll(DESTRUCTURED(root))) {
    if ((match[1] ?? '').split(',').some((part) => PROPERTY.exec(part)?.[2] === name)) return true;
  }
  return false;
}

const specifier = (kind: 'script' | 'component', name: string) => new RegExp(`(['"\`])@app/${kind}/${escape(name)}\\1`, 'gu');

const TABLE_CALL = (name: string) => new RegExp(`(${ROOT}app${DOT}db${DOT}(?:list|get|add|update|remove)\\s*\\(\\s*)(['"\`])${escape(name)}\\2`, 'gu');

// ---------------------------------------------------------------- variables

export const renameVariable = (from: string, to: string) => (code: string): string => renameDestructured('state', from, to, renameMember('state', from, to)(code));

export const usesVariable = (name: string) => (code: string): boolean => usesMember('state', name, code) || usesDestructured('state', name, code);

// ---------------------------------------------------------------- scripts and code components

export const renameScript = (from: string, to: string) => (code: string): string =>
  renameMember('fn', from, to)(code).replace(specifier('script', from), (_all, quote: string) => `${quote}@app/script/${to}${quote}`);

// whether code names the script (its module, `fn.name`, or its specifier) or one of the functions it exports that no
// other script exports (`fn.greet`: the runtime puts every script's exports on fn)
export const usesScript = (name: string, exportsOnlyIt: readonly string[]) => (code: string): boolean =>
  usesMember('fn', name, code) || new RegExp(specifier('script', name).source, 'u').test(code) || exportsOnlyIt.some((one) => usesMember('fn', one, code));

export const renameComponent = (from: string, to: string) => (code: string): string =>
  code.replace(specifier('component', from), (_all, quote: string) => `${quote}@app/component/${to}${quote}`);

// ---------------------------------------------------------------- tables

export const renameTable = (from: string, to: string) => (code: string): string =>
  code.replace(TABLE_CALL(from), (_all, head: string, quote: string) => `${head}${quote}${to}${quote}`);

// ---------------------------------------------------------------- exports

// The names a script's code exports (export function f, export const f, export { a, b as c }): what fn. offers.
export function exportedNames(code: string): readonly string[] {
  const names = new Set<string>();
  for (const match of code.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gu)) names.add(match[1] as string);
  for (const match of code.matchAll(/export\s*\{([^}]*)\}/gu)) {
    for (const part of (match[1] as string).split(',')) {
      const name = part.trim().split(/\s+as\s+/u).pop()?.trim();
      if (name !== undefined && /^[A-Za-z_$][\w$]*$/u.test(name) && name !== 'default') names.add(name);
    }
  }
  return [...names];
}
