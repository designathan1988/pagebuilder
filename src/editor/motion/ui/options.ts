// What the motion surfaces offer in each field (spec motion-interactions, motion-timeline): the options an action's
// effect shows by its kind, each with the values its field lists, and the words a value is shown in. Pure: the panels
// draw what these say, the commands (core/motion/commands.ts) read what a field hands.
import type { DocumentJson } from '../../../core/document/model.ts';
import { TRIGGERS, type TriggerKind } from '../../../core/motion/catalog.ts';
import { timelinesOf } from '../../../core/motion/document.ts';
import type { Effect, MotionInteraction } from '../../../core/motion/model.ts';
import { animationsOf } from '../../../core/animation/animation.ts';
import { walk } from '../../../core/document/model.ts';
import { BOTTOM, DISPLAY, SCALE, TOP, VISIBILITY } from '../../../core/motion/words.ts';

export type OptionField =
  | { readonly kind: 'choice'; readonly values: readonly string[] }
  | { readonly kind: 'text'; readonly suggestions?: readonly string[] }
  | { readonly kind: 'number' }
  | { readonly kind: 'time' }
  | { readonly kind: 'switch' };

const choice = (...values: string[]): OptionField => ({ kind: 'choice', values });
const PLAYBACK = choice('play', 'pause', 'restart', 'reverse', 'seek', 'toggle');

// a value as its catalogue key names it ("slide-up" → "slideUp", "open-modal" → "openModal")
export const camel = (value: string): string => value.replace(/-([a-z])/g, (_all, letter: string) => letter.toUpperCase());

// The options an effect shows, in the order its card lists them; some only in some of its forms (a seek's time, an
// address only for a URL or a page, a text only when copying a text).
export function effectOptions(effect: Effect, document: DocumentJson): readonly (readonly [string, OptionField])[] {
  const timelines = timelinesOf(document).map((timeline) => timeline.name);
  const animations = [...new Set(document.pages.flatMap((page) => [...walk(page.tree)].flatMap((node) => animationsOf(node).map((animation) => animation.name))))];
  const jsonFiles = (document.files ?? []).map((file) => file.path).filter((path) => /\.json$/i.test(path));
  switch (effect.kind) {
    case 'animate':
    case 'wait':
      return [];
    case 'class':
      return [['operation', choice('add', 'remove', 'toggle')], ['className', { kind: 'text' }]];
    case 'attribute':
      return [['name', { kind: 'text', suggestions: ['aria-expanded', 'aria-hidden', 'aria-pressed', 'aria-current', 'data-state', 'title'] }], ['value', { kind: 'text' }]];
    case 'style':
      return [['property', { kind: 'text' }], ['value', { kind: 'text' }]];
    case 'text':
      return [['value', { kind: 'text' }]];
    case DISPLAY:
      return [['operation', choice('show', 'hide', 'toggle')], ['transition', choice('none', 'fade', 'slide-up', 'slide-down', SCALE)], ['mode', choice('hidden', VISIBILITY)]];
    case 'timeline':
      return [['operation', PLAYBACK], ['timeline', { kind: 'text', suggestions: timelines }], ...(effect.operation === 'seek' ? [['time', { kind: 'time' }] as const] : [])];
    case 'css-animation':
      return [['operation', PLAYBACK], ['animation', { kind: 'text', suggestions: animations }], ...(effect.operation === 'seek' ? [['time', { kind: 'time' }] as const] : [])];
    case 'scroll':
      return [['to', choice('target', TOP, BOTTOM)], ['offset', { kind: 'number' }], ['smooth', { kind: 'switch' }], ['block', choice('start', 'center', 'end')]];
    case 'dialog':
      return [['operation', choice('open', 'open-modal', 'close', 'toggle')]];
    case 'details':
      return [['operation', choice('open', 'close', 'toggle')]];
    case 'tab':
      return [['index', { kind: 'number' }]];
    case 'slide':
      return [['operation', choice('next', 'previous', 'go')], ...(effect.operation === 'go' ? [['index', { kind: 'number' }] as const] : [])];
    case 'media':
      return [['operation', choice('play', 'pause', 'toggle', 'restart', 'mute', 'unmute', 'toggle-mute')]];
    case 'focus':
      return [['operation', choice('focus', 'blur')]];
    case 'form':
      return [['operation', choice('submit', 'reset')]];
    case 'navigate':
      return [
        ['to', choice('url', 'page', 'back', 'forward')],
        ...(effect.to === 'url' || effect.to === 'page' ? [['address', { kind: 'text', suggestions: effect.to === 'page' ? document.pages.map((page) => page.file) : [] }] as const] : []),
        ['newTab', { kind: 'switch' }],
      ];
    case 'clipboard':
      return [['source', choice('text', 'target-text')], ...(effect.source === 'text' ? [['text', { kind: 'text' }] as const] : [])];
    case 'event':
      return [['name', { kind: 'text' }], ['detail', { kind: 'text' }]];
    case 'variable':
      // a custom property of the target (the project's tokens offered), or a variable of the application layer
      return [
        ['scope', choice('css', 'app')],
        ['name', { kind: 'text', suggestions: effect.scope === 'app' ? (document.app?.variables ?? []).map((variable) => variable.name) : (document.tokens ?? []).map((token) => `--${token.name}`) }],
        ['value', { kind: 'text' }],
      ];
    case 'theme':
      return [['operation', choice('toggle', 'light', 'dark', 'system')], ['remember', { kind: 'switch' }]];
    case 'split-text':
      return [['by', choice('letter', 'word', 'line')]];
    case 'lottie':
      return [
        ['file', { kind: 'text', suggestions: jsonFiles }],
        ['operation', choice('play', 'pause', 'stop', 'seek', 'segment')],
        ['loop', { kind: 'switch' }],
        ['speed', { kind: 'number' }],
        ...(effect.operation === 'seek' || effect.operation === 'segment' ? [['from', { kind: 'number' }] as const] : []),
        ...(effect.operation === 'segment' ? [['to', { kind: 'number' }] as const] : []),
      ];
  }
}

