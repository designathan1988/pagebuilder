import { describe, expect, it } from 'vitest';
import type { HandlerContext, Outcome } from '../commands/registry.ts';
import type { DocNode, DocumentJson } from '../document/model.ts';
import { documentOf, node, runHandler, type Ran } from '../testing/handlers.ts';
import { setStyleCommand } from '../style/set.ts';
import { sequentialIds } from '../ports/ids.ts';
import {
  addActionCommand,
  addMarkerCommand,
  addMotionCommand,
  createTimelineCommand,
  deleteKeyframesCommand,
  deleteTimelineCommand,
  editKeyframeCommand,
  moveActionsCommand,
  moveKeyframesCommand,
  moveMarkerCommand,
  pasteKeyframesCommand,
  readTime,
  removeActionsCommand,
  removeBehaviourCommand,
  removeMarkerCommand,
  removeMotionCommand,
  renameMarkerCommand,
  renameTimelineCommand,
  resizeActionCommand,
  setBehaviourCommand,
  setEffectOptionCommand,
  setKeyframeCommand,
  updateActionCommand,
  updateMotionCommand,
} from './commands.ts';
import type { MotionEditorContext } from './record.ts';

// a record without its generated id, for comparing what a command made
const withoutId = <T extends { readonly id: string }>(record: T): Omit<T, 'id'> => Object.fromEntries(Object.entries(record).filter(([name]) => name !== 'id')) as Omit<T, 'id'>;

// A page with an element of each kind the triggers read.
function page(extra: Partial<DocumentJson> = {}): DocumentJson {
  return documentOf({
    pages: [
      {
        id: 'p',
        name: 'Home',
        file: 'index.html',
        tree: node('root', 'page', 'body', {
          name: 'Page',
          children: [
            node('hero', 'section', 'section', { name: 'Hero', styles: { desktop: { base: { 'padding-top': '56px' } } }, children: [node('intro', 'paragraph', 'p', { name: 'Intro', text: 'Hi' })] }),
            node('cards', 'div', 'div', { name: 'Cards', children: [node('card-a', 'article', 'article', { name: 'CardA', classes: ['card'] }), node('card-b', 'article', 'article', { name: 'CardB', classes: ['card'] })] }),
            node('signup', 'form', 'form', { name: 'Signup', children: [node('email', 'input', 'input', { name: 'Email' })] }),
            node('locked', 'div', 'div', { name: 'Locked', locked: true }),
          ],
        }),
      },
    ],
    ...extra,
  });
}

type Handler = { run(context: HandlerContext<never>, args: never): Outcome<never> };
// one generator for every command of a test, as the store keeps one for the session: ids never repeat
const ids = sequentialIds('m');
const withIds = (handler: Handler): Handler => ({ run: (context, args) => handler.run({ ...context, ids }, args) });
// runs a sequence of commands, each on the document the last one left, the run checked against the model each time
type Step = readonly [Handler, Record<string, unknown>, (readonly string[])?];
function chain(document: DocumentJson, steps: readonly Step[]): Ran {
  let ran: Ran = { outcome: { kind: 'change' }, document, problems: [] };
  for (const [handler, args, selection] of steps) {
    ran = runHandler(withIds(handler), ran.document, args, { selection: selection ?? ['hero'] });
    expect(ran.problems, JSON.stringify(ran.outcome)).toEqual([]);
  }
  return ran;
}
const said = (ran: Ran): string | null => (ran.outcome.kind === 'change' || ran.outcome.kind === 'refused' ? (ran.outcome.message?.key ?? null) : null);
const hero = (document: DocumentJson): DocNode => document.pages[0]?.tree.children[0] as DocNode;
const firstTimeline = (document: DocumentJson) => document.motionTimelines?.[0];
// an editor with its Timeline's playhead at a time, for the commands that act at the playhead
const atPlayhead = (handler: Handler, time: number, recording: MotionEditorContext['recording'] = null): Handler => ({ run: (context, args) => handler.run({ ...context, ids, motion: { playhead: time, recording } }, args) });
const PICK = updateActionCommand<never>({ makePicking: (ui) => ui, makePicked: (ui) => ui });

