// The motion part of the inspector's Interactions tab (plan stage 10, the canonical card "On click → Play
// animation": Applies to, Trigger, Action, Target, Options; spec motion-interactions, motion-behaviours): the selected
// element's interactions, one card each — the trigger and its options, the timeline it plays (any timeline of the
// project, reusable by name) and how it plays it, the class it applies to, once, delay, breakpoints, reduced motion —
// then the element's behaviours. Every control is a door of manifest/commands/motion.json drawn by the panel controls
// (PanelField, PanelButton), so a door whose feature is not built is drawn unavailable, and what a field shows in words
// it hands to its command as the value itself.
import { useState } from 'react';
import type { DocNode, DocumentJson } from '../../../core/document/model.ts';
import { breakpointsOf } from '../../../core/document/breakpoints.ts';
import { TRIGGERS, applicableTriggers, type TriggerCategory } from '../../../core/motion/catalog.ts';
import { behavioursOf, motionsOf, timelinesOf } from '../../../core/motion/document.ts';
import type { MotionInteraction } from '../../../core/motion/model.ts';
import { CONDITION_COMPARES, ELEMENT_STATES, PAGE_TRANSITION_ATTRIBUTE, PAGE_TRANSITION_KINDS, RUNTIME_BEHAVIOURS, STYLE_BEHAVIOURS } from '../../../core/motion/model.ts';
import type { MessageId } from '../../../generated/ids.ts';
import { manifest } from '../../../manifest/runtime.ts';
import { Icon } from '../../doors/door.tsx';
import { PanelButton, PanelField } from '../../shell/panel-field.tsx';
import { useEditorState } from '../../store.ts';
import { useT } from '../../text.ts';
import { MOTION_DOORS, motionDoor } from './doors.ts';
import { camel, controlsFor, interactionFields, interactionValue } from './options.ts';
import { DIRECTION } from '../../../core/motion/words.ts';
import { CONDITION_FORMS, ENTRY_TRIGGERS, MOTION_PRESETS, behaviourAxis, formOfCondition, type MotionPreset } from '../../../core/motion/commands.ts';
import { LINK_TRANSITIONS } from '../../../core/motion/document.ts';

type EntryTrigger = (typeof ENTRY_TRIGGERS)[number];

type Translate = ReturnType<typeof useT>;

// A typed text read as the value it names: the value itself, or its words, in any case (the card shows words).
const chosenOf =
  (offered: readonly string[], words: (value: string) => string) =>
  (typed: string): string => {
    const text = typed.trim().toLowerCase();
    return offered.find((value) => value.toLowerCase() === text || words(value).toLowerCase() === text) ?? typed.trim();
  };

const triggerWords = (t: Translate) => (kind: string): string => t(`motion.trigger.${camel(kind)}` as MessageId);
const CATEGORY_ORDER: readonly TriggerCategory[] = ['element', 'scroll', 'page', 'media', 'component'];

// the fields whose values are words of a list (the rest are typed)
function wordsOf(field: string, t: Translate): ((value: string) => string) | undefined {
  if (field === 'trigger') return triggerWords(t);
  if (field === 'control') return (value) => t(`motion.control.${value}` as MessageId);
  if (field === 'leave') return (value) => t(`motion.leave.${value}` as MessageId);
  if (field === 'reducedMotion') return (value) => t(`motion.reducedMotion.${value}` as MessageId);
  if (field === DIRECTION || field === 'axis' || field === 'state') return (value) => t(`motion.value.${camel(value)}` as MessageId);
  if (field === 'condition') return (value) => t(`motion.condition.form.${camel(value)}` as MessageId);
  if (field === 'conditionCompare') return (value) => t(`motion.condition.compare.${camel(value)}` as MessageId);
  return undefined;
}

// the words of a condition's name: a state by its words, anything else as it is named
const conditionNameWords = (t: Translate, interaction: MotionInteraction) =>
  interaction.condition?.kind === 'state' ? (value: string) => t(`motion.condition.state.${value}` as MessageId) : undefined;

