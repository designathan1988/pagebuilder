// The Bindings of the Logic tab without code: "when this holds, this style is that value" (or "this class is on"), in
// words, each removable, with a row that adds one picked from lists — a style of the inspector or a class of the
// project, the value, and the condition (the Show when list's own conditions). A binding written so reads back in
// words; any other stays code, edited as before.
import { useState, type ReactNode } from 'react';
import type { DocumentJson } from '../../core/document/model.ts';
import { classesOf } from '../../core/design/classes.ts';
import type { DispatchResult } from '../../core/store/store.ts';
import type { NodeId } from '../../generated/commands.ts';
import type { CommandId, MessageId } from '../../generated/ids.ts';
import { manifest, type DoorEntry } from '../../manifest/runtime.ts';
import { Icon } from '../doors/door.tsx';
import { useStore } from '../store.ts';
import { useT, type Translate } from '../text.ts';
import { logicChoices } from './logic-choices.ts';

// the styles a binding offers first: the ones an app changes with its state most
const STYLES = ['background-color', 'color', 'border-color', 'text-decoration', 'opacity', 'font-weight', 'display', 'visibility'] as const;
// the inspector's name of each property and composite (border-color, text-decoration are composites: read from the
// properties alone, they showed as CSS among the named ones)
const PROPERTY_WORDS = new Map<string, MessageId>([...manifest.properties.properties, ...manifest.properties.composites].map((property) => [property.id, property.labelKey as MessageId] as const));

const STRING = `(?:"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')`;
const unquote = (literal: string): string => (literal.startsWith("'") ? literal.slice(1, -1).replace(/\\'/gu, "'") : (JSON.parse(literal) as string));

// "condition ? 'value' : ''" — a style that holds a value while a condition holds
// what the To field takes, by the property chosen: the field stood empty, and a person who picked Opacity did not know
// whether it took 50%, 0.5 or "half"
const BIND_EXAMPLES: Readonly<Record<string, string>> = { 'background-color': '#2563eb', color: '#2563eb', 'border-color': '#2563eb', 'text-decoration': 'underline', opacity: '0.5', 'font-weight': '700', display: 'none', visibility: 'hidden' };

export function readStyleBinding(code: string): { readonly condition: string; readonly value: string } | null {
  const m = new RegExp(`^(.+?) \\? (${STRING}) : (?:''|"")$`, 'u').exec(code.trim());
  return m === null ? null : { condition: (m[1] as string).trim(), value: unquote(m[2] as string) };
}

const propertyWords = (binding: string, t: Translate): string => {
  const [kind, name = ''] = binding.split(':');
  if (kind === 'class') return t('logic.bind.class', { name });
  const key = PROPERTY_WORDS.get(name);
  return key === undefined ? name : t(key);
};

// the conditions a binding can hold under: the Show when list without "Always"
const conditionsOf = (document: DocumentJson, nodeId: string, t: Translate) => logicChoices(document, nodeId as NodeId, 'show', t).filter((one) => one.value !== '');

export function BindingRows({ document, nodeId, binds, door, codeRow, codeForm }: {
  readonly document: DocumentJson;
  readonly nodeId: string;
  readonly binds: readonly (readonly [string, string])[];
  readonly door: DoorEntry | null;
  readonly codeRow: (binding: string, code: string) => ReactNode;
  readonly codeForm: ReactNode;
}): ReactNode {
  const t = useT();
  const store = useStore();
  const conditions = conditionsOf(document, nodeId, t);
  const words = (condition: string) => conditions.find((one) => one.value === condition)?.label ?? condition;
  const run = (binding: string, value: string) => {
    if (door === null) return;
    (store.dispatch as (id: CommandId, a: unknown) => DispatchResult)(door.command.id as CommandId, { ...door.door.args, binding, value, target: nodeId });
  };
  const classes = classesOf(document).map((one) => one.name);
  const properties = [...STYLES.map((one) => ({ value: `style:${one}`, label: propertyWords(`style:${one}`, t) })), ...classes.map((name) => ({ value: `class:${name}`, label: t('logic.bind.class', { name }) }))];
  const [property, setProperty] = useState('');
  const [value, setValue] = useState('');
  const [condition, setCondition] = useState(conditions[0]?.value ?? '');
  const [asCode, setAsCode] = useState(false);
  const isClass = property.startsWith('class:');
  const ready = property !== '' && condition !== '' && (isClass || value.trim() !== '');
  const add = () => {
    if (!ready) return;
    run(property, isClass ? condition : `${condition} ? ${JSON.stringify(value.trim())} : ''`);
    setProperty('');
    setValue('');
  };
  return (
    <>
      <ul className="logic-actions">
        {binds.map(([binding, code]) => {
          const style = binding.startsWith('style:') ? readStyleBinding(code) : null;
          const known = style !== null || binding.startsWith('class:');
          if (!known) return <li key={binding} className="logic-actions__raw">{codeRow(binding, code)}</li>;
          return (
            <li key={binding} className="logic-actions__item">
              <span className="logic-actions__words">
                {style !== null
                  ? t('logic.bind.words', { condition: words(style.condition), property: propertyWords(binding, t), value: style.value })
                  : t('logic.bind.classOn', { condition: words(code.trim()), name: binding.slice('class:'.length) })}
              </span>
              <button type="button" className="door door--icon-button door--sm" aria-label={t('logic.bind.remove')} title={t('logic.bind.remove')} onClick={() => run(binding, '')}>
                <Icon name="x" size="sm" />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="logic-pick">
        <select className="input" aria-label={t('logic.bind.choose')} value={property} onChange={(event) => setProperty(event.currentTarget.value)}>
          <option value="">{t('logic.bind.choose')}</option>
          {properties.map((one) => (
            <option key={one.value} value={one.value}>
              {one.label}
            </option>
          ))}
        </select>
        {property !== '' && !isClass ? (
          <label className="logic-pick__field">
            <span className="logic-pick__label">{t('logic.bind.value')}</span>
            <input className="input" value={value} onChange={(event) => setValue(event.currentTarget.value)} spellCheck={false} placeholder={t('logic.bind.example', { value: BIND_EXAMPLES[property.slice('style:'.length)] ?? '' })} />
          </label>
        ) : null}
        {property !== '' ? (
          <label className="logic-pick__field">
            <span className="logic-pick__label">{t('logic.bind.when')}</span>
            <select className="input" value={condition} onChange={(event) => setCondition(event.currentTarget.value)}>
              {conditions.map((one) => (
                <option key={one.value} value={one.value}>
                  {one.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {property !== '' ? (
          <button type="button" className="door door--button logic-pick__add" disabled={!ready} onClick={add}>
            <Icon name="plus" size="sm" />
            <span className="door__label">{t('logic.bind.add')}</span>
          </button>
        ) : null}
      </div>
      <button type="button" className="logic-handler__code-toggle" onClick={() => setAsCode((was) => !was)}>
        {t(asCode ? 'logic.bind.hideCode' : 'logic.bind.asCode')}
      </button>
      {asCode ? codeForm : null}
    </>
  );
}
