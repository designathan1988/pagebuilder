// What the page's motion script is given (spec export-motion-js): the project's interactions, the timelines they
// play and the behaviours, written as plain data the runtime (src/editor/motion/runtime/) reads, with every element
// addressed as the exported page addresses it — the class the export gave it, or the person's own id — never an
// editor id. The export (core/export/export.ts siteFiles) and the preview hand it to the site-scripts port, which wraps
// it with the runtime's code; the canvas's run mode builds the same data with the canvas's own selectors.
//  - One script serves every page: a binding whose element is not on a page finds nothing there.
//  - Only the timelines something plays are written, with the timelines those control, so a library timeline nobody
//    uses costs the page nothing.
//  - A Lottie action's animation data is written in, read from the project's file: the page plays it offline and from
//    file://, where a fetch of the JSON would be refused. The Lottie player itself is written only when one is used.
import type { NodeId } from '../../generated/commands.ts';
import { walk, type DocumentJson } from '../document/model.ts';
import { fileAt, fileBytes } from '../files/files.ts';
import { behavioursOf, motionsOf, timelinesOf } from './document.ts';
import type { Behaviour, Effect, MotionInteraction, MotionTarget, MotionTimeline, TimelineAction } from './model.ts';

// A target as the runtime reads it: the model's relative kinds as they are, and a picked element or a component's
// instances as the selector that finds them on the page.
export type RuntimeTarget = Exclude<MotionTarget, { readonly kind: 'element' } | { readonly kind: 'component' }> | { readonly kind: 'selector'; readonly selector: string };

export interface RuntimeAction extends Omit<TimelineAction, 'target'> {
  readonly target: RuntimeTarget;
}
export interface RuntimeTimeline {
  readonly name: string;
  readonly actions: readonly RuntimeAction[];
  readonly markers: MotionTimeline['markers'];
}
export interface RuntimeBinding {
  // the elements whose trigger fires it: the element's own selector, or every element of its class (scope)
  readonly selector: string;
  readonly interaction: Omit<MotionInteraction, 'id' | 'scope'>;
}
export interface RuntimeConfig {
  readonly bindings: readonly RuntimeBinding[];
  readonly timelines: Readonly<Record<string, RuntimeTimeline>>;
  readonly behaviours: readonly { readonly selector: string; readonly behaviour: Behaviour }[];
  // the breakpoints in cascade order, the base first (properties.json), with the width each applies up to
  readonly breakpoints: readonly { readonly id: string; readonly width: number; readonly base: boolean }[];
  // a CSS animation an action controls by name: the class the export plays it with (core/animation/animation.ts)
  readonly cssAnimations: Readonly<Record<string, string>>;
  // a Lottie action's animation data, by the project file's path
  readonly lottie: Readonly<Record<string, unknown>>;
  // the site's pages by file, for a navigate action that names one
  readonly pages: readonly string[];
}

export interface ConfigInputs {
  // the selector the page addresses a node by (export: its class or its id attribute; canvas: its data-node)
  readonly selectorOf: (node: NodeId) => string | null;
  readonly breakpoints: RuntimeConfig['breakpoints'];
  // the class core/animation plays an animation with when an event plays it
  readonly playedClassName: (animation: string) => string;
  // every timeline of the project, played or not (the editor's preview draws a library timeline too); absent: false
  readonly everyTimeline?: boolean;
  // false: a Lottie action's animation data is not read (the first-paint rules need none of it); absent: true
  readonly lottie?: boolean;
}

// The timelines a set of interactions needs: the ones they play, and every timeline those control, transitively.
export function timelinesNeeded(document: DocumentJson): readonly MotionTimeline[] {
  const byName = new Map(timelinesOf(document).map((timeline) => [timeline.name, timeline]));
  const needed = new Set<string>();
  const visit = (name: string): void => {
    const timeline = byName.get(name);
    if (timeline === undefined || needed.has(name)) return;
    needed.add(name);
    for (const action of timeline.actions) if (action.effect.kind === 'timeline' && action.effect.timeline !== '') visit(action.effect.timeline);
  };
  for (const page of document.pages) for (const node of walk(page.tree)) for (const motion of motionsOf(node)) visit(motion.timeline);
  return timelinesOf(document).filter((timeline) => needed.has(timeline.name));
}

