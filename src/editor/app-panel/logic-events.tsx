// The Events of the Logic tab without code: each event of the element is a "when" (clicked, the form sent, a value
// changed…) and a list of actions in words, each removable, with a row that adds an action picked from lists (set a
// variable, add an item to a list, remove this item…). The actions are lines of the event's code (logic-actions.ts),
// kept through the event's own doors (logic.updateHandler); "Edit as code" shows the code for anything else.
import { useState, type ReactNode } from 'react';
import type { DocNode, DocumentJson } from '../../core/document/model.ts';
import type { AppHandler, AppVariable } from '../../core/logic/model.ts';
import type { DispatchResult } from '../../core/store/store.ts';
import type { CommandId, MessageId } from '../../generated/ids.ts';
import type { DoorEntry } from '../../manifest/runtime.ts';
import { DoorControl, Icon } from '../doors/door.tsx';
import { useStore } from '../store.ts';
import { useT, type Translate } from '../text.ts';
import { actionCode, actionOf, isHousekeeping, type Action, type ActionKind } from './logic-actions.ts';
import { projectScope } from './scope.ts';

const EVENTS = ['click', 'dblclick', 'submit', 'input', 'change', 'keydown', 'mouseenter', 'mouseleave', 'focus', 'blur', 'mount'] as const;
const OTHER_EVENT = '\u0000other';

export interface EventDoors {
  readonly add: DoorEntry | null;
  readonly event: DoorEntry | null;
  readonly code: DoorEntry | null;
  readonly remove: DoorEntry | null;
}

// the fields of the items a list variable holds (its first object item's keys)
function fieldsOf(list: AppVariable | undefined): readonly string[] {
  const items = Array.isArray(list?.initial) ? (list.initial as readonly unknown[]) : [];
  const first = items.find((one) => one !== null && typeof one === 'object' && !Array.isArray(one));
  return first === undefined ? [] : Object.keys(first as Record<string, unknown>);
}

export function actionWords(action: Action, t: Translate): string {
  const variable = action.variable ?? '';
  const value = action.value ?? '';
  switch (action.kind) {
    case 'set':
      return t('logic.action.set', { variable, value });
    case 'set-from-field':
      return t('logic.action.setFromField', { variable });
    case 'toggle':
      return t('logic.action.toggle', { variable });
    case 'increase':
      return t('logic.action.increase', { variable });
    case 'decrease':
      return t('logic.action.decrease', { variable });
    case 'clear':
      return t('logic.action.clear', { variable });
    case 'add-to-list':
      return t('logic.action.addToList', { variable, value });
    case 'remove-item':
      return t('logic.action.removeItem', { variable });
    case 'toggle-item-field':
      return t('logic.action.toggleItemField', { value });
    case 'remove-where':
      return t('logic.action.removeWhere', { variable, value });
    case 'call':
      return t('logic.action.call', { value });
    case 'go':
      return t('logic.action.go', { value });
    case 'toast':
      return t('logic.action.toast', { value });
  }
}