describe('interactions', () => {
  it('adds an interaction playing a new timeline named after the element and its trigger', () => {
    const ran = chain(page(), [[addMotionCommand, {}]]);
    expect(said(ran)).toBe('status.motion.added');
    expect(hero(ran.document).motions?.map(withoutId)).toEqual([{ trigger: { kind: 'click' }, timeline: 'Hero click', control: 'play' }]);
    expect(firstTimeline(ran.document)).toMatchObject({ name: 'Hero click', markers: [], actions: [{ target: { kind: 'self' }, start: 0, duration: 600, easing: 'ease-out', effect: { kind: 'animate', tracks: [] } }] });
  });

  it('reuses a timeline by name, and refuses a name the project lacks', () => {
    const made = chain(page(), [[createTimelineCommand, { name: 'Fade in' }]]);
    const reused = chain(made.document, [[addMotionCommand, { timeline: 'Fade in' }]]);
    expect(reused.document.motionTimelines?.map((one) => one.name)).toEqual(['Fade in']);
    expect(hero(reused.document).motions?.[0]?.timeline).toBe('Fade in');
    expect(said(runHandler(addMotionCommand, page(), { timeline: 'Nope' }, { selection: ['hero'] }))).toBe('status.motion.notFound');
  });

  it('starts a paired trigger reversing on leave, a continuous one scrubbing', () => {
    const hover = chain(page(), [[addMotionCommand, { trigger: 'hover' }]]);
    expect(hero(hover.document).motions?.[0]).toMatchObject({ trigger: { kind: 'hover' }, control: 'play', leave: 'reverse' });
    const scroll = chain(page(), [[addMotionCommand, { trigger: 'page-scroll' }]]);
    expect(hero(scroll.document).motions?.[0]).toMatchObject({ trigger: { kind: 'page-scroll' }, control: 'scrub' });
  });

  it('gives a quick effect: the element enters as it scrolls into view, once, keyed from hidden to shown', () => {
    const ran = chain(page(), [[addMotionCommand, { preset: 'fade-up' }]]);
    expect(hero(ran.document).motions?.[0]).toMatchObject({ trigger: { kind: 'scroll-into-view' }, control: 'play', leave: 'none', once: true });
    const action = firstTimeline(ran.document)?.actions[0];
    expect(action).toMatchObject({ target: { kind: 'self' }, start: 0, duration: 700 });
    const tracks = action?.effect.kind === 'animate' ? action.effect.tracks : [];
    expect(tracks.map((track) => [track.property, ...track.keyframes.map((key) => `${String(key.time)}:${key.value}`)])).toEqual([
      ['opacity', '0:0', '700:1'],
      ['translate-y', '0:32px', '700:0px'],
    ]);
    // another trigger asked for with the preset is kept
    expect(hero(chain(page(), [[addMotionCommand, { preset: 'zoom-in', trigger: 'hover' }]]).document).motions?.[0]?.trigger).toEqual({ kind: 'hover' });
  });

  it('refuses a trigger that cannot apply, and a locked element', () => {
    expect(said(runHandler(addMotionCommand, page(), { trigger: 'form-submit' }, { selection: ['hero'] }))).toBe('status.motion.notApplicable');
    expect(chain(page(), [[addMotionCommand, { trigger: 'form-submit' }, ['signup']]]).document.pages[0]?.tree.children[2]?.motions?.[0]?.trigger).toEqual({ kind: 'form-submit' });
    expect(said(runHandler(addMotionCommand, page(), {}, { selection: ['locked'] }))).toBe('status.locked.edit');
  });

  it('changes each field from what a field hands', () => {
    const added = chain(page(), [[addMotionCommand, {}], [createTimelineCommand, { name: 'Other' }]]);
    const update = (field: string, value: unknown) => chain(added.document, [[updateMotionCommand, { interaction: 0, field, value }]]);
    expect(hero(update('trigger', 'pointer-move').document).motions?.[0]).toMatchObject({ trigger: { kind: 'pointer-move', axis: 'x' }, control: 'scrub' });
    expect(hero(update('timeline', 'Other').document).motions?.[0]?.timeline).toBe('Other');
    expect(hero(update('control', 'toggle').document).motions?.[0]?.control).toBe('toggle');
    expect(hero(update('delay', '0.25').document).motions?.[0]?.delay).toBe(250);
    expect(hero(update('breakpoints', 'tablet, phone').document).motions?.[0]?.breakpoints).toEqual(['tablet', 'phone']);
    expect(hero(update('reducedMotion', 'ignore').document).motions?.[0]?.reducedMotion).toBe('ignore');
    expect(hero(update('once', 'true').document).motions?.[0]?.once).toBe(true);
    // a choice back to its default leaves the field out
    const delayed = update('delay', '0.25').document;
    expect(hero(chain(delayed, [[updateMotionCommand, { interaction: 0, field: 'delay', value: '0' }]]).document).motions?.[0]?.delay).toBeUndefined();
  });

  it('changes a trigger option only on a trigger that reads it, and keeps the leave of a paired trigger', () => {
    const hover = chain(page(), [[addMotionCommand, {}], [updateMotionCommand, { interaction: 0, field: 'trigger', value: 'hover' }], [updateMotionCommand, { interaction: 0, field: 'leave', value: 'reset' }]]);
    expect(hero(hover.document).motions?.[0]).toMatchObject({ trigger: { kind: 'hover' }, leave: 'reset' });
    // a trigger with no second half drops its leave
    const click = chain(hover.document, [[updateMotionCommand, { interaction: 0, field: 'trigger', value: 'click' }]]);
    expect(hero(click.document).motions?.[0]?.leave).toBeUndefined();
    expect(said(runHandler(updateMotionCommand, click.document, { interaction: 0, field: 'key', value: 'k' }, { selection: ['hero'] }))).toBe('status.motion.invalid');
    const timer = chain(click.document, [[updateMotionCommand, { interaction: 0, field: 'trigger', value: 'timer' }], [updateMotionCommand, { interaction: 0, field: 'milliseconds', value: '1.5' }]]);
    expect(hero(timer.document).motions?.[0]?.trigger).toEqual({ kind: 'timer', milliseconds: 1500 });
    const visible = chain(click.document, [[updateMotionCommand, { interaction: 0, field: 'trigger', value: 'while-visible' }], [updateMotionCommand, { interaction: 0, field: 'scrollEnd', value: '75%' }]]);
    expect(hero(visible.document).motions?.[0]).toMatchObject({ control: 'scrub', scrollStart: 0, scrollEnd: 75 });
  });

  it('applies to every element of a class of the element, and refuses what is no class name', () => {
    const scoped = chain(page(), [[addMotionCommand, {}, ['card-a']], [updateMotionCommand, { interaction: 0, field: 'scope', value: 'card' }, ['card-a']]]);
    expect(scoped.document.pages[0]?.tree.children[1]?.children[0]?.motions?.[0]?.scope).toBe('card');
    expect(said(runHandler(updateMotionCommand, scoped.document, { interaction: 0, field: 'scope', value: '.card' }, { selection: ['card-a'] }))).toBe('status.motion.invalid');
  });

  it('removes an interaction and keeps its timeline', () => {
    const removed = chain(page(), [[addMotionCommand, {}], [removeMotionCommand, { interaction: 0 }]]);
    expect(hero(removed.document).motions).toBeUndefined();
    expect(removed.document.motionTimelines?.map((one) => one.name)).toEqual(['Hero click']);
  });
});

