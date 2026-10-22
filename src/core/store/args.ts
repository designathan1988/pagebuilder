// The arguments a command is handed, read against what its manifest entry declares (the audit's AUD-09: 95 commands
// threw on arguments their doors never hand — a missing value, a node or a page that is not there, a word outside an
// enum — where a predictable invalid operation is refused before any patch). The one reader of the declared argument
// types for the store, before the availability predicate and the handler run: a door always hands what its command
// takes, so what reaches this refusal is a caller's (the assistant, the MCP tools, a stale control) and is said in
// words.
//
// It refuses what can never be right, and leaves to the handler what only the handler knows: a text where a number is
// declared stands (a field hands the text typed, which the handler reads), but a number that is no number (NaN,
// infinity) does not; a name of something the project holds is the handler's to look up, through the reference kinds
// its argument declares (`refers`: core/store/references.ts).
import type { Command } from '../../manifest/schema.ts';
import type { CommandId, MessageId } from '../../generated/ids.ts';
import { message, type Message } from '../commands/registry.ts';
import { locate, type DocumentJson, type NodeId } from '../document/model.ts';
import type { ModelRules } from '../document/validate.ts';
import { referenceFound } from './references.ts';
import { stateArgumentFits } from '../style/state-keys.ts';

type Arg = Command['args'][string];

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): boolean => typeof value !== 'number' || Number.isFinite(value);

// whether one value can stand for an argument of its declared type (undefined and null: absent)
function fits(arg: Arg, value: unknown, document: DocumentJson, rules: ModelRules): 'fits' | 'invalid' | 'stale' {
  switch (arg.type) {
    case 'node':
      if (typeof value !== 'string' || value === '') return 'invalid';
      return locate(document, value as NodeId) === null ? 'stale' : 'fits';
    case 'nodes':
      if (!Array.isArray(value) || value.some((one) => typeof one !== 'string')) return 'invalid';
      return value.some((one) => locate(document, one as NodeId) === null) ? 'stale' : 'fits';
    case 'number':
    case 'integer':
      // a field hands the text typed, which the handler reads; a number must be one
      if (typeof value === 'string') return 'fits';
      if (typeof value !== 'number' || !finite(value)) return 'invalid';
      return arg.type === 'integer' && !Number.isInteger(value) ? 'invalid' : 'fits';
    case 'boolean':
      return typeof value === 'boolean' ? 'fits' : 'invalid';
    case 'enum':
      return typeof value === 'string' && (arg.values.length === 0 || arg.values.includes(value)) ? 'fits' : 'invalid';
    case 'breakpoint':
      return typeof value === 'string' && rules.breakpoints.has(value) ? 'fits' : 'invalid';
    case 'state':
      // a style state, or a parent state whose class is still to be chosen (core/style/state-keys.ts)
      return typeof value === 'string' && stateArgumentFits(value, rules.output.states) ? 'fits' : 'invalid';
    case 'attribute':
      return typeof value === 'string' && rules.attributeValues.has(value) ? 'fits' : 'invalid';
    case 'point':
      return isObject(value) && typeof value.x === 'number' && typeof value.y === 'number' && finite(value.x) && finite(value.y) ? 'fits' : 'invalid';
    case 'rect':
      // eslint-disable-next-line builder/no-manifest-id -- A rect argument's own fields, not CSS properties.
      return isObject(value) && ['x', 'y', 'width', 'height'].every((key) => typeof value[key] === 'number' && finite(value[key])) ? 'fits' : 'invalid';
    // what a door reads from the person's disk or clipboard (a file's text, its name and bytes, several files): the
    // handler reads its shape
    case 'file':
    case 'files':
    case 'clipboard':
      return 'fits';
    case 'path':
      return typeof value === 'string' && value.trim() !== '' ? 'fits' : 'invalid';
    // eslint-disable-next-line builder/no-manifest-id -- The manifest's argument type, not the CSS color property.
    case 'color':
    case 'string':
    case 'property':
    case 'palette-entry':
      return typeof value === 'string' ? 'fits' : 'invalid';
    case 'json':
      return 'fits';
  }
}

// Why these arguments cannot be the command's, or null: a declared argument that is not optional and absent, or a
// value its type cannot be ("invalid", naming the argument), or a node it names that the document does not hold
// (status.stale, as for a control that went stale).
export function argumentRefusal(id: CommandId, command: Pick<Command, 'args' | 'labelKey' | 'nameKey'>, args: unknown, document: DocumentJson, rules: ModelRules): Message | null {
  const given = isObject(args) ? args : {};
  const name = { key: (command.nameKey ?? command.labelKey) as MessageId };
  for (const [argument, arg] of Object.entries(command.args)) {
    const value = given[argument];
    if (value === undefined || value === null) {
      // what the clipboard holds is read only when the command runs (door.tsx): the context menu asks a paste before,
      // and its handler answers that question (clipboard.ts)
      if (arg.optional || arg.type === 'clipboard') continue;
      return message('status.args.invalid', { command: name, argument });
    }
    const verdict = fits(arg, value, document, rules);
    if (verdict === 'invalid') return message('status.args.invalid', { command: name, argument });
    if (verdict === 'stale') return message('status.stale');
    // a name of something the project or the editor holds, which it must name
    if (arg.refers !== undefined && typeof value === 'string' && !referenceFound(arg.refers, document, value, rules)) return message('status.stale');
  }
  void id;
  return null;
}

// The refusal of an argument the command does not take, for a handler that finds out (a value whose meaning only the
// handler knows: a length that is no whole px, a track edit of no track): the store names the command in it, with the
// same words as its own check (store.ts, withCommandName).
export function argumentRefused(argument: string): Message {
  return message('status.args.invalid', { argument });
}

// a refusal of an argument as the person reads it: the command's name added when the handler could not name it
export function withCommandName(said: Message, command: Pick<Command, 'labelKey' | 'nameKey'>): Message {
  if (said.key !== 'status.args.invalid' || 'command' in said.params) return said;
  return message(said.key, { ...said.params, command: { key: (command.nameKey ?? command.labelKey) as MessageId } });
}
