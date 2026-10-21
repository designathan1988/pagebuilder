// Record mode (plan stage 10, "record": a change in the inspector creates a keyframe at the playhead; spec
// motion-timeline, Recording). While the Timeline records, the style owner (core/style/set.ts writeStyle) hands a write
// of the primary selected element here instead of writing the element's styles: each property written becomes a
// keyframe of the open timeline at the playhead, on the animation acting on that element there — the selected action
// when it animates, else an animation of the element covering the playhead, else a new one from 0 to the playhead.
// The same read value, one command, one undo step: only the holder changes, as a keyframe of a CSS animation does.
import type { NodeId } from '../../generated/commands.ts';
import { message, type HandlerContext, type Outcome } from '../commands/registry.ts';
import { manifest } from '../../manifest/runtime.ts';
import type { MessageId } from '../../generated/ids.ts';
import type { DocNode, StoredValue } from '../document/model.ts';
import { EFFECTS } from './catalog.ts';
import { findTimeline, motionsOf, writeTimeline } from './document.ts';
import { readTimeline } from './read.ts';
import { addAction, replaceAction, setKeyframeAt } from './timeline.ts';
import type { MotionTarget, MotionTimeline, TimelineAction } from './model.ts';

// What the editor records into while the Timeline's record button is on (src/editor/motion/state.ts motionContext):
// the open timeline, the playhead's time, and the action selected in the panel, if any.
export interface MotionRecordTarget {
  readonly timeline: string;
  readonly time: number;
  readonly action: string | null;
}

// What the editor's Timeline tells the commands (the store's `motion` option, HandlerContext.motion): where the
// playhead sits, which a keyframe, a marker, a paste or an action added "at the playhead" lands at, and what a style
// write records into while the Timeline records (null while it does not).
export interface MotionEditorContext {
  readonly playhead: number;
  readonly recording: MotionRecordTarget | null;
}

// Whether an action acts on this element: it picked the element, or it acts on the element whose interaction plays the
// timeline (`self`, for a node that plays this timeline).
function actsOn(action: TimelineAction, node: DocNode, playsIt: boolean): boolean {
  if (action.effect.kind !== 'animate') return false;
  if (action.target.kind === 'element') return action.target.node === node.id;
  return action.target.kind === 'self' && playsIt;
}

// The action a recorded value lands on, and the timeline with it (a new animation added when none acts on the element
// at the playhead).
function recordingAction(timeline: MotionTimeline, node: DocNode, playsIt: boolean, target: MotionRecordTarget, id: () => string): { readonly timeline: MotionTimeline; readonly action: TimelineAction } {
  const selected = timeline.actions.find((action) => action.id === target.action && action.effect.kind === 'animate');
  if (selected !== undefined) return { timeline, action: selected };
  const covering = timeline.actions.find((action) => actsOn(action, node, playsIt) && action.start <= target.time && target.time <= action.start + action.duration);
  if (covering !== undefined) return { timeline, action: covering };
  const recordedTarget: MotionTarget = playsIt ? { kind: 'self' } : { kind: 'element', node: node.id as NodeId };
  const action: TimelineAction = { id: id(), target: recordedTarget, start: 0, duration: Math.max(target.time, EFFECTS.animate.duration), effect: { kind: 'animate', tracks: [] } };
  return { timeline: addAction(timeline, action), action };
}

// The outcome of a style write while recording, or null when the editor does not record (the write goes to the
// element's styles, as usual). `values` are the declarations the field wrote; a structured value (a shadow's layers)
// is recorded as the CSS text the field wrote for its property.
export function recordStyleWrite<Ui>(context: HandlerContext<Ui>, node: DocNode, property: string, css: string, values: Readonly<Record<string, StoredValue>>): Outcome<Ui> | null {
  const target = context.motion?.recording ?? null;
  if (target === null) return null;
  const found = findTimeline(context.state.document, target.timeline);
  if (found === null) return null;
  const playsIt = motionsOf(node).some((motion) => motion.timeline === target.timeline);
  const id = () => context.ids.next();
  const at = recordingAction(found.timeline, node, playsIt, target, id);
  let action = at.action;
  // the playhead past the action's end makes the action longer, so the keyframe lies inside it
  const local = target.time - action.start;
  if (local < 0) return { kind: 'refused', message: message('status.motion.recordBeforeAction', { time: (target.time / 1000).toFixed(2) }) };
  if (local > action.duration) action = { ...action, duration: local };
  let recorded = 0;
  for (const [name, value] of Object.entries(values)) {
    const text = typeof value === 'string' ? value : name === property ? css : null;
    if (text === null || text === '') continue;
    action = setKeyframeAt(action, name, local, text, undefined, id);
    recorded += 1;
  }
  // a write that clears a value records nothing: a keyframe holds a value
  if (recorded === 0) return { kind: 'refused', message: message('status.motion.invalid', { value: css }) };
  const timeline = replaceAction(at.timeline, action.id, () => action);
  const read = readTimeline(timeline);
  if (!read.ok) return { kind: 'refused', message: message('status.motion.invalid', { value: css }) };
  return {
    kind: 'change',
    patches: [writeTimeline(found.index, read.value)],
    message: message('status.motion.recorded', { property: propertyName(property), time: (target.time / 1000).toFixed(2), timeline: target.timeline }),
  };
}

// the property as the inspector names it (Opacity, not opacity); a transform part or a property it does not list keeps
// its CSS name
function propertyName(property: string): string | { key: MessageId; params: Record<string, never> } {
  const found = manifest.properties.properties.find((one) => one.id === property);
  return found === undefined ? property : { key: found.labelKey as MessageId, params: {} };
}
