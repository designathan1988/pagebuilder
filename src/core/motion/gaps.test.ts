// The motion gaps of 2026-10-22: timeline names in the person's language, interaction conditions, a variable of the
// application set from a timeline, the parallax range, page transitions, and the first paint of an entering element.
import { describe, expect, it } from 'vitest';
import type { HandlerContext, Outcome } from '../commands/registry.ts';
import type { DocNode, DocumentJson } from '../document/model.ts';
import { documentOf, node, runHandler, type Ran } from '../testing/handlers.ts';
import pt from '../../i18n/locales/pt-BR.json' with { type: 'json' };
import { addMotionCommand, setBehaviourCommand, setEffectOptionCommand, setLinkTransitionCommand, setPageTransitionCommand, setParallaxRangeCommand, updateMotionCommand, addActionCommand } from './commands.ts';
import { FIRST_PAINT_CLASS, firstPaintRules } from './first-paint.ts';
import { pageTransitionCss, pageTransitionOf, pageTransitionScript } from './page-transition.ts';
import type { RuntimeConfig } from './export.ts';
import { sequentialIds } from '../ports/ids.ts';

type Handler = { run(context: HandlerContext<never>, args: never): Outcome<never> };
// one generator for every command of a test, as the store keeps one for the session: ids never repeat
const ids = sequentialIds('g');
const fresh = (handler: Handler): Handler => ({ run: (context, args) => handler.run({ ...context, ids }, args) });
const inPortuguese = (handler: Handler): Handler => ({ run: (context, args) => handler.run({ ...context, words: (key: string) => (pt as Record<string, string>)[key] ?? key }, args) });

function site(): DocumentJson {
  return documentOf({
    pages: [
      {
        id: 'p',
        name: 'Home',
        file: 'index.html',
        tree: node('root', 'page', 'body', {
          name: 'Page',
          children: [
            node('hero', 'heading', 'h1', { name: 'Título', text: 'Olá', classes: ['hero'] }),
            node('link', 'link', 'a', { name: 'Sobre', text: 'Sobre', attributes: { href: 'about.html' } }),
          ],
        }),
      },
    ],
  });
}
function chain(document: DocumentJson, steps: readonly (readonly [Handler, Record<string, unknown>, string?])[]): Ran {
  let ran: Ran = { outcome: { kind: 'change' }, document, problems: [] };
  for (const [handler, args, selected] of steps) {
    ran = runHandler(fresh(handler), ran.document, args, { selection: [selected ?? 'hero'] });
    expect(ran.problems, JSON.stringify(ran.outcome)).toEqual([]);
  }
  return ran;
}
const said = (ran: Ran): string | null => (ran.outcome.kind === 'change' || ran.outcome.kind === 'refused' ? (ran.outcome.message?.key ?? null) : null);
const heading = (document: DocumentJson): DocNode => document.pages[0]?.tree.children[0] as DocNode;
const link = (document: DocumentJson): DocNode => document.pages[0]?.tree.children[1] as DocNode;

describe('a new timeline is named in the words of the person\'s language', () => {
  it('names the trigger and the entrance effect by their catalogue words, never by their ids', () => {
    const entry = chain(site(), [[inPortuguese(addMotionCommand), { preset: 'slide-up' }]]);
    expect(entry.document.motionTimelines?.[0]?.name).toBe('Título subir');
    const plain = chain(site(), [[inPortuguese(addMotionCommand), { trigger: 'scroll-into-view' }]]);
    expect(plain.document.motionTimelines?.[0]?.name).toBe('Título ao entrar na tela');
    expect(plain.document.motionTimelines?.[0]?.name).not.toMatch(/scroll-into-view/);
  });
});

