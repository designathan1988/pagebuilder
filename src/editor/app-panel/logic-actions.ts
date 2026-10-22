// The actions an event runs, picked instead of typed (the inspector's Logic tab, Events): set a variable, switch it,
// count up or down, empty it, add an item to a list, take the item out of its list, switch a field of the item, take
// the items whose field is on out of a list, run a script's function, go to a page, show a message. Each action is one
// line of the event's code, written here; a line written so reads back as its action, in words, so an event made of
// picked actions never shows code. Any other line stays code, kept and shown as it is.
import type { JsonValue } from '../../generated/commands.ts';
import type { AppVariable } from '../../core/logic/model.ts';
import { emptyOf } from '../../core/logic/model.ts';

export type ActionKind =
  | 'set'
  | 'set-from-field'
  | 'toggle'
  | 'increase'
  | 'decrease'
  | 'clear'
  | 'add-to-list'
  | 'remove-item'
  | 'toggle-item-field'
  | 'remove-where'
  | 'call'
  | 'go'
  | 'toast';

export interface Action {
  readonly kind: ActionKind;
  // the variable it changes (a list for add-to-list, remove-item and remove-where)
  readonly variable?: string;
  // the value it sets (set), the variable whose value goes into the list (add-to-list), the field of the item
  // (toggle-item-field, remove-where), the function (call), the address (go), the message (toast)
  readonly value?: string;
}

