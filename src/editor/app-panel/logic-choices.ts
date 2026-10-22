// The choices a Logic field offers (the inspector's Logic tab): what the field can use, in words, each standing for the
// expression the field keeps — a variable of the application, the number of items of a list, the result of a script's
// function, the item a repeated element stands for and its fields. A person picks what the element shows, when it
// shows, what it repeats and what a field keeps without typing JavaScript; the code editor stays for anything else.
import { locate, type DocumentJson } from '../../core/document/model.ts';
import type { AppVariable } from '../../core/logic/model.ts';
import type { JsonValue, NodeId } from '../../generated/commands.ts';
import type { Translate } from '../text.ts';
import { projectScope } from './scope.ts';

export interface Choice {
  readonly value: string;
  readonly label: string;
}

export type ChoiceField = 'text' | 'html' | 'show' | 'each' | 'key' | 'model';

const variablesOf = (document: DocumentJson): readonly AppVariable[] => document.app?.variables ?? [];

// the fields of the items a list holds, read from its first value that is an object (a list of tasks: id, text, done)
function itemFields(initial: JsonValue): readonly string[] {
  if (!Array.isArray(initial)) return [];
  const first = initial.find((one) => one !== null && typeof one === 'object' && !Array.isArray(one));
  return first === undefined ? [] : Object.keys(first as Record<string, JsonValue>);
}

// The repeat around an element (its own, or the nearest ancestor's): the name its item goes by and the fields of the
// items of the list it repeats, when that list is a variable of the application (state.tasks) or a script's function
// whose name matches one (fn.visible() repeats tasks: the fields of the only list variable stand for its items).
export function repeatAround(document: DocumentJson, id: NodeId, own: boolean): { readonly item: string; readonly fields: readonly string[]; readonly list: string | null } | null {
  let at = locate(document, id);
  let first = true;
  while (at !== null) {
    const logic = at.node.logic;
    if (logic?.each !== undefined && (own || !first)) {
      const each = logic.each.trim();
      const named = /^state\.([A-Za-z_$][\w$]*)$/u.exec(each)?.[1];
      const lists = variablesOf(document).filter((one) => one.type === 'list');
      const list = named === undefined ? (lists.length === 1 ? lists[0] : undefined) : lists.find((one) => one.name === named);
      return { item: logic.as ?? 'item', fields: list === undefined ? [] : itemFields(list.initial), list: list?.name ?? null };
    }
    first = false;
    at = at.parent === null ? null : locate(document, at.parent.id as NodeId);
  }
  return null;
}

export function logicChoices(document: DocumentJson, id: NodeId, field: ChoiceField, t: Translate): readonly Choice[] {
  const variables = variablesOf(document);
  const lists = variables.filter((one) => one.type === 'list');
  const functions = projectScope(document).functions;
  // inside a repeat (the element's own for every field but the list it repeats)
  const repeat = repeatAround(document, id, field !== 'each');
  const choices: Choice[] = [];
  const add = (value: string, label: string) => {
    if (!choices.some((one) => one.value === value)) choices.push({ value, label });
  };
  if (field === 'show') {
    add('', t('logic.pick.always'));
    if (repeat !== null) {
      for (const name of repeat.fields) {
        add(`${repeat.item}.${name}`, t('logic.pick.whenItemOn', { field: name }));
        add(`!${repeat.item}.${name}`, t('logic.pick.whenItemOff', { field: name }));
      }
    }
    for (const one of variables) {
      if (one.type === 'list') {
        add(`state.${one.name}.length > 0`, t('logic.pick.hasItems', { name: one.name }));
        add(`state.${one.name}.length === 0`, t('logic.pick.noItems', { name: one.name }));
      } else {
        add(`state.${one.name}`, t('logic.pick.whenOn', { name: one.name }));
        add(`!state.${one.name}`, t('logic.pick.whenOff', { name: one.name }));
      }
    }
    return choices;
  }
  add('', t('logic.pick.none'));
  if (field === 'each') {
    for (const one of lists) add(`state.${one.name}`, t('logic.pick.variable', { name: one.name }));
    for (const name of functions) add(`fn.${name}()`, t('logic.pick.function', { name: `${name}()` }));
    return choices;
  }
  if (field === 'key') {
    if (repeat !== null) for (const name of repeat.fields) add(`${repeat.item}.${name}`, t('logic.pick.itemField', { field: name }));
    return choices;
  }
  // text, html and the field a form control keeps
  if (repeat !== null) {
    if (field !== 'model') add(repeat.item, t('logic.pick.item'));
    for (const name of repeat.fields) add(`${repeat.item}.${name}`, t('logic.pick.itemField', { field: name }));
    if (field !== 'model') add('index + 1', t('logic.pick.position'));
  }
  for (const one of variables) {
    if (one.type === 'list') {
      if (field !== 'model') add(`state.${one.name}.length`, t('logic.pick.count', { name: one.name }));
    } else add(`state.${one.name}`, t('logic.pick.variable', { name: one.name }));
  }
  return choices;
}
