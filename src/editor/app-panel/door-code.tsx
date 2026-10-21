// A code door (spec app-logic): a field door of the application layer drawn as the code editor (code-editor.tsx),
// labelled by its door, standing for the arguments its place gives (data-args), and keeping its text in the argument
// `name` with one dispatch of the door's command when the editor keeps it: with the arguments, the element (`target`)
// and the context of the typing's first key (rules G1 and G2), whatever the editor shows by then.
import type { ReactNode } from 'react';
import { isFeatureBuilt } from '../../core/commands/registry.ts';
import type { CodeKind } from '../../core/logic/compile.ts';
import type { DispatchResult, EditContext } from '../../core/store/store.ts';
import type { CommandId, FeatureId } from '../../generated/ids.ts';
import type { DoorEntry } from '../../manifest/runtime.ts';
import { useDoor } from '../doors/door.tsx';
import { useStore } from '../store.ts';
import { CodeEditor, type CodeScope } from './code-editor.tsx';

export function DoorCode({ entry, args, name, value, kind, scope, label, placeholder, target }: {
  readonly entry: DoorEntry;
  readonly args: Readonly<Record<string, unknown>>;
  readonly name: string;
  readonly value: string;
  readonly kind: CodeKind;
  readonly scope: CodeScope;
  readonly label?: string;
  readonly placeholder?: string;
  // the element the field stands for (a logic.* door): the command writes it, not the one selected when it runs
  readonly target?: string;
}): ReactNode {
  const door = useDoor(entry, args, label, isFeatureBuilt(entry.door.feature as FeatureId));
  const store = useStore();
  // the store refuses an unavailable command with its own words: the typing is never dropped here
  const keep = (text: string, context: EditContext) =>
    void (store.dispatch as (id: CommandId, a: unknown, c?: EditContext) => DispatchResult)(entry.command.id, { ...entry.door.args, ...args, ...(target === undefined ? {} : { target }), [name]: text }, context);
  return (
    <div className="code-door" data-door={entry.ref} data-args={JSON.stringify(args)} title={door.title}>
      <CodeEditor value={value} kind={kind} scope={scope} command={entry.command.id} onKeep={keep} label={door.label} disabled={!door.available} {...(placeholder === undefined ? {} : { placeholder })} />
    </div>
  );
}