describe('an interaction runs only if its condition holds', () => {
  const added = () => chain(site(), [[addMotionCommand, {}]]).document;
  const update = (document: DocumentJson, field: string, value: unknown) => runHandler(updateMotionCommand, document, { interaction: 0, field, value }, { selection: ['hero'] });
  it('chooses a class, a breakpoint, a variable or a state, each with the name it starts from', () => {
    const lacks = update(added(), 'condition', 'no-class');
    expect(heading(lacks.document).motions?.[0]?.condition).toEqual({ kind: 'class', name: 'hero', not: true });
    const breakpoint = update(added(), 'condition', 'breakpoint');
    expect(heading(breakpoint.document).motions?.[0]?.condition?.kind).toBe('breakpoint');
    expect(breakpoint.problems).toEqual([]);
    const state = update(added(), 'condition', 'state');
    expect(heading(state.document).motions?.[0]?.condition).toEqual({ kind: 'state', name: 'open' });
    const variable = update(added(), 'condition', 'variable');
    expect(heading(variable.document).motions?.[0]?.condition).toEqual({ kind: 'variable', name: 'value', compare: 'set' });
    // back to always: the condition goes
    expect(heading(update(variable.document, 'condition', 'always').document).motions?.[0]?.condition).toBeUndefined();
  });
  it('compares a variable to a value, a number for greater and less', () => {
    const variable = update(added(), 'condition', 'variable').document;
    const named = update(variable, 'conditionName', 'cart').document;
    const greater = update(named, 'conditionCompare', 'greater');
    expect(heading(greater.document).motions?.[0]?.condition).toEqual({ kind: 'variable', name: 'cart', compare: 'greater', value: '0' });
    expect(said(update(greater.document, 'conditionValue', 'many'))).toBe('status.motion.invalid');
    expect(heading(update(greater.document, 'conditionValue', '2').document).motions?.[0]?.condition?.value).toBe('2');
    // a name that is no variable name, and a breakpoint the project lacks, are refused
    expect(said(update(variable, 'conditionName', 'not a name'))).toBe('status.motion.invalid');
    expect(said(update(update(added(), 'condition', 'breakpoint').document, 'conditionName', 'nowhere'))).toBe('status.motion.invalid');
  });
});

describe('a Set variable action sets a variable of the application or a custom property', () => {
  it('moves the name between the two grammars with the scope', () => {
    const made = chain(site(), [[addMotionCommand, {}]]).document;
    const name = made.motionTimelines?.[0]?.name ?? '';
    const withVariable = chain(made, [[addActionCommand, { timeline: name, kind: 'variable' }]]).document;
    const app = chain(withVariable, [[setEffectOptionCommand, { timeline: name, at: 1, option: 'scope', value: 'app' }]]).document;
    expect(app.motionTimelines?.[0]?.actions[1]?.effect).toEqual({ kind: 'variable', name: 'motionValue', value: '1', scope: 'app' });
    const texted = chain(app, [[setEffectOptionCommand, { timeline: name, at: 1, option: 'value', value: '{"open": true}' }]]).document;
    expect(texted.motionTimelines?.[0]?.actions[1]?.effect).toMatchObject({ value: '{"open": true}', scope: 'app' });
    // back to CSS: the name is a custom property again, and a value CSS cannot hold starts over
    const css = chain(texted, [[setEffectOptionCommand, { timeline: name, at: 1, option: 'scope', value: 'css' }]]).document;
    expect(css.motionTimelines?.[0]?.actions[1]?.effect).toEqual({ kind: 'variable', name: '--motion-value', value: '1' });
  });
});

describe('the parallax range', () => {
  it('stores the part of the way it moves in and its most travel, the defaults stored as nothing', () => {
    const parallax = chain(site(), [[setBehaviourCommand, { behaviour: 'parallax' }]]).document;
    const ranged = chain(parallax, [[setParallaxRangeCommand, { field: 'start', value: '20' }], [setParallaxRangeCommand, { field: 'max', value: '80px' }]]).document;
    expect(heading(ranged).behaviours?.[0]).toEqual({ kind: 'parallax', amount: 0.3, axis: 'y', start: 20, end: 100, max: 80 });
    const back = chain(ranged, [[setParallaxRangeCommand, { field: 'start', value: '0' }], [setParallaxRangeCommand, { field: 'max', value: '' }]]).document;
    expect(heading(back).behaviours?.[0]).toEqual({ kind: 'parallax', amount: 0.3, axis: 'y' });
    expect(said(runHandler(setParallaxRangeCommand, ranged, { field: 'end', value: '10' }, { selection: ['hero'] }))).toBe('status.motion.invalid');
    expect(said(runHandler(setParallaxRangeCommand, site(), { field: 'start', value: '10' }, { selection: ['hero'] }))).toBe('status.motion.noParallax');
  });
});