describe('timelines', () => {
  it('makes, renames and deletes a timeline, refusing a taken or unreadable name and one still played', () => {
    const made = chain(page(), [[createTimelineCommand, {}], [createTimelineCommand, {}]]);
    expect(made.document.motionTimelines?.map((one) => one.name)).toEqual(['motion.timeline.defaultName', 'motion.timeline.defaultName 2']);
    expect(said(runHandler(createTimelineCommand, made.document, { name: 'motion.timeline.defaultName' }))).toBe('status.motion.nameTaken');
    expect(said(runHandler(createTimelineCommand, made.document, { name: '#nope' }))).toBe('status.motion.nameInvalid');
    const played = chain(page(), [[addMotionCommand, {}]]);
    const renamed = chain(played.document, [[renameTimelineCommand, { timeline: 'Hero click', name: 'Hero intro' }]]);
    expect(hero(renamed.document).motions?.[0]?.timeline).toBe('Hero intro');
    expect(said(runHandler(deleteTimelineCommand, renamed.document, { timeline: 'Hero intro' }))).toBe('status.motion.timelineInUse');
    const unused = chain(page(), [[createTimelineCommand, { name: 'Spare' }], [deleteTimelineCommand, { timeline: 'Spare' }]]);
    expect(unused.document.motionTimelines).toBeUndefined();
  });
});