// An option's value as its field shows it: a choice in words, a time in seconds, a switch as its state.
export function optionText(effect: Effect, option: string): string {
  const held = (effect as unknown as Record<string, unknown>)[option];
  if (option === 'scope' && effect.kind === 'variable') return effect.scope ?? 'css';
  if (held === undefined || held === null) return '';
  if (option === 'time' && typeof held === 'number') return String(held / 1000);
  return String(held);
}

// The controls an interaction offers for its trigger: a continuous one follows its progress and nothing else.
export function controlsFor(kind: string): readonly MotionInteraction['control'][] {
  const spec = (TRIGGERS as Record<string, (typeof TRIGGERS)[TriggerKind] | undefined>)[kind];
  return spec?.continuous === true ? ['scrub'] : ['play', 'restart', 'reverse', 'toggle', 'pause', 'stop'];
}

// The fields an interaction's card shows besides its own: the parameters its trigger reads, the leaving half of a
// paired trigger, the scroll range of a scroll progress trigger.
export function interactionFields(interaction: MotionInteraction): readonly string[] {
  const spec = (TRIGGERS as Record<string, (typeof TRIGGERS)[TriggerKind] | undefined>)[interaction.trigger.kind];
  const fields: string[] = [...(spec?.parameters ?? [])];
  if (spec?.paired === true) fields.unshift('leave');
  if (interaction.trigger.kind === 'while-visible' || interaction.trigger.kind === 'page-scroll') fields.push('scrollStart', 'scrollEnd');
  return fields;
}

// A field's value as the card shows it: a time in seconds, a list joined, the rest as it is.
export function interactionValue(interaction: MotionInteraction, field: string): string {
  const trigger = interaction.trigger as unknown as Record<string, unknown>;
  if (field in trigger && field !== 'kind') {
    const value = trigger[field];
    return field === 'milliseconds' && typeof value === 'number' ? String(value / 1000) : String(value ?? '');
  }
  const value = (interaction as unknown as Record<string, unknown>)[field];
  if (field === 'delay') return typeof value === 'number' ? String(value / 1000) : '0';
  if (Array.isArray(value)) return value.join(', ');
  return value === undefined ? '' : String(value);
}