function offeredFor(field: string, node: DocNode, interaction: MotionInteraction, timelines: readonly string[], document: DocumentJson): readonly string[] | undefined {
  if (field === 'condition') return CONDITION_FORMS;
  if (field === 'conditionCompare') return CONDITION_COMPARES;
  if (field === 'conditionName') {
    const kind = interaction.condition?.kind;
    if (kind === 'class') return [...new Set([...node.classes, ...(document.classes ?? []).map((one) => one.name)])];
    if (kind === 'breakpoint') return breakpointsOf(document).map((breakpoint) => breakpoint.id);
    if (kind === 'variable') return (document.app?.variables ?? []).map((variable) => variable.name);
    if (kind === 'state') return ELEMENT_STATES;
    return undefined;
  }
  if (field === 'trigger') {
    // grouped as the catalogue groups them: element, scrolling, page, media, components
    const applicable = applicableTriggers(node);
    return CATEGORY_ORDER.flatMap((category) => applicable.filter((kind) => TRIGGERS[kind].category === category));
  }
  if (field === 'timeline') return timelines;
  if (field === 'control') return controlsFor(interaction.trigger.kind);
  if (field === 'leave') return ['none', 'reverse', 'pause', 'reset'];
  if (field === 'scope') return ['', ...node.classes];
  if (field === 'reducedMotion') return ['respect', 'ignore'];
  if (field === 'breakpoints' || field === 'breakpoint') return manifest.properties.breakpoints.map((breakpoint) => breakpoint.id);
  if (field === DIRECTION) return ['down', 'up'];
  if (field === 'axis') return ['x', 'y'];
  if (field === 'state') return ['hidden', 'visible'];
  return undefined;
}

// what a field shows: the trigger's kind, a choice left at its default by that default's name, the rest as stored
function shown(interaction: MotionInteraction, field: string): string {
  if (field === 'trigger') return interaction.trigger.kind;
  if (field === 'reducedMotion') return interaction.reducedMotion ?? 'respect';
  if (field === 'leave') return interaction.leave ?? 'none';
  if (field === 'condition') return formOfCondition(interaction.condition);
  if (field === 'conditionName') return interaction.condition?.name ?? '';
  if (field === 'conditionCompare') return interaction.condition?.compare ?? 'set';
  if (field === 'conditionValue') return interaction.condition?.value ?? '';
  return interactionValue(interaction, field);
}

function Card({ node, interaction, index, timelines }: { readonly node: DocNode; readonly interaction: MotionInteraction; readonly index: number; readonly timelines: readonly string[] }) {
  const t = useT();
  const document = useEditorState((state) => state.document);
  const [expanded, setExpanded] = useState(index === 0);
  const args = { interaction: index };
  const field = (name: string) => {
    const words = name === 'conditionName' ? conditionNameWords(t, interaction) : wordsOf(name, t);
    const offered = offeredFor(name, node, interaction, timelines, document);
    return (
      <PanelField
        key={name}
        entry={motionDoor(MOTION_DOORS.field(name))}
        args={args}
        value={shown(interaction, name)}
        label={t(`motion.field.${name}` as MessageId)}
        offered={offered}
        {...(words === undefined ? {} : { display: words, accept: chosenOf(offered ?? [], words) })}
        {...(name === 'scope' ? { placeholder: t('motion.scope.element') } : name === 'breakpoints' ? { placeholder: t('motion.breakpoints.all') } : {})}
      />
    );
  };
  return (
    // drawn as the events' cards are (src/editor/shell/interactions.tsx; design/final .ix): one card anatomy in the tab
    <article className={`interaction-card motion-card${expanded ? ' is-expanded' : ''}`} data-motion-interaction={index}>
      <header className="interaction-card__head">
        <button className="interaction-card__summary" type="button" aria-expanded={expanded} onClick={() => setExpanded((was) => !was)}>
          <Icon name="sparkles" size="sm" />
          <span className="interaction-card__name">{triggerWords(t)(interaction.trigger.kind)}</span>
          <span className="interaction-card__action">→ {t('motion.card.plays', { timeline: interaction.timeline })}</span>
        </button>
        <PanelButton entry={motionDoor(MOTION_DOORS.remove)} args={args} label={t('command.motion.remove')} icon={<Icon name="trash" size="sm" />} />
      </header>
      {expanded ? (
        <div className="interaction-card__fields">
          {field('scope')}
          {field('trigger')}
          {interactionFields(interaction).map(field)}
          {field('timeline')}
          {field('control')}
          <div className="field-row">
            <span className="field-row__label">{t('motion.field.once')}</span>
            <PanelButton entry={motionDoor(MOTION_DOORS.once)} args={{ ...args, value: interaction.once !== true }} label={t('motion.field.once')} pressed={interaction.once === true} />
          </div>
          {field('delay')}
          {field('breakpoints')}
          {field('reducedMotion')}
          {/* runs only if: a class, the breakpoint, a variable of the application, the element's state */}
          {field('condition')}
          {interaction.condition === undefined ? null : field('conditionName')}
          {interaction.condition?.kind === 'variable' ? field('conditionCompare') : null}
          {interaction.condition?.kind === 'variable' && interaction.condition.compare !== 'set' && interaction.condition.compare !== 'unset' ? field('conditionValue') : null}
        </div>
      ) : (
        <p className="interaction-card__note">{interaction.scope === undefined ? t('motion.scope.element') : t('motion.scope.classCount', { class: `.${interaction.scope}` })}</p>
      )}
    </article>
  );
}