describe('page transitions', () => {
  it('sets the site\'s transition and a link\'s own, and takes them away', () => {
    const fade = chain(site(), [[setPageTransitionCommand, { field: 'kind', value: 'slide' }]]).document;
    expect(fade.pageTransition).toEqual({ kind: 'slide', duration: 300 });
    const longer = chain(fade, [[setPageTransitionCommand, { field: 'duration', value: '0.5' }]]).document;
    expect(longer.pageTransition).toEqual({ kind: 'slide', duration: 500 });
    expect(said(runHandler(setPageTransitionCommand, longer, { field: 'duration', value: '9' }))).toBe('status.motion.invalid');
    expect(chain(longer, [[setPageTransitionCommand, { field: 'kind', value: 'none' }]]).document.pageTransition).toBeUndefined();
    const own = chain(longer, [[setLinkTransitionCommand, { transition: 'none' }, 'link']]).document;
    expect(link(own).customAttributes).toEqual({ 'data-page-transition': 'none' });
    expect(link(chain(own, [[setLinkTransitionCommand, { transition: '' }, 'link']]).document).customAttributes).toBeUndefined();
    expect(said(runHandler(setLinkTransitionCommand, longer, { transition: 'fade' }, { selection: ['hero'] }))).toBe('status.motion.notALink');
  });
  it('writes the view transition opt-in under no-preference, and a script that names the link\'s own kind', () => {
    const document = chain(site(), [[setPageTransitionCommand, { field: 'kind', value: 'fade' }]]).document;
    const transition = pageTransitionOf(document);
    expect(transition).toEqual({ kind: 'fade', duration: 300 });
    const css = pageTransitionCss(transition ?? { kind: 'fade', duration: 0 }).join('\n');
    expect(css.startsWith('@media (prefers-reduced-motion: no-preference) {')).toBe(true);
    expect(css).toContain('navigation: auto;');
    expect(css).toContain('html:active-view-transition-type(bm-fade)::view-transition-old(root)');
    const script = pageTransitionScript(document, transition ?? { kind: 'fade', duration: 0 });
    expect(script).toContain("var SITE = 'fade', TIME = 300");
    expect(script).toContain("link.getAttribute(ATTRIBUTE) || SITE");
    // a site whose links alone name a transition: the others take none
    const linksOnly = chain(site(), [[setLinkTransitionCommand, { transition: 'slide' }, 'link']]).document;
    expect(pageTransitionOf(linksOnly)).toEqual({ kind: 'fade', duration: 300 });
    expect(pageTransitionScript(linksOnly, { kind: 'fade', duration: 300 })).toContain("var SITE = 'none'");
    expect(pageTransitionOf(site())).toBeNull();
  });
});

describe('the first paint of an entering element', () => {
  const config = (reducedMotion?: 'ignore'): RuntimeConfig => ({
    bindings: [
      { selector: '.hero', interaction: { trigger: { kind: 'scroll-into-view', threshold: 0.2 }, timeline: 'In', control: 'play', ...(reducedMotion === undefined ? {} : { reducedMotion }) } },
      { selector: '.bar', interaction: { trigger: { kind: 'page-scroll' }, timeline: 'In', control: 'scrub' } },
    ],
    timelines: {
      In: {
        name: 'In',
        markers: [],
        actions: [
          {
            id: 'a',
            target: { kind: 'self' },
            start: 0,
            duration: 700,
            effect: {
              kind: 'animate',
              tracks: [
                { id: 'o', property: 'opacity', keyframes: [{ id: 'k1', time: 0, value: '0' }, { id: 'k2', time: 700, value: '1' }] },
                { id: 'y', property: 'translate-y', keyframes: [{ id: 'k3', time: 0, value: '32px' }, { id: 'k4', time: 700, value: '0px' }] },
                { id: 'late', property: 'color', keyframes: [{ id: 'k5', time: 300, value: 'red' }] },
              ],
            },
          },
          { id: 'kids', target: { kind: 'children' }, start: 0, duration: 300, effect: { kind: 'animate', tracks: [{ id: 's', property: 'scale-x', keyframes: [{ id: 'k6', time: 0, value: '0.9' }] }] } },
          { id: 'up', target: { kind: 'parent' }, start: 0, duration: 300, effect: { kind: 'animate', tracks: [{ id: 'p', property: 'opacity', keyframes: [{ id: 'k7', time: 0, value: '0' }] }] } },
        ],
      },
    },
    behaviours: [],
    breakpoints: [],
    cssAnimations: {},
    lottie: {},
    pages: ['index.html'],
  });
  it('holds each element at its first keyframe under the start class, unless less motion is asked', () => {
    expect(firstPaintRules(config())).toEqual([
      '@media (prefers-reduced-motion: no-preference) {',
      `  .${FIRST_PAINT_CLASS} .hero {`,
      '    opacity: 0;',
      '    translate: 0px 32px;',
      '  }',
      `  .${FIRST_PAINT_CLASS} .hero > * {`,
      '    scale: 0.9 1;',
      '  }',
      '}',
    ]);
  });
  it('holds it whatever the reader asks when the interaction ignores reduced motion', () => {
    expect(firstPaintRules(config('ignore'))[0]).toBe(`.${FIRST_PAINT_CLASS} .hero {`);
  });
});