// Whether the site plays a Lottie animation (the export then writes the player beside the motion script).
export function siteUsesLottie(document: DocumentJson): boolean {
  return timelinesNeeded(document).some((timeline) => timeline.actions.some((action) => action.effect.kind === 'lottie' && action.effect.file !== ''));
}

function runtimeTarget(document: DocumentJson, target: MotionTarget, inputs: ConfigInputs): RuntimeTarget | null {
  if (target.kind === 'element') {
    const selector = inputs.selectorOf(target.node);
    return selector === null ? null : { kind: 'selector', selector };
  }
  if (target.kind === 'component') {
    // every instance's root: the element of a page that names the component
    const selectors: string[] = [];
    for (const page of document.pages) for (const node of walk(page.tree)) if (node.component === target.component) {
      const selector = inputs.selectorOf(node.id as NodeId);
      if (selector !== null && !selectors.includes(selector)) selectors.push(selector);
    }
    return selectors.length === 0 ? null : { kind: 'selector', selector: selectors.join(', ') };
  }
  return target;
}

// A project file's JSON, or null when it is no file of the project or holds no JSON.
function jsonFile(document: DocumentJson, path: string): unknown {
  const file = fileAt(document, path);
  if (file === null) return null;
  try {
    return JSON.parse(new TextDecoder().decode(fileBytes(file))) as unknown;
  } catch {
    return null;
  }
}

// The runtime's data for a document, or null when no page holds an interaction or a behaviour.
export function motionConfig(document: DocumentJson, inputs: ConfigInputs): RuntimeConfig | null {
  const bindings: RuntimeBinding[] = [];
  const behaviours: { selector: string; behaviour: Behaviour }[] = [];
  for (const page of document.pages) {
    for (const node of walk(page.tree)) {
      const own = inputs.selectorOf(node.id as NodeId);
      for (const motion of motionsOf(node)) {
        const selector = motion.scope !== undefined ? `.${motion.scope}` : own;
        if (selector === null) continue;
        const { id: _id, scope: _scope, ...interaction } = motion;
        void _id;
        void _scope;
        bindings.push({ selector, interaction });
      }
      if (own !== null) for (const behaviour of behavioursOf(node)) behaviours.push({ selector: own, behaviour });
    }
  }
  if (bindings.length === 0 && behaviours.length === 0 && inputs.everyTimeline !== true) return null;
  const timelines: Record<string, RuntimeTimeline> = {};
  const cssAnimations: Record<string, string> = {};
  const lottie: Record<string, unknown> = {};
  for (const timeline of inputs.everyTimeline === true ? timelinesOf(document) : timelinesNeeded(document)) {
    const actions: RuntimeAction[] = [];
    for (const action of timeline.actions) {
      const target = runtimeTarget(document, action.target, inputs);
      // an action whose element has no address on any page acts on nothing: it is left out
      if (target === null) continue;
      actions.push({ ...action, target });
      const effect: Effect = action.effect;
      if (effect.kind === 'css-animation' && effect.animation !== '') cssAnimations[effect.animation] = inputs.playedClassName(effect.animation);
      if (effect.kind === 'lottie' && effect.file !== '' && inputs.lottie !== false && !(effect.file in lottie)) {
        const data = jsonFile(document, effect.file);
        if (data !== null) lottie[effect.file] = data;
      }
    }
    timelines[timeline.name] = { name: timeline.name, actions, markers: timeline.markers };
  }
  return { bindings, timelines, behaviours, breakpoints: inputs.breakpoints, cssAnimations, lottie, pages: document.pages.map((page) => page.file) };
}

// The data as the script's text holds it: JSON that can sit inside a <script> element (no "</script", no line
// separators a parser would read as the end of a line).
export function configText(config: RuntimeConfig): string {
  return JSON.stringify(config).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
}