const NAME = '[A-Za-z_$][\\w$]*';
const quotedText = (text: string): string => JSON.stringify(text);
// a JavaScript string literal in either quote, as a person or an example may have written it
const STRING = `(?:"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')`;
const unquote = (literal: string): string => (literal.startsWith("'") ? literal.slice(1, -1).replace(/\\'/gu, "'") : (JSON.parse(literal) as string));

// the value a typed text stands for in a variable of a type: a number, yes or no, else the text itself
function literalFor(variable: AppVariable | undefined, typed: string): string {
  if (variable?.type === 'number' && typed.trim() !== '' && Number.isFinite(Number(typed))) return String(Number(typed));
  if (variable?.type === 'boolean') return /^(true|yes|sim|1|on)$/iu.test(typed.trim()) ? 'true' : 'false';
  return quotedText(typed);
}

// the item a list holds, as a new one is written: the fields of its first item, the id a fresh one, the first text
// field the source's value, the other texts empty, yes-or-no false, numbers 0; a list of plain values gets the value
function newItem(list: AppVariable | undefined, source: string): string {
  const items = Array.isArray(list?.initial) ? (list.initial as readonly JsonValue[]) : [];
  const first = items.find((one) => one !== null && typeof one === 'object' && !Array.isArray(one)) as Record<string, JsonValue> | undefined;
  if (first === undefined) return `state.${source}`;
  let placed = false;
  const fields = Object.entries(first).map(([key, sample]) => {
    if (key === 'id') return `id: app.uid()`;
    if (typeof sample === 'string' && !placed) {
      placed = true;
      return `${key}: state.${source}`;
    }
    if (typeof sample === 'string') return `${key}: ''`;
    if (typeof sample === 'boolean') return `${key}: false`;
    if (typeof sample === 'number') return `${key}: 0`;
    return `${key}: null`;
  });
  return `{ ${fields.join(', ')} }`;
}

// the line an action is, in the scope it runs in: the item of the element's repeat (`item` names it)
export function actionCode(action: Action, variables: readonly AppVariable[], item: string | null): string {
  const named = variables.find((one) => one.name === action.variable);
  const v = action.variable ?? '';
  const value = action.value ?? '';
  switch (action.kind) {
    case 'set':
      return `state.${v} = ${literalFor(named, value)}`;
    case 'set-from-field':
      return `state.${v} = $el.value`;
    case 'toggle':
      return `state.${v} = !state.${v}`;
    case 'increase':
      return `state.${v} += 1`;
    case 'decrease':
      return `state.${v} -= 1`;
    case 'clear':
      return `state.${v} = ${JSON.stringify(named === undefined ? '' : emptyOf(named.type))}`;
    case 'add-to-list':
      return `state.${v}.push(${newItem(named, value)})`;
    case 'remove-item': {
      const items = Array.isArray(named?.initial) ? (named.initial as readonly JsonValue[]) : [];
      const hasId = items.some((one) => one !== null && typeof one === 'object' && !Array.isArray(one) && 'id' in one);
      const it = item ?? 'item';
      return hasId ? `state.${v} = state.${v}.filter((one) => one.id !== ${it}.id)` : `state.${v} = state.${v}.filter((one) => one !== ${it})`;
    }
    case 'toggle-item-field':
      return `${item ?? 'item'}.${value} = !${item ?? 'item'}.${value}`;
    case 'remove-where':
      return `state.${v} = state.${v}.filter((one) => !one.${value})`;
    case 'call':
      return `fn.${value}()`;
    case 'go':
      return `app.go(${quotedText(value)})`;
    case 'toast':
      return `app.toast(${quotedText(value)})`;
  }
}

// The action a line of code is, when it is one of the lines actionCode writes (or the same line as an example wrote it,
// in single quotes); null for any other code.
export function actionOf(line: string): Action | null {
  const code = line.trim().replace(/;$/u, '');
  let m: RegExpExecArray | null;
  if ((m = new RegExp(`^state\\.(${NAME}) = \\$el\\.value$`, 'u').exec(code)) !== null) return { kind: 'set-from-field', variable: m[1] as string };
  if ((m = new RegExp(`^state\\.(${NAME}) = !state\\.(${NAME})$`, 'u').exec(code)) !== null && m[1] === m[2]) return { kind: 'toggle', variable: m[1] as string };
  if ((m = new RegExp(`^state\\.(${NAME}) \\+= 1$`, 'u').exec(code)) !== null) return { kind: 'increase', variable: m[1] as string };
  if ((m = new RegExp(`^state\\.(${NAME}) -= 1$`, 'u').exec(code)) !== null) return { kind: 'decrease', variable: m[1] as string };
  if ((m = new RegExp(`^state\\.(${NAME}) = state\\.(${NAME})\\.filter\\(\\((one)\\) => one(?:\\.id)? !== (${NAME})(?:\\.id)?\\)$`, 'u').exec(code)) !== null && m[1] === m[2])
    return { kind: 'remove-item', variable: m[1] as string };
  if ((m = new RegExp(`^state\\.(${NAME}) = state\\.(${NAME})\\.filter\\(\\(one\\) => !one\\.(${NAME})\\)$`, 'u').exec(code)) !== null && m[1] === m[2])
    return { kind: 'remove-where', variable: m[1] as string, value: m[3] as string };
  if ((m = new RegExp(`^state\\.(${NAME})\\.push\\(state\\.(${NAME})\\)$`, 'u').exec(code)) !== null) return { kind: 'add-to-list', variable: m[1] as string, value: m[2] as string };
  if ((m = new RegExp(`^state\\.(${NAME})\\.push\\(\\{.*: state\\.(${NAME})(?:,.*)? \\}\\)$`, 'u').exec(code)) !== null) return { kind: 'add-to-list', variable: m[1] as string, value: m[2] as string };
  if ((m = new RegExp(`^(${NAME})\\.(${NAME}) = !(${NAME})\\.(${NAME})$`, 'u').exec(code)) !== null && m[1] === m[3] && m[2] === m[4] && m[1] !== 'state')
    return { kind: 'toggle-item-field', value: m[2] as string };
  if ((m = new RegExp(`^fn\\.(${NAME})\\(\\)$`, 'u').exec(code)) !== null) return { kind: 'call', value: m[1] as string };
  if ((m = new RegExp(`^app\\.go\\((${STRING})\\)$`, 'u').exec(code)) !== null) return { kind: 'go', value: unquote(m[1] as string) };
  if ((m = new RegExp(`^app\\.toast\\((${STRING})\\)$`, 'u').exec(code)) !== null) return { kind: 'toast', value: unquote(m[1] as string) };
  if ((m = new RegExp(`^state\\.(${NAME}) = (${STRING}|-?\\d+(?:\\.\\d+)?|true|false|\\[\\]|\\{\\}|null)$`, 'u').exec(code)) !== null) {
    const raw = m[2] as string;
    const value = raw.startsWith('"') || raw.startsWith("'") ? unquote(raw) : raw;
    return { kind: raw === '[]' || raw === '{}' || raw === '""' || raw === "''" ? 'clear' : 'set', variable: m[1] as string, value };
  }
  return null;
}

// a line the event keeps only for the page's sake (a form's submit already keeps the page where it is)
export const isHousekeeping = (line: string): boolean => /^\$event\.preventDefault\(\);?$/u.test(line.trim());
