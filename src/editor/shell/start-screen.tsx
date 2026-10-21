// The first look at an empty project: a card over the blank page that offers a whole landing page, or one ready
// section, each the Insert view's own tile (element.insert with its palette entry), so the person never starts at a
// white page with no idea what to do. Starting blank is the card's last line: the Insert view stays to the left. The
// card is drawn only while the project is the empty one (isEmptyProject): the first element placed takes it away.
import type { MessageId } from '../../generated/ids.ts';
import { isEmptyProject } from '../../core/document/model.ts';
import { isFeatureBuilt } from '../../core/commands/registry.ts';
import type { CommandId, FeatureId } from '../../generated/ids.ts';
import { manifest } from '../../manifest/runtime.ts';
import { DoorControl, Icon, useDoor } from '../doors/door.tsx';
import type { DispatchResult } from '../../core/store/store.ts';
import { assistantOf } from '../assistant/state.ts';
import { useEditorState, useStore } from '../store.ts';
import { useEffect, useRef } from 'react';
import { useT } from '../text.ts';
import { INSERT_TILE } from './sidebar/insert.tsx';
import { ExampleButtons } from '../examples/examples.tsx';
import { TemplateButtons } from '../site-templates/templates.tsx';
import { doorSlots } from '../doors/placement.ts';

// the whole landing page first, then the sections a page most often starts with
const OFFERED = ['section-landing', 'section-hero-split', 'section-features', 'section-pricing'];
// the door that opens an example application (spec app-logic)
const OPEN_EXAMPLE = doorSlots('start-examples')[0];
// the door that opens a ready-made site (spec site-templates)
const OPEN_TEMPLATE = doorSlots('start-templates')[0];
// the site the assistant makes from a description: the brief (the assistant's draft) and the button that opens it
const [AI_BRIEF, AI_OPEN] = doorSlots('start-ai');

// The description of the site, kept as the assistant's draft as it is typed: the Assistant opens with it, to send.
function BriefField({ entry }: { readonly entry: NonNullable<typeof AI_BRIEF> }) {
  const t = useT();
  const store = useStore();
  const draft = useEditorState((s) => assistantOf(s.ui).draft);
  const field = useRef<HTMLTextAreaElement>(null);
  const door = useDoor(entry, {}, t('start.ai.brief'));
  useEffect(() => {
    if (field.current && field.current.value !== draft) field.current.value = draft;
  }, [draft]);
  const keep = () => {
    if (field.current) (store.dispatch as (id: CommandId, args: unknown) => DispatchResult)(entry.command.id, { value: field.current.value });
  };
  return (
    <textarea
      ref={field}
      className="input start-screen__brief"
      data-door={entry.ref}
      rows={3}
      aria-label={t('start.ai.brief')}
      placeholder={t('start.ai.placeholder')}
      defaultValue={draft}
      disabled={!door.available}
      onInput={keep}
      onBlur={keep}
    />
  );
}
const ENTRIES = OFFERED.map((id) => manifest.elements.palette.flatMap((g) => g.entries).find((e) => e.id === id)).filter((e) => e !== undefined);

// `box`: the part of the blank page the stage shows, in the stage's pixels. Its top is the bottom of the frame's header
// (its breakpoint tabs and bands), so the tabs (glued to the frame's top, the owner's decision D-1) stay whole and in
// reach; its bottom and sides are the page's edges within the stage. The card's layer is that box, and the card scrolls
// when it is taller (data-own-scroll: the wheel scrolls it, pointer/tools.ts), so the card never hangs past the page.
export interface StartBox {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}
export function StartScreen({ box }: { readonly box: StartBox }) {
  const t = useT();
  const empty = useEditorState((s) => isEmptyProject(s.document));
  if (!empty) return null;
  const [landing, ...sections] = ENTRIES;
  const top = Math.max(0, box.top);
  return (
    <div className="start-screen" data-start-screen style={{ top, left: box.left, width: Math.max(0, box.right - box.left), height: Math.max(0, box.bottom - top) }}>
      <div className="start-screen__card" data-own-scroll>
        <h2 className="start-screen__title">{t('start.title')}</h2>
        <p className="start-screen__lead">{t('start.lead')}</p>
        {AI_BRIEF === undefined || AI_OPEN === undefined ? null : (
          <div className="start-screen__ai" data-region="start-ai">
            <p className="start-screen__ai-title">
              <Icon name="sparkles" />
              {t('start.ai.title')}
            </p>
            <BriefField entry={AI_BRIEF} />
            <DoorControl entry={AI_OPEN} className="door--primary start-screen__ai-open" />
          </div>
        )}
        {landing === undefined ? null : (
          <DoorControl entry={INSERT_TILE} args={{ entry: landing.id }} className="start-screen__landing" label={t(landing.labelKey as MessageId)} ready={isFeatureBuilt(landing.feature as FeatureId)}>
            <Icon name={landing.icon ?? 'layout-template'} />
            <span className="start-screen__landing-text">
              <span className="start-screen__landing-label">{t(landing.labelKey as MessageId)}</span>
              <span className="start-screen__landing-note">{t('start.landing.note')}</span>
            </span>
          </DoorControl>
        )}
        <p className="start-screen__or">{t('start.sections')}</p>
        <div className="start-screen__sections">
          {sections.map((e) => (
            <DoorControl key={e.id} entry={INSERT_TILE} args={{ entry: e.id }} className="start-screen__section" label={t(e.labelKey as MessageId)} ready={isFeatureBuilt(e.feature as FeatureId)}>
              <Icon name={e.icon ?? 'square'} />
              <span>{t(e.labelKey as MessageId)}</span>
            </DoorControl>
          ))}
        </div>
        {OPEN_TEMPLATE === undefined ? null : (
          <>
            <p className="start-screen__or">{t('start.templates')}</p>
            <TemplateButtons entry={OPEN_TEMPLATE} className="start-screen__examples" />
          </>
        )}
        {OPEN_EXAMPLE === undefined ? null : (
          <>
            <p className="start-screen__or">{t('start.examples')}</p>
            <ExampleButtons entry={OPEN_EXAMPLE} className="start-screen__examples" />
          </>
        )}
        <p className="start-screen__blank">{t('start.blank')}</p>
      </div>
    </div>
  );
}