// The behaviours of the element: one button per behaviour, and each runtime behaviour it holds with its amount, its
// axis and its removal (sticky and scroll snap are plain CSS: their result shows in the Style tab).
function Behaviours({ node }: { readonly node: DocNode }) {
  const t = useT();
  const held = behavioursOf(node);
  return (
    <section className="motion-behaviours" aria-label={t('motion.behaviours.title')}>
      <p className="motion-behaviours__title">{t('motion.behaviours.title')}</p>
      <div className="motion-behaviours__add" role="group" aria-label={t('motion.behaviours.add')}>
        {[...STYLE_BEHAVIOURS, ...RUNTIME_BEHAVIOURS].map((kind) => (
          <PanelButton key={kind} entry={motionDoor(MOTION_DOORS.behaviour(kind))} args={{ behaviour: kind }} label={t(`motion.behaviour.${camel(kind)}` as MessageId)} />
        ))}
      </div>
      {held.map((behaviour) => (
        <div key={behaviour.kind} className="motion-behaviours__item" data-motion-behaviour={behaviour.kind}>
          <span className="motion-behaviours__name">{t(`motion.behaviour.${camel(behaviour.kind)}` as MessageId)}</span>
          {behaviour.kind === 'smooth-scroll' ? null : (
            /* the amount, and a parallax's range: where along its way across the screen it moves, and how far at most
               (empty: inside its parent's box); their labels in one column as wide as the longest */
            <div className="motion-behaviours__fields">
              <PanelField
                entry={motionDoor(MOTION_DOORS.behaviourAmount)}
                args={{ behaviour: behaviour.kind, axis: behaviourAxis(behaviour) }}
                value={String(behaviour.amount)}
                label={t(`motion.behaviour.amount.${camel(behaviour.kind)}` as MessageId)}
              />
              {behaviour.kind === 'parallax'
                ? (['start', 'end', 'max'] as const).map((field) => (
                    <PanelField
                      key={field}
                      entry={motionDoor(MOTION_DOORS.parallaxRange(field))}
                      value={field === 'max' ? (behaviour.max === undefined ? '' : String(behaviour.max)) : String(field === 'start' ? (behaviour.start ?? 0) : (behaviour.end ?? 100))}
                      label={t(`motion.parallax.${field}` as MessageId)}
                      {...(field === 'max' ? { placeholder: t('motion.parallax.maxAuto') } : {})}
                    />
                  ))
                : null}
            </div>
          )}
          {behaviour.kind === 'parallax' || behaviour.kind === 'marquee' ? (
            <div className="motion-behaviours__axis" role="group" aria-label={t('motion.field.axis')}>
              {(['x', 'y'] as const).map((axis) => (
                <PanelButton key={axis} entry={motionDoor(MOTION_DOORS.behaviourAxis(axis))} args={{ behaviour: behaviour.kind, axis }} label={t(`motion.axis.${axis}` as MessageId)} pressed={behaviourAxis(behaviour) === axis} />
              ))}
            </div>
          ) : null}
          <PanelButton entry={motionDoor(MOTION_DOORS.behaviourRemove)} args={{ behaviour: behaviour.kind }} label={t('command.motion.removeBehaviour')} icon={<Icon name="trash" size="sm" />} />
        </div>
      ))}
    </section>
  );
}

// The section the Interactions tab draws for motion, under the element it shows (src/editor/shell/interactions.tsx
// mounts it with the primary selected element).
const QUICK_EFFECTS = Object.keys(MOTION_PRESETS) as MotionPreset[];