describe('actions', () => {
  const played = () => chain(page(), [[addMotionCommand, {}]]);

  it('adds an action after, with or at the playhead', () => {
    const after = chain(played().document, [[addActionCommand, { timeline: 'Hero click', kind: 'wait' }]]);
    expect(firstTimeline(after.document)?.actions[1]).toMatchObject({ start: 600, duration: 500, effect: { kind: 'wait' } });
    const together = chain(played().document, [[addActionCommand, { timeline: 'Hero click', kind: 'display', placement: 'with' }]]);
    expect(firstTimeline(together.document)?.actions[1]).toMatchObject({ start: 0, duration: 300, effect: { kind: 'display', operation: 'toggle', transition: 'fade', mode: 'hidden' } });
    const ran = runHandler(atPlayhead(addActionCommand, 1800), played().document, { timeline: 'Hero click', kind: 'event', placement: 'at' }, { selection: ['hero'] });
    expect(firstTimeline(ran.document)?.actions[1]).toMatchObject({ start: 1800, duration: 0, effect: { kind: 'event', name: 'custom-event' } });
  });

  it('changes an action by its fields, by id or by its place', () => {
    const base = played().document;
    const update = (field: string, value: unknown) => chain(base, [[PICK, { timeline: 'Hero click', at: 0, field, value }]]).document;
    expect(firstTimeline(update('start', '1.5'))?.actions[0]?.start).toBe(1500);
    expect(firstTimeline(update('duration', 1200))?.actions[0]?.duration).toBe(1200);
    expect(firstTimeline(update('easing', 'steps(4)'))?.actions[0]?.easing).toBe('steps(4)');
    expect(firstTimeline(update('repeat', 'infinite'))?.actions[0]?.repeat).toBe('infinite');
    expect(firstTimeline(update('yoyo', true))?.actions[0]?.yoyo).toBe(true);
    expect(firstTimeline(update('staggerEach', '0.08'))?.actions[0]?.stagger).toEqual({ each: 80, from: 'start' });
    expect(firstTimeline(update('target', 'siblings'))?.actions[0]?.target).toEqual({ kind: 'siblings' });
    expect(firstTimeline(update('target', { kind: 'element', node: 'intro' }))?.actions[0]?.target).toEqual({ kind: 'element', node: 'intro' });
    expect(firstTimeline(update('kind', 'class'))?.actions[0]).toMatchObject({ duration: 0, effect: { kind: 'class', operation: 'toggle', className: 'is-active' } });
    expect(said(runHandler(PICK, base, { timeline: 'Hero click', at: 0, field: 'target', value: { kind: 'element', node: 'gone' } }, { selection: ['hero'] }))).toBe('status.motion.invalid');
    // a class target takes the selected element's first class, or says it needs one
    expect(said(runHandler(PICK, base, { timeline: 'Hero click', at: 0, field: 'target', value: 'class' }, { selection: ['hero'] }))).toBe('status.motion.needsClass');
    expect(firstTimeline(chain(base, [[PICK, { timeline: 'Hero click', at: 0, field: 'target', value: 'class' }, ['card-a']]]).document)?.actions[0]?.target).toEqual({ kind: 'class', className: 'card' });
  });

  it('sets an option of an effect, reading booleans and numbers, an address through its one rule', () => {
    const navigate = chain(played().document, [[addActionCommand, { timeline: 'Hero click', kind: 'navigate' }]]).document;
    const option = (option: string, value: unknown, document = navigate) => runHandler(setEffectOptionCommand, document, { timeline: 'Hero click', at: 1, option, value }, { selection: ['hero'] });
    expect(firstTimeline(option('address', 'example.com/about').document)?.actions[1]?.effect).toEqual({ kind: 'navigate', to: 'url', address: 'https://example.com/about', newTab: false });
    expect(said(option('address', 'javascript:alert(1)'))).toBe('status.url.unsafe');
    expect(firstTimeline(option('newTab', 'true').document)?.actions[1]?.effect).toMatchObject({ newTab: true });
    expect(firstTimeline(option('to', 'back').document)?.actions[1]?.effect).toEqual({ kind: 'navigate', to: 'back', newTab: false });
    expect(said(option('nope', 'x'))).toBe('status.motion.notAnOption');
    const slide = chain(played().document, [[addActionCommand, { timeline: 'Hero click', kind: 'slide' }]]).document;
    expect(firstTimeline(option('operation', 'go', slide).document)?.actions[1]?.effect).toEqual({ kind: 'slide', operation: 'go', index: 0 });
    const control = chain(played().document, [[addActionCommand, { timeline: 'Hero click', kind: 'timeline' }]]).document;
    expect(said(option('timeline', 'Hero click', control))).toBe('status.motion.notFound');
  });

  it('removes, moves and resizes bars', () => {
    const two = chain(played().document, [[addActionCommand, { timeline: 'Hero click', kind: 'wait' }]]).document;
    expect(firstTimeline(chain(two, [[removeActionsCommand, { timeline: 'Hero click', at: 0 }]]).document)?.actions.map((one) => one.effect.kind)).toEqual(['wait']);
    const ids = firstTimeline(two)?.actions.map((one) => one.id) ?? [];
    expect(firstTimeline(chain(two, [[moveActionsCommand, { timeline: 'Hero click', actions: ids, delta: 250 }]]).document)?.actions.map((one) => one.start)).toEqual([250, 850]);
    // a drag with no delta reads its travel at the Timeline's first zoom (200 px a second)
    expect(firstTimeline(chain(two, [[moveActionsCommand, { timeline: 'Hero click', at: 1, distance: 40 }]]).document)?.actions[1]?.start).toBe(800);
    expect(firstTimeline(chain(two, [[resizeActionCommand, { timeline: 'Hero click', at: 0, edge: 'end', delta: 400 }]]).document)?.actions[0]?.duration).toBe(1000);
    const instant = chain(played().document, [[addActionCommand, { timeline: 'Hero click', kind: 'class' }]]).document;
    expect(said(runHandler(resizeActionCommand, instant, { timeline: 'Hero click', at: 1, edge: 'end', delta: 100 }))).toBe('status.motion.instant');
  });
});