// The row that adds an action: what to do, then what it needs (a variable, a list, a value, a field, a function, a
// page, a message), and Add. Only the actions that apply are offered: the item's own actions inside a repeat, a
// list's actions while the project has a list, a function's while a script exports one.
function ActionPicker({ document, item, onAdd }: { readonly document: DocumentJson; readonly item: { readonly name: string; readonly list: string | null } | null; readonly onAdd: (line: string) => void }): ReactNode {
  const t = useT();
  const variables = document.app?.variables ?? [];
  const lists = variables.filter((one) => one.type === 'list');
  const plain = variables.filter((one) => one.type !== 'list');
  const functions = projectScope(document).functions;
  const pages = document.pages.map((page) => ({ value: page.file, label: page.name }));
  const [kind, setKind] = useState<ActionKind | ''>('');
  const [variable, setVariable] = useState('');
  const [value, setValue] = useState('');
  const kinds: ActionKind[] = [];
  if (plain.length > 0) kinds.push('set', 'set-from-field', 'toggle', 'increase', 'decrease');
  if (variables.length > 0) kinds.push('clear');
  if (lists.length > 0 && plain.length > 0) kinds.push('add-to-list');
  if (item !== null && lists.length > 0) kinds.push('remove-item');
  if (item !== null && item.list !== null && fieldsOf(lists.find((one) => one.name === item.list)).length > 0) kinds.push('toggle-item-field');
  if (lists.some((one) => fieldsOf(one).length > 0)) kinds.push('remove-where');
  if (functions.length > 0) kinds.push('call');
  kinds.push('go', 'toast');
  const chosen = (wanted: ActionKind | '') => {
    setKind(wanted);
    setValue('');
    // the first variable that fits, so Add works at once
    const fits = wanted === 'add-to-list' || wanted === 'remove-item' || wanted === 'remove-where' ? lists : wanted === 'clear' ? variables : plain;
    setVariable(wanted === 'remove-item' && item?.list != null ? item.list : (fits[0]?.name ?? ''));
    if (wanted === 'add-to-list') setValue(plain[0]?.name ?? '');
    if (wanted === 'toggle-item-field') setValue(fieldsOf(lists.find((one) => one.name === item?.list))[0] ?? '');
    if (wanted === 'remove-where') setValue(fieldsOf(lists.find((one) => one.name === (fits[0]?.name ?? '')))[0] ?? '');
    if (wanted === 'call') setValue(functions[0] ?? '');
    if (wanted === 'go') setValue(pages[0]?.value ?? '');
  };
  const select = (label: string, current: string, options: readonly { readonly value: string; readonly label: string }[], change: (next: string) => void) => (
    <label className="logic-pick__field">
      <span className="logic-pick__label">{label}</span>
      <select className="input" value={current} onChange={(event) => change(event.currentTarget.value)}>
        {options.map((one) => (
          <option key={one.value} value={one.value}>
            {one.label}
          </option>
        ))}
      </select>
    </label>
  );
  const names = (from: readonly AppVariable[]) => from.map((one) => ({ value: one.name, label: one.name }));
  const fieldOptions = (list: string) => fieldsOf(lists.find((one) => one.name === list)).map((one) => ({ value: one, label: one }));
  const needs = kind === '' ? null : kind;
  const ready =
    needs !== null &&
    (needs === 'go' || needs === 'toast' || needs === 'call' || needs === 'toggle-item-field' ? value !== '' : variable !== '') &&
    (needs !== 'add-to-list' && needs !== 'remove-where' ? true : value !== '');
  const add = () => {
    if (needs === null || !ready) return;
    const action: Action = { kind: needs, ...(variable === '' ? {} : { variable }), ...(value === '' && needs !== 'set' ? {} : { value }) };
    onAdd(actionCode(action, variables, item?.name ?? null));
    setKind('');
  };
  return (
    <div className="logic-pick">
      <select className="input logic-pick__kind" aria-label={t('logic.kind.choose')} value={kind} onChange={(event) => chosen(event.currentTarget.value as ActionKind | '')}>
        <option value="">{t('logic.kind.choose')}</option>
        {kinds.map((one) => (
          <option key={one} value={one}>
            {t(`logic.kind.${one}` as MessageId)}
          </option>
        ))}
      </select>
      {needs === 'set' || needs === 'set-from-field' || needs === 'toggle' || needs === 'increase' || needs === 'decrease' ? select(t('logic.events.variable'), variable, names(plain), setVariable) : null}
      {needs === 'clear' ? select(t('logic.events.variable'), variable, names(variables), setVariable) : null}
      {needs === 'set' ? (
        <label className="logic-pick__field">
          <span className="logic-pick__label">{t('logic.events.value')}</span>
          <input className="input" value={value} onChange={(event) => setValue(event.currentTarget.value)} spellCheck={false} />
        </label>
      ) : null}
      {needs === 'add-to-list' ? (
        <>
          {select(t('logic.events.list'), variable, names(lists), setVariable)}
          {select(t('logic.events.from'), value, names(plain), setValue)}
        </>
      ) : null}
      {needs === 'remove-item' ? select(t('logic.events.list'), variable, names(lists), setVariable) : null}
      {needs === 'toggle-item-field' ? select(t('logic.events.field'), value, fieldOptions(item?.list ?? ''), setValue) : null}
      {needs === 'remove-where' ? (
        <>
          {select(t('logic.events.list'), variable, names(lists.filter((one) => fieldsOf(one).length > 0)), (next) => {
            setVariable(next);
            setValue(fieldsOf(lists.find((one) => one.name === next))[0] ?? '');
          })}
          {select(t('logic.events.field'), value, fieldOptions(variable), setValue)}
        </>
      ) : null}
      {needs === 'call' ? select(t('logic.events.function'), value, functions.map((one) => ({ value: one, label: `${one}()` })), setValue) : null}
      {needs === 'go' ? select(t('logic.events.page'), value, pages, setValue) : null}
      {needs === 'toast' ? (
        <label className="logic-pick__field">
          <span className="logic-pick__label">{t('logic.events.message')}</span>
          <input className="input" value={value} onChange={(event) => setValue(event.currentTarget.value)} />
        </label>
      ) : null}
      {needs === null ? null : (
        <button type="button" className="door door--button logic-pick__add" disabled={!ready} onClick={add}>
          <Icon name="plus" size="sm" />
          <span className="door__label">{t('logic.events.addAction')}</span>
        </button>
      )}
    </div>
  );
}

