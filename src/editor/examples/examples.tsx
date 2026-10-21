// The example applications (spec app-logic): projects made only of the application layer — variables, element logic,
// scripts and code components — written by tools/gen/content/app-examples.py in English and in Portuguese. Each opens
// through project.open, its door's place giving the project's text, so opening one is opening a project like any other
// (a confirmation over a project with content, no undo), in the interface's language
// (src/editor/site-templates/project-texts.ts: loaded when a list of them is first drawn, retried when the load fails,
// and each opening a new project).
import type { ReactNode } from 'react';
import type { MessageId } from '../../generated/ids.ts';
import type { DoorEntry } from '../../manifest/runtime.ts';
import { DoorControl } from '../doors/door.tsx';
import { projectLanguageOf, projectTexts } from '../site-templates/project-texts.ts';
import { useLocale, useT } from '../text.ts';

// the order the lists show them in
export const EXAMPLES = ['todo', 'text-editor', 'spreadsheet', 'drawing', 'vector-editor', 'snake-game', 'simulator', 'community'] as const;

const useExampleTexts = projectTexts(import.meta.glob<string>('./*.json', { query: '?raw', import: 'default' }), EXAMPLES);

// One button per example, each the given door of project.open with the example's text as its file.
export function ExampleButtons({ entry, className }: { readonly entry: DoorEntry; readonly className: string }): ReactNode {
  const t = useT();
  const { texts, failed } = useExampleTexts(projectLanguageOf(useLocale()));
  return (
    <>
      <div className={className}>
        {EXAMPLES.map((id) => (
          <DoorControl key={id} entry={entry} args={{ file: texts?.[id] ?? '' }} label={t(`example.${id}` as MessageId)} ready={texts !== null} />
        ))}
      </div>
      {failed ? <p role="status">{t('start.examplesFailed')}</p> : null}
    </>
  );
}
