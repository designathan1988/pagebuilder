// The start of the motion runtime (spec motion-runtime): the kit made from its factories, then every interaction bound
// to the elements its selector finds and every behaviour installed. The exported page and the preview run it from the
// motion script (script.ts writes this function and the factories as text); the editor's canvas runs the very same
// functions on its iframe's window (canvas.ts). What it gives back stops it, putting the page back as it was, and
// lets the editor draw a timeline at its playhead.
//
// Self-contained: embedded as text in the page's motion script (self-contained.test.ts).
import type { RuntimeConfig } from '../../../core/motion/export.ts';
import type { createEasing } from '../../../core/motion/easing.ts';
import type { createActions } from './actions.ts';
import type { createBehaviours } from './behaviours.ts';
import type { MotionKit, RuntimeProblem } from './kit.ts';
import type { createLottie } from './lottie.ts';
import type { createPlayer } from './player.ts';
import type { createScroll } from './scroll.ts';
import type { createSplitText } from './split-text.ts';
import type { createTargets } from './targets.ts';
import type { createTriggers } from './triggers.ts';

export interface Factories {
  readonly createEasing: typeof createEasing;
  readonly createTargets: typeof createTargets;
  readonly createSplitText: typeof createSplitText;
  readonly createActions: typeof createActions;
  readonly createLottie: typeof createLottie;
  readonly createScroll: typeof createScroll;
  readonly createPlayer: typeof createPlayer;
  readonly createTriggers: typeof createTriggers;
  readonly createBehaviours: typeof createBehaviours;
}

export interface StartOptions {
  readonly mode: 'page' | 'canvas';
  // where a problem is said; absent: the page's console
  readonly report?: (problem: RuntimeProblem) => void;
  // false: nothing is bound, no behaviour runs, and a timeline is made only when the editor previews it (the canvas
  // while the Timeline's playhead draws a timeline); absent: true
  readonly triggers?: boolean;
}

export interface MotionController {
  readonly kit: MotionKit;
  // the timeline drawn at a time, on every element that plays it, or on one source (the editor's playhead)
  preview(timeline: string, time: number, source?: Element | null): void;
  // the timeline played or paused on every element that plays it (the editor's Play and Pause)
  play(timeline: string, source?: Element | null): void;
  pause(timeline: string): void;
  dispose(): void;
}

