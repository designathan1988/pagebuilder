// A code door (spec app-logic): a field door of the application layer drawn as the code editor (code-editor.tsx),
// labelled by its door, standing for the arguments its place gives (data-args), and keeping its text in the argument
// `name` with one dispatch of the door's command when the editor keeps it.
import type { ReactNode } from 'react';
import { isFeatureBuilt } from '../../core/commands/registry.ts';
import type { CodeKind } from '../../core/logic/compile.ts';
import type { DispatchResult } from '../../core/store/store.ts';
import type { CommandId, FeatureId } from '../../generated/ids.ts';
import type { DoorEntry } from '../../manifest/runtime.ts';
import { useDoor } from '../doors/door.tsx';
import { useStore } from '../store.ts';
import { CodeEditor, type CodeScope } from './code-editor.tsx';

export function DoorCode({ entry, args, name, value, kind, scope, label, placeholder }: {
  readonly entry: DoorEntry;
  readonly args: Readonly<Record<string, unknown>>;
  readonly name: string;
  readonly value: string;
  readonly kind: CodeKind;
  readonly scope: CodeScope;
  readonly label?: string;
  readonly placeholder?: string;
}): ReactNode {
  const door = useDoor(entry, args, label, isFeatureBuilt(entry.door.feature as FeatureId));
  const store = useStore();
  const keep = (text: string) => {
    if (!door.available) return;
    (store.dispatch as (id: CommandId, a: unknown) => DispatchResult)(entry.command.id, { ...entry.door.args, ...args, [name]: text });
  };
  return (
    <div className="code-door" data-door={entry.ref} data-args={JSON.stringify(args)} title={door.title}>
      <CodeEditor value={value} kind={kind} scope={scope} onKeep={keep} label={door.label} disabled={!door.available} {...(placeholder === undefined ? {} : { placeholder })} />
    </div>
  );
}
