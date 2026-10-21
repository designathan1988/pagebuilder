// The example applications (spec app-logic): projects made only of the application layer — variables, element logic,
// scripts and code components — written by tools/gen/content/app-examples.py. Each opens through project.open, its
// door's place giving the project's text, so opening one is opening a project like any other (a confirmation over a
// project with content, no undo). Their texts load once, when a list of them is first drawn, and stay out of the
// editor's first bundle.
import { useEffect, useState, type ReactNode } from 'react';
import type { MessageId } from '../../generated/ids.ts';
import type { DoorEntry } from '../../manifest/runtime.ts';
import { DoorControl } from '../doors/door.tsx';
import { useT } from '../text.ts';

// the order the lists show them in
export const EXAMPLES = ['todo', 'text-editor', 'spreadsheet', 'drawing', 'vector-editor', 'snake-game', 'simulator', 'community'] as const;

const SOURCES = import.meta.glob<string>('./*.json', { query: '?raw', import: 'default' });
let loaded: Promise<Readonly<Record<string, string>>> | null = null;
const loadAll = (): Promise<Readonly<Record<string, string>>> =>
  (loaded ??= Promise.all(EXAMPLES.map(async (id) => [id, await (SOURCES[`./${id}.json`] as () => Promise<string>)()] as const)).then((all) => Object.fromEntries(all)));

// One button per example, each the given door of project.open with the example's text as its file.
export function ExampleButtons({ entry, className }: { readonly entry: DoorEntry; readonly className: string }): ReactNode {
  const t = useT();
  const [texts, setTexts] = useState<Readonly<Record<string, string>> | null>(null);
  useEffect(() => {
    let live = true;
    void loadAll().then((all) => {
      if (live) setTexts(all);
    });
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className={className}>
      {EXAMPLES.map((id) => (
        <DoorControl key={id} entry={entry} args={{ file: texts?.[id] ?? '' }} label={t(`example.${id}` as MessageId)} ready={texts !== null} />
      ))}
    </div>
  );
}