export function startMotion(win: Window, config: RuntimeConfig, factories: Factories, options: StartOptions): MotionController {
  // the remembered theme of a theme action (actions.ts)
  const THEME_KEY = 'builder-theme';
  const said = options.report ?? ((problem: RuntimeProblem) => (win as Window & typeof globalThis).console.warn(`[motion] ${problem.code}: ${problem.detail}`));
  const reduced = typeof win.matchMedia === 'function' ? win.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const kit = {
    win,
    config,
    mode: options.mode,
    report: said,
    reducedMotion: () => reduced !== null && reduced.matches,
    activeBreakpoint: () => {
      // the narrowest breakpoint whose width still holds the viewport (desktop-first max-width queries), else the base
      let active = config.breakpoints.find((breakpoint) => breakpoint.base)?.id ?? '';
      for (const breakpoint of config.breakpoints) if (!breakpoint.base && win.innerWidth <= breakpoint.width) active = breakpoint.id;
      return active;
    },
  } as MotionKit;
  kit.easing = factories.createEasing();
  kit.targets = factories.createTargets();
  kit.split = factories.createSplitText();
  kit.scroll = factories.createScroll(win);
  kit.actions = factories.createActions(win, kit);
  kit.lottie = factories.createLottie(win, kit);
  kit.player = factories.createPlayer(win, kit);
  kit.triggers = factories.createTriggers(win, kit);
  kit.behaviours = factories.createBehaviours(win, kit);

  const disposers: (() => void)[] = [];
  const all = (selector: string): Element[] => {
    try {
      return Array.from(win.document.querySelectorAll(selector));
    } catch {
      return [];
    }
  };

  // a theme the person chose on an earlier visit holds before anything plays
  if (options.mode === 'page' && Object.values(config.timelines).some((timeline) => timeline.actions.some((action) => action.effect.kind === 'theme' && action.effect.remember))) {
    try {
      const theme = win.localStorage.getItem(THEME_KEY);
      if (theme === 'light' || theme === 'dark') {
        const root = win.document.documentElement;
        root.classList.add(`theme-${theme}`);
        root.style.setProperty('color-scheme', theme);
      }
    } catch {
      // storage refused: the page starts in the browser's own scheme
    }
  }

  // An interaction's condition (core/motion/model.ts MotionCondition), read on the element its trigger fired on when it
  // fires: a class, the breakpoint, a variable of the application layer (its bridge, app-runtime/runtime.js), a state.
  const appValue = (text: string): unknown => {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      // not JSON: the text itself
      return text;
    }
  };
  const holds = (condition: NonNullable<RuntimeConfig['bindings'][number]['interaction']['condition']>, source: Element): boolean => {
    const element = source as HTMLElement & { open?: unknown; checked?: unknown; selected?: unknown; disabled?: unknown };
    let held: boolean;
    if (condition.kind === 'class') held = source.classList.contains(condition.name);
    else if (condition.kind === 'breakpoint') held = kit.activeBreakpoint() === condition.name;
    else if (condition.kind === 'state') {
      const aria = (name: string): boolean => source.getAttribute(name) === 'true';
      if (condition.name === 'open') held = element.open === true || source.hasAttribute('open') || source.getAttribute('data-state') === 'open';
      else if (condition.name === 'checked') held = element.checked === true || aria('aria-checked') || aria('aria-pressed');
      else if (condition.name === 'expanded') held = aria('aria-expanded');
      else if (condition.name === 'selected') held = element.selected === true || aria('aria-selected');
      else held = element.disabled === true || aria('aria-disabled');
    } else {
      const bridge = (win as Window & { __builderApp?: { get(name: string): unknown } }).__builderApp;
      const value = bridge === undefined ? undefined : bridge.get(condition.name);
      const compare = condition.compare ?? 'set';
      const wanted = appValue(condition.value ?? '');
      const filled = value !== undefined && value !== null && value !== false && value !== 0 && value !== '' && !(Array.isArray(value) && value.length === 0);
      if (compare === 'set') return filled;
      if (compare === 'unset') return !filled;
      if (compare === 'greater') return Number(value) > Number(wanted);
      if (compare === 'less') return Number(value) < Number(wanted);
      const same = value === wanted || String(value) === String(wanted);
      return compare === 'equals' ? same : !same;
    }
    return condition.not === true ? !held : held;
  };
  // the entrances: a trigger that fires once the page is there (its load, the element coming into view, a time after
  // it), played forwards — with less motion asked, its element shows its end state from the start, never its first
  // keyframe first (core/motion/first-paint.ts writes no first state for it either)
  const ENTRANCES = ['page-load', 'scroll-into-view', 'timer'];

  for (const binding of options.triggers === false ? [] : config.bindings) {
    const interaction = binding.interaction;
    const respect = interaction.reducedMotion !== 'ignore';
    const start = interaction.scrollStart ?? 0;
    const end = interaction.scrollEnd ?? 100;
    for (const source of all(binding.selector)) {
      const run = kit.player.run(interaction.timeline, source);
      if (run === null) continue;
      const applies = (): boolean =>
        (interaction.breakpoints === undefined || interaction.breakpoints.includes(kit.activeBreakpoint())) && (interaction.condition === undefined || holds(interaction.condition, source));
      if (respect && kit.reducedMotion() && ENTRANCES.includes(interaction.trigger.kind) && (interaction.control === 'play' || interaction.control === 'restart') && applies()) kit.player.apply(run, 'play', true);
      let fired = false;
      let pending = 0;
      const later = (act: () => void): void => {
        win.clearTimeout(pending);
        if ((interaction.delay ?? 0) <= 0) act();
        else pending = win.setTimeout(act, interaction.delay);
      };
      const handlers = {
        fire: (): void => {
          if (!applies() || (interaction.once === true && fired)) return;
          fired = true;
          later(() => kit.player.apply(run, interaction.control, respect));
        },
        leave: (): void => {
          const leave = interaction.leave ?? 'none';
          if (!applies() || leave === 'none') return;
          win.clearTimeout(pending);
          if (leave === 'reverse') kit.player.apply(run, 'reverse', respect);
          else if (leave === 'pause') run.pause();
          else run.stop();
        },
        progress: (fraction: number): void => {
          if (!applies()) return;
          // less motion asked: a scrub shows the start or the end, never the movement between
          run.progress(respect && kit.reducedMotion() ? (fraction >= 0.5 ? 1 : 0) : fraction);
        },
        duration: (): number => run.total + (interaction.delay ?? 0),
      };
      const kind = interaction.trigger.kind;
      // a scroll progress trigger rides the browser's own scroll timeline when it can: off the main thread
      const scrolling = kind === 'while-visible' || kind === 'page-scroll';
      if (scrolling && interaction.breakpoints === undefined && interaction.condition === undefined && !(respect && kit.reducedMotion()) && run.attachScroll(kind, start, end)) continue;
      disposers.push(kit.triggers.bind(interaction.trigger, source, handlers, { start, end }));
      disposers.push(() => win.clearTimeout(pending));
    }
  }

  for (const { selector, behaviour } of options.triggers === false ? [] : config.behaviours) {
    for (const element of all(selector)) disposers.push(kit.behaviours.install(element, behaviour));
  }

  // every run holds its first state now: the first-paint rules that held it until here go, in this same task, so no
  // frame draws the page between the two (core/motion/first-paint.ts FIRST_PAINT_CLASS)
  if (options.mode === 'page') win.document.documentElement.classList.remove('bm-motion-start');

  const runsOf = (timeline: string, source?: Element | null) => kit.player.runs().filter((run) => run.timeline.name === timeline && (source === undefined || source === null || run.source === source));

  return {
    kit,
    preview(timeline, time, source) {
      const runs = runsOf(timeline, source);
      if (runs.length === 0) {
        // made now: on the source given, else on every element whose interaction plays the timeline
        const sources = source !== undefined && source !== null ? [source] : config.bindings.filter((binding) => binding.interaction.timeline === timeline).flatMap((binding) => all(binding.selector));
        for (const one of sources) {
          const made = kit.player.run(timeline, one);
          if (made !== null && !runs.includes(made)) runs.push(made);
        }
      }
      for (const run of runs) run.seek(time);
    },
    play(timeline, source) {
      for (const run of runsOf(timeline, source)) run.play(1);
    },
    pause(timeline) {
      for (const run of runsOf(timeline)) run.pause();
    },
    dispose() {
      for (const dispose of disposers.splice(0).reverse()) dispose();
      kit.player.dispose();
      kit.lottie.dispose();
    },
  };
}