describe('keyframes', () => {
  const keyed = () => chain(page(), [[addMotionCommand, {}], [setKeyframeCommand, { timeline: 'Hero click', at: 0, property: 'opacity', value: '0' }]]);

  it('animates a property from its initial value or a typed one, at the playhead, growing the action to hold it', () => {
    const initial = chain(page(), [[addMotionCommand, {}], [setKeyframeCommand, { timeline: 'Hero click', at: 0, property: 'opacity', value: '' }]]);
    expect(firstTimeline(initial.document)?.actions[0]?.effect).toMatchObject({ tracks: [{ property: 'opacity', keyframes: [{ time: 0, value: '1' }] }] });
    const part = chain(page(), [[addMotionCommand, {}], [setKeyframeCommand, { timeline: 'Hero click', at: 0, property: 'rotate-z', value: '' }]]);
    expect(firstTimeline(part.document)?.actions[0]?.effect).toMatchObject({ tracks: [{ property: 'rotate-z', keyframes: [{ time: 0, value: '0deg' }] }] });
    const later = runHandler(atPlayhead(setKeyframeCommand, 900), keyed().document, { timeline: 'Hero click', at: 0, property: 'opacity', value: '' }, { selection: ['hero'] });
    expect(later.problems).toEqual([]);
    expect(firstTimeline(later.document)?.actions[0]).toMatchObject({ duration: 900, effect: { tracks: [{ keyframes: [{ time: 0, value: '0' }, { time: 900, value: '0' }] }] } });
    const instant = chain(page(), [[addMotionCommand, {}], [addActionCommand, { timeline: 'Hero click', kind: 'class' }]]).document;
    expect(said(runHandler(setKeyframeCommand, instant, { timeline: 'Hero click', at: 1, property: 'opacity' }))).toBe('status.motion.notKeyed');
  });

  it('edits a keyframe by its place: value, segment easing, time, and the property its track animates', () => {
    const base = chain(keyed().document, [[setKeyframeCommand, { timeline: 'Hero click', at: 0, property: 'opacity', value: '1' }]]);
    const later = runHandler(atPlayhead(setKeyframeCommand, 600), base.document, { timeline: 'Hero click', at: 0, property: 'opacity', value: '1' }, { selection: ['hero'] }).document;
    const edit = (field: string, value: unknown, keyframeAt = 0) => chain(later, [[editKeyframeCommand, { timeline: 'Hero click', at: 0, property: 'opacity', keyframeAt, field, value }]]).document;
    const keyframes = (document: DocumentJson) => {
      const effect = firstTimeline(document)?.actions[0]?.effect;
      return effect?.kind === 'animate' ? effect.tracks[0]?.keyframes.map(withoutId) : null;
    };
    expect(keyframes(edit('value', '0.4'))).toEqual([{ time: 0, value: '0.4' }, { time: 600, value: '1' }]);
    expect(keyframes(edit('easing', 'ease-in'))).toEqual([{ time: 0, value: '1', easing: 'ease-in' }, { time: 600, value: '1' }]);
    expect(keyframes(edit('time', '0.2', 1))).toEqual([{ time: 0, value: '1' }, { time: 200, value: '1' }]);
    const renamed = firstTimeline(edit('property', 'scale-x'))?.actions[0]?.effect;
    expect(renamed?.kind === 'animate' ? renamed.tracks[0]?.property : null).toBe('scale-x');
    expect(said(runHandler(editKeyframeCommand, later, { timeline: 'Hero click', at: 0, property: 'opacity', keyframeAt: 0, field: 'easing', value: 'bounce' }))).toBe('status.motion.invalid');
  });

  it('moves, deletes, and pastes keyframes at the playhead', () => {
    const two = runHandler(atPlayhead(setKeyframeCommand, 600), keyed().document, { timeline: 'Hero click', at: 0, property: 'opacity', value: '1' }, { selection: ['hero'] }).document;
    const moved = chain(two, [[moveKeyframesCommand, { timeline: 'Hero click', at: 0, property: 'opacity', keyframeAt: 1, delta: -200 }]]).document;
    expect(firstTimeline(moved)?.actions[0]?.effect).toMatchObject({ tracks: [{ keyframes: [{ time: 0 }, { time: 400 }] }] });
    const deleted = chain(two, [[deleteKeyframesCommand, { timeline: 'Hero click', at: 0, property: 'opacity', keyframeAt: 0 }]]).document;
    expect(firstTimeline(deleted)?.actions[0]?.effect).toMatchObject({ tracks: [{ keyframes: [{ time: 600, value: '1' }] }] });
    const pasted = runHandler(atPlayhead(pasteKeyframesCommand, 600), two, { timeline: 'Hero click', at: 0, keyframes: [{ property: 'opacity', offset: 0, value: '0.5' }, { property: 'opacity', offset: 300, value: '0.8', easing: 'ease-out' }] }, { selection: ['hero'] });
    expect(pasted.problems).toEqual([]);
    expect(firstTimeline(pasted.document)?.actions[0]).toMatchObject({ duration: 900, effect: { tracks: [{ keyframes: [{ time: 0 }, { time: 600, value: '0.5' }, { time: 900, value: '0.8', easing: 'ease-out' }] }] } });
    expect(said(runHandler(pasteKeyframesCommand, two, { timeline: 'Hero click', at: 0, keyframes: [] }))).toBe('status.motion.nothingCopied');
  });

  it('records a style write at the playhead into the open timeline instead of the element\'s styles', () => {
    const played = chain(page(), [[addMotionCommand, {}]]).document;
    const recording = { timeline: 'Hero click', time: 300, action: null };
    const ran = runHandler(atPlayhead(setStyleCommand, 300, recording), played, { property: 'opacity', value: '0.5' }, { selection: ['hero'] });
    expect(ran.problems).toEqual([]);
    expect(said(ran)).toBe('status.motion.recorded');
    expect(hero(ran.document).styles).toEqual(hero(played).styles);
    expect(firstTimeline(ran.document)?.actions[0]?.effect).toMatchObject({ tracks: [{ property: 'opacity', keyframes: [{ time: 300, value: '0.5' }] }] });
    // an element nothing plays the timeline on gets an animation of its own, picked
    const other = runHandler(atPlayhead(setStyleCommand, 900, { ...recording, time: 900 }), played, { property: 'opacity', value: '0.5' }, { selection: ['intro'] });
    expect(firstTimeline(other.document)?.actions[1]).toMatchObject({ target: { kind: 'element', node: 'intro' }, start: 0, duration: 900, effect: { tracks: [{ keyframes: [{ time: 900, value: '0.5' }] }] } });
    // not recording: the element's styles, as usual
    expect(hero(runHandler(setStyleCommand, played, { property: 'opacity', value: '0.5' }, { selection: ['hero'] }).document).styles).not.toEqual(hero(played).styles);
  });
});