export function MotionInteractions({ node }: { readonly node: DocNode | null }) {
  const t = useT();
  const document = useEditorState((state) => state.document);
  const single = useEditorState((state) => state.selection.length === 1);
  const interactions = node === null ? [] : motionsOf(node);
  const timelines = timelinesOf(document).map((timeline) => timeline.name);
  // when the entry effects play: as the element scrolls into view (the default) or as the page loads
  const [when, setWhen] = useState<EntryTrigger>(ENTRY_TRIGGERS[0]);
  return (
    <div className="motion-interactions">
      <div className="motion-interactions__head">
        <p className="interactions__title">{t('motion.section.title')}</p>
        <PanelButton entry={motionDoor(MOTION_DOORS.add)} label={t('command.motion.add')} icon={<Icon name="plus" size="sm" />} disabled={!single}>
          {t('inspector.addMotion')}
        </PanelButton>
      </div>
      {/* the entry effects: one click gives the element a complete timeline that brings it in as it scrolls into view
          or as the page loads (core/motion/commands.ts MOTION_PRESETS), the add door with its preset and trigger */}
      {node === null ? null : (
        <div className="motion-interactions__quick">
          <span className="motion-interactions__quick-title">{t('motion.quick.title')}</span>
          <span className="segmented segmented--wide motion-interactions__when" role="group" aria-label={t('motion.quick.when')}>
            {ENTRY_TRIGGERS.map((kind) => (
              <button key={kind} type="button" className={`door door--toggle${when === kind ? ' is-current' : ''}`} data-local={`motion-entry-${kind}`} aria-pressed={when === kind} onClick={() => setWhen(kind)}>
                <span className="door__label">{t(`motion.quick.when.${kind}` as MessageId)}</span>
              </button>
            ))}
          </span>
          {QUICK_EFFECTS.map((preset) => (
            <PanelButton
              key={preset}
              entry={motionDoor(MOTION_DOORS.add)}
              args={{ preset, trigger: when }}
              label={t('motion.quick.label', { effect: t(`motion.quick.${preset}` as MessageId), when: t(`motion.quick.when.${when}` as MessageId) })}
              disabled={!single}
            >
              {t(`motion.quick.${preset}` as MessageId)}
            </PanelButton>
          ))}
        </div>
      )}
      {node !== null && interactions.length === 0 ? <p className="motion-interactions__none">{t('motion.card.none')}</p> : null}
      {node === null ? null : interactions.map((interaction, index) => <Card key={interaction.id} node={node} interaction={interaction} index={index} timelines={timelines} />)}
      {node !== null ? <Behaviours node={node} /> : null}
      <PageTransitions node={node} />
    </div>
  );
}

// The transition between the site's pages (spec page-transitions): the site's kind and duration, and, on a link, the
// link's own choice (the site's, none, or a kind).
function PageTransitions({ node }: { readonly node: DocNode | null }) {
  const t = useT();
  const transition = useEditorState((state) => state.document.pageTransition);
  const kinds = ['none', ...PAGE_TRANSITION_KINDS];
  const kindWords = (value: string) => t(`motion.pageTransition.${value}` as MessageId);
  const linkChoices = ['', ...LINK_TRANSITIONS];
  const linkWords = (value: string) => t(`motion.linkTransition.${value === '' ? 'site' : value}` as MessageId);
  return (
    <section className="motion-behaviours motion-page-transitions" aria-label={t('motion.pageTransition.title')}>
      <p className="motion-behaviours__title">{t('motion.pageTransition.title')}</p>
      <div className="motion-page-transitions__fields">
        <PanelField entry={motionDoor(MOTION_DOORS.pageTransition)} value={transition?.kind ?? 'none'} label={t('motion.pageTransition.kind')} offered={kinds} display={kindWords} accept={chosenOf(kinds, kindWords)} />
        {transition === undefined ? null : <PanelField entry={motionDoor(MOTION_DOORS.pageTransitionDuration)} value={String(transition.duration / 1000)} label={t('motion.pageTransition.duration')} />}
        {node?.tag === 'a' ? (
          <PanelField
            entry={motionDoor(MOTION_DOORS.linkTransition)}
            value={node.customAttributes?.[PAGE_TRANSITION_ATTRIBUTE] ?? ''}
            label={t('motion.linkTransition.label')}
            offered={linkChoices}
            display={linkWords}
            accept={chosenOf(linkChoices, linkWords)}
          />
        ) : null}
      </div>
    </section>
  );
}
