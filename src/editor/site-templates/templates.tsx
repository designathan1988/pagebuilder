// The ready-made sites (spec site-templates): whole projects — pages linked by their menu, a theme, texts and photos —
// written by tools/gen/content/site-templates.test.ts in English and in Portuguese. Each opens through project.open,
// its door's place giving the project's text, like the example applications (src/editor/examples/examples.tsx), in
// the interface's language (project-texts.ts: loaded when the list is first drawn, retried when the load fails, and
// each opening a new project).
import type { ReactNode } from 'react';
import type { MessageId } from '../../generated/ids.ts';
import type { DoorEntry } from '../../manifest/runtime.ts';
import { DoorControl } from '../doors/door.tsx';
import { useLocale, useT } from '../text.ts';
import { projectLanguageOf, projectTexts } from './project-texts.ts';

// the order the list shows them in
export const SITE_TEMPLATES = ['restaurant', 'store', 'agency', 'portfolio', 'blog', 'event', 'clinic', 'saas'] as const;

const useTemplateTexts = projectTexts(import.meta.glob<string>('./*.json', { query: '?raw', import: 'default' }), SITE_TEMPLATES);

// One button per ready-made site, each the given door of project.open with the site's text as its file.
export function TemplateButtons({ entry, className }: { readonly entry: DoorEntry; readonly className: string }): ReactNode {
  const t = useT();
  const { texts, failed } = useTemplateTexts(projectLanguageOf(useLocale()));
  return (
    <>
      <div className={className}>
        {SITE_TEMPLATES.map((id) => (
          <DoorControl key={id} entry={entry} args={{ file: texts?.[id] ?? '' }} label={t(`template.${id}` as MessageId)} ready={texts !== null} />
        ))}
      </div>
      {failed ? <p role="status">{t('start.templatesFailed')}</p> : null}
    </>
  );
}
