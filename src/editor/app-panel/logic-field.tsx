// A text door of the Logic tab (spec app-logic): an item's name, a binding's name, an event's name. Its typing is held
// in the one registry of typing (useKeptField, input/held-draft.ts; rules G1 and G2): a press elsewhere, a command from
// outside the field, a selection changed, Enter, the focus leaving it or the field going keep it, with one dispatch of
// the door's command for the element and the arguments the field stood for at the typing's first key, in that key's
// context, whatever the tab shows by then.
import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { isFeatureBuilt } from '../../core/commands/registry.ts';
import type { DispatchResult, EditContext } from '../../core/store/store.ts';
import type { CommandId, FeatureId } from '../../generated/ids.ts';
import type { DoorEntry } from '../../manifest/runtime.ts';
import { useDoor } from '../doors/door.tsx';
import { useKeptField } from '../shell/field.tsx';
import { useStore } from '../store.ts';

export function LogicTextField({ entry, args, name, value, target, label, className }: {
  readonly entry: DoorEntry;
  readonly args: Readonly<Record<string, unknown>>;
  readonly name: string;
  readonly value: string;
  // the element the field stands for: the command writes it, not the one selected when it runs
  readonly target: string;
  readonly label?: string;
  readonly className?: string;
}): ReactNode {
  const store = useStore();
  const door = useDoor(entry, args, label, isFeatureBuilt(entry.door.feature as FeatureId));
  // what the field stood for at the typing's first key
  const began = useRef<{ readonly args: Readonly<Record<string, unknown>>; readonly target: string; readonly from: string } | null>(null);
  const { input, region, onInput: typed, onBlur, onSubmit } = useKeptField(value, entry.command.id, null, (text, context) => {
    const at = began.current ?? { args, target, from: value };
    began.current = null;
    if (text === at.from) return;
    (store.dispatch as (id: CommandId, a: unknown, c?: EditContext) => DispatchResult)(entry.command.id, { ...entry.door.args, ...at.args, target: at.target, [name]: text }, context);
  });
  // the field shows the document again (useKeptField lets its typing go): the next key begins a new typing
  useEffect(() => {
    began.current = null;
  }, [value]);
  const onInput = (event: FormEvent<HTMLInputElement>) => {
    began.current ??= { args, target, from: value };
    typed(event);
  };
  return (
    <form ref={region} className={['data-field', className ?? ''].filter((one) => one !== '').join(' ')} data-door={entry.ref} data-args={JSON.stringify(args)} title={door.title} onSubmit={onSubmit}>
      <input ref={input} name={name} className="input" type="text" aria-label={door.label} disabled={!door.available} spellCheck={false} autoComplete="off" onInput={onInput} onBlur={onBlur} />
    </form>
  );
}