describe('markers', () => {
  it('adds a marker at the playhead, drags, renames and removes it', () => {
    const played = chain(page(), [[addMotionCommand, {}]]).document;
    const added = runHandler(atPlayhead(addMarkerCommand, 450), played, { timeline: 'Hero click' }, { selection: ['hero'] });
    expect(firstTimeline(added.document)?.markers.map(withoutId)).toEqual([{ name: 'motion.marker.defaultName', time: 450 }]);
    const moved = chain(added.document, [[moveMarkerCommand, { timeline: 'Hero click', markerAt: 0, delta: 50 }], [renameMarkerCommand, { timeline: 'Hero click', markerAt: 0, name: 'Peak' }]]);
    expect(firstTimeline(moved.document)?.markers.map(withoutId)).toEqual([{ name: 'Peak', time: 500 }]);
    expect(firstTimeline(chain(moved.document, [[removeMarkerCommand, { timeline: 'Hero click', markerAt: 0 }]]).document)?.markers).toEqual([]);
  });
});

describe('behaviours', () => {
  it('writes sticky and scroll snap as plain CSS through the style owner', () => {
    const sticky = chain(page(), [[setBehaviourCommand, { behaviour: 'sticky', amount: 12 }]]);
    expect(hero(sticky.document).styles).toEqual({ desktop: { base: { 'padding-top': '56px', position: 'sticky', top: '12px' } } });
    const snap = chain(page(), [[setBehaviourCommand, { behaviour: 'scroll-snap' }, ['cards']]]);
    const cards = snap.document.pages[0]?.tree.children[1];
    expect(cards?.styles).toEqual({ desktop: { base: { 'scroll-snap-type': 'x mandatory', 'overflow-x': 'auto' } } });
    expect(cards?.children.map((child) => child.styles)).toEqual([{ desktop: { base: { 'scroll-snap-align': 'start' } } }, { desktop: { base: { 'scroll-snap-align': 'start' } } }]);
  });

  it('keeps a runtime behaviour on the element, its amount from a field\'s text, and removes it', () => {
    const parallax = chain(page(), [[setBehaviourCommand, { behaviour: 'parallax' }], [setBehaviourCommand, { behaviour: 'parallax', amount: '0.5' as unknown as number }]]);
    expect(hero(parallax.document).behaviours).toEqual([{ kind: 'parallax', amount: 0.5, axis: 'y' }]);
    expect(said(runHandler(setBehaviourCommand, parallax.document, { behaviour: 'parallax', amount: 5 }, { selection: ['hero'] }))).toBe('status.motion.invalid');
    expect(hero(chain(parallax.document, [[removeBehaviourCommand, { behaviour: 'parallax' }]]).document).behaviours).toBeUndefined();
  });
});

describe('what a field hands', () => {
  it('reads a time in seconds from a text, in ms from a number', () => {
    expect(readTime('0.5')).toBe(500);
    expect(readTime('250ms')).toBe(250);
    expect(readTime(' 1.25s ')).toBe(1250);
    expect(readTime(80)).toBe(80);
    expect(readTime('-1')).toBeNull();
    expect(readTime('soon')).toBeNull();
  });
});
