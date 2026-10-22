// The first paint of a page whose elements enter with motion (spec export-motion-js, "No flash"): the motion script is
// deferred, so before it runs the page is painted as its stylesheet says, and an element a timeline holds at its first
// keyframe until its trigger fires (runtime/player.ts: a run is made paused at 0) showed for that moment, then
// vanished, then entered (the audit's flash: 1 → 0 → 1 over ~60 ms). The page now starts in that first state:
//  - a blocking line at the head of the page puts FIRST_PAINT_CLASS on the root, and rules under that class hold each
//    such element at its first keyframe from the first paint;
//  - the motion script takes the class away once its runs hold those states themselves (runtime/start.ts), in the same
//    task, so no frame shows the stylesheet's state between the two;
//  - nothing hides an element for good: without scripts the class is never set, and when the motion script does not
//    run (a file missing, an error) the class goes once the page's deferred scripts are done;
//  - less motion asked: an interaction that respects it shows its end state at once (the runtime jumps), so its rules
//    stand under prefers-reduced-motion: no-preference and the element is drawn as it ends from the first paint.
// Only what CSS can say is written: an animated property (a transform part as the individual transform it stands
// for) whose track starts at 0 on an element a selector reaches before the script runs. Split text (its pieces exist
// only once the script splits it) and the relative targets a selector cannot name (parent, previous, siblings, an
// ancestor) are left to the script.
import { TRIGGERS, isTriggerKind } from './catalog.ts';
import type { RuntimeConfig, RuntimeTarget } from './export.ts';
import type { PropertyTrack } from './model.ts';
import { ROTATE, SCALE, TRANSLATE } from './words.ts';

export const FIRST_PAINT_CLASS = 'bm-motion-start';

// what a declaration's value may hold to be written in a rule: no end of the declaration, no block, no markup
const SAFE_VALUE = /^[^;{}<>\\]+$/;
const PLAIN_PROPERTY = /^-?-?[a-z][a-z0-9-]*$/i;

// The selector a target names from the trigger's own element, or null where a selector cannot name it.
function targetSelector(source: string, target: RuntimeTarget): string | null {
  switch (target.kind) {
    case 'self':
      return source;
    case 'selector':
      return target.selector;
    case 'class':
      return `.${target.className}`;
    case 'children':
      return source.split(',').map((one) => `${one.trim()} > *`).join(', ');
    case 'descendants':
      return source.split(',').map((one) => `${one.trim()} .${target.className}`).join(', ');
    case 'next':
      return source.split(',').map((one) => `${one.trim()} + *`).join(', ');
    default:
      return null;
  }
}

// The declarations a set of tracks starts at: each property's first keyframe at 0, the transform parts gathered into
// the individual transforms they stand for (translate, rotate, scale), in the order the runtime composes them.
function startDeclarations(tracks: readonly PropertyTrack[]): Map<string, string> {
  const held = new Map<string, string>();
  const parts = new Map<string, string>();
  for (const track of tracks) {
    const first = track.keyframes[0];
    if (first === undefined || first.time !== 0 || !SAFE_VALUE.test(first.value)) continue;
    if (/^(translate|scale|rotate|skew)-[xyz]$/.test(track.property)) parts.set(track.property, first.value.trim());
    else if (PLAIN_PROPERTY.test(track.property)) held.set(track.property, first.value.trim());
  }
  if (parts.has('translate-x') || parts.has('translate-y') || parts.has('translate-z')) {
    held.set(TRANSLATE, `${parts.get('translate-x') ?? '0px'} ${parts.get('translate-y') ?? '0px'}${parts.has('translate-z') ? ` ${parts.get('translate-z') ?? '0px'}` : ''}`);
  }
  if (parts.has('rotate-z')) held.set(ROTATE, parts.get('rotate-z') ?? '0deg');
  if (parts.has('scale-x') || parts.has('scale-y')) held.set(SCALE, `${parts.get('scale-x') ?? '1'} ${parts.get('scale-y') ?? '1'}`);
  return held;
}

// The rules that hold the page's elements at their first state until the motion script runs, for the bindings of the
// site's motion data (one stylesheet of rules serves every page: a selector of another page finds nothing). Empty
// when nothing starts away from its own look.
export function firstPaintRules(config: RuntimeConfig): readonly string[] {
  // by selector, the declarations it starts with, and whether less motion asked keeps them (the interaction ignores it)
  const always = new Map<string, Map<string, string>>();
  const unlessReduced = new Map<string, Map<string, string>>();
  for (const binding of config.bindings) {
    const kind = binding.interaction.trigger.kind;
    // a scroll progress trigger draws its timeline where the scroll is, not at its start
    if (!isTriggerKind(kind) || TRIGGERS[kind].continuous) continue;
    const timeline = config.timelines[binding.interaction.timeline];
    if (timeline === undefined) continue;
    const into = binding.interaction.reducedMotion === 'ignore' ? always : unlessReduced;
    for (const action of timeline.actions) {
      if (action.effect.kind !== 'animate') continue;
      const selector = targetSelector(binding.selector, action.target);
      if (selector === null) continue;
      const declarations = startDeclarations(action.effect.tracks);
      if (declarations.size === 0) continue;
      const held = into.get(selector) ?? new Map<string, string>();
      // a later action on the same property is drawn over the earlier one, as its animation is (composite order)
      for (const [property, value] of declarations) held.set(property, value);
      into.set(selector, held);
    }
  }
  const rules = (from: Map<string, Map<string, string>>, indent: string): string[] =>
    [...from].flatMap(([selector, declarations]) => [
      `${indent}${selector.split(',').map((one) => `.${FIRST_PAINT_CLASS} ${one.trim()}`).join(', ')} {`,
      ...[...declarations].map(([property, value]) => `${indent}  ${property}: ${value};`),
      `${indent}}`,
    ]);
  const lines = rules(always, '');
  if (unlessReduced.size > 0) lines.push('@media (prefers-reduced-motion: no-preference) {', ...rules(unlessReduced, '  '), '}');
  return lines;
}

// The blocking script at the head of a page that holds first-state rules: the class on the root at once, and taken
// away once the page's deferred scripts are done if the motion script did not take it (it never ran), so nothing stays
// hidden. A script of its own text, inline, so it runs before the first paint.
export const firstPaintScript = (): string =>
  `(function(r){r.classList.add('${FIRST_PAINT_CLASS}');document.addEventListener('DOMContentLoaded',function(){setTimeout(function(){r.classList.remove('${FIRST_PAINT_CLASS}')},0)})})(document.documentElement);`;
