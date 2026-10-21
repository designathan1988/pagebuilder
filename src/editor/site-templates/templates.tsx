// The ready-made sites (spec site-templates): whole projects — pages linked by their menu, a theme, texts and photos —
// written by tools/gen/content/site-templates.test.ts. Each opens through project.open, its door's place giving the
// project's text, like the example applications (src/editor/examples/examples.tsx). Their texts load once, when the
// list is first drawn, and stay out of the editor's first bundle.
import { useEffect, useState, type ReactNode } from 'react';
import type { MessageId } from '../../generated/ids.ts';
import type { DoorEntry } from '../../manifest/runtime.ts';
import { DoorControl } from '../doors/door.tsx';
import { useT } from '../text.ts';

// the order the list shows them in
export const SITE_TEMPLATES = ['restaurant', 'store', 'agency', 'portfolio', 'blog', 'event', 'clinic', 'saas'] as const;

const SOURCES = import.meta.glob<string>('./*.json', { query: '?raw', import: 'default' });
let loaded: Promise<Readonly<Record<string, string>>> | null = null;
const loadAll = (): Promise<Readonly<Record<string, string>>> =>
  (loaded ??= Promise.all(SITE_TEMPLATES.map(async (id) => [id, await (SOURCES[`./${id}.json`] as () => Promise<string>)()] as const)).then((all) => Object.fromEntries(all)));

// One button per ready-made site, each the given door of project.open with the site's text as its file.
export function TemplateButtons({ entry, className }: { readonly entry: DoorEntry; readonly className: string }): ReactNode {
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
      {SITE_TEMPLATES.map((id) => (
        <DoorControl key={id} entry={entry} args={{ file: texts?.[id] ?? '' }} label={t(`template.${id}` as MessageId)} ready={texts !== null} />
      ))}
    </div>
  );
}