function HandlerCard({ document, node, handler, index, item, doors, code }: {
  readonly document: DocumentJson;
  readonly node: DocNode;
  readonly handler: AppHandler;
  readonly index: number;
  readonly item: { readonly name: string; readonly list: string | null } | null;
  readonly doors: EventDoors;
  readonly code: ReactNode;
}): ReactNode {
  const t = useT();
  const store = useStore();
  const [asCode, setAsCode] = useState(false);
  const run = (entry: DoorEntry | null, args: Readonly<Record<string, unknown>>) => {
    if (entry === null) return;
    (store.dispatch as (id: CommandId, a: unknown) => DispatchResult)(entry.command.id as CommandId, { ...entry.door.args, ...args, handler: index, target: node.id });
  };
  const lines = handler.code.split('\n');
  const shown = lines.map((line, at) => ({ line, at })).filter(({ line }) => line.trim() !== '' && !isHousekeeping(line));
  const known = (EVENTS as readonly string[]).includes(handler.event);
  const keepLines = (next: readonly string[]) => run(doors.code, { code: next.filter((line) => line.trim() !== '').join('\n') });
  return (
    <div className="logic-handler">
      <div className="logic-handler__row">
        <select
          className="input logic-handler__when"
          aria-label={t('logic.event.label')}
          value={known ? handler.event : OTHER_EVENT}
          onChange={(event) => {
            const next = event.currentTarget.value;
            if (next !== OTHER_EVENT) run(doors.event, { event: next });
          }}
        >
          {EVENTS.map((one) => (
            <option key={one} value={one}>
              {t(`logic.event.${one}` as MessageId)}
            </option>
          ))}
          {known ? null : <option value={OTHER_EVENT}>{t('logic.event.custom', { event: handler.event })}</option>}
        </select>
        {doors.remove !== null ? <DoorControl entry={doors.remove} args={{ handler: index }} label={`${t('command.logic.removeHandler')} ${handler.event}`} /> : null}
      </div>
      <ul className="logic-actions">
        {shown.length === 0 ? <li className="logic-actions__none">{t('logic.events.noActions')}</li> : null}
        {shown.map(({ line, at }) => {
          const action = actionOf(line);
          return (
            <li key={at} className="logic-actions__item">
              <span className={action === null ? 'logic-actions__code' : 'logic-actions__words'}>{action === null ? t('logic.events.code', { code: line.trim() }) : actionWords(action, t)}</span>
              <button type="button" className="door door--icon-button door--sm" aria-label={t('logic.events.removeAction')} title={t('logic.events.removeAction')} onClick={() => keepLines(lines.filter((_line, other) => other !== at))}>
                <Icon name="x" size="sm" />
              </button>
            </li>
          );
        })}
      </ul>
      <ActionPicker document={document} item={item} onAdd={(line) => keepLines([...lines, line])} />
      <button type="button" className="logic-handler__code-toggle" onClick={() => setAsCode((was) => !was)}>
        {t(asCode ? 'logic.events.hideCode' : 'logic.events.editCode')}
      </button>
      {asCode ? code : null}
    </div>
  );
}

export function LogicEvents({ document, node, handlers, item, doors, codeOf }: {
  readonly document: DocumentJson;
  readonly node: DocNode;
  readonly handlers: readonly AppHandler[];
  readonly item: { readonly name: string; readonly list: string | null } | null;
  readonly doors: EventDoors;
  readonly codeOf: (index: number, handler: AppHandler) => ReactNode;
}): ReactNode {
  return (
    <>
      {handlers.map((handler, index) => (
        <HandlerCard key={index} document={document} node={node} handler={handler} index={index} item={item} doors={doors} code={codeOf(index, handler)} />
      ))}
      {doors.add !== null ? <DoorControl entry={doors.add} /> : null}
    </>
  );
}
