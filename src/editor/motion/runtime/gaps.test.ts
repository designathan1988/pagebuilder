// The runtime's part of the motion gaps of 2026-10-22: an interaction's condition, a variable of the application set
// from a timeline, the parallax held inside its range and its section, the first-paint class handed over, and an
// entrance shown at its end at once when less motion is asked.
import { describe, expect, it } from 'vitest';
import { startOn } from './compose.ts';
import { config, fakePage } from './fake-page.ts';
import type { RuntimeConfig } from '../../../core/motion/export.ts';

const click = (element: Element, win: unknown): void => {
  element.dispatchEvent(new (win as { MouseEvent: typeof MouseEvent }).MouseEvent('click'));
};
// a timeline that adds the class "on" to its element
const marking: RuntimeConfig['timelines'] = { Mark: { name: 'Mark', markers: [], actions: [{ id: 'a', target: { kind: 'self' }, start: 0, duration: 0, effect: { kind: 'class', operation: 'add', className: 'on' } }] } };

describe('an interaction\'s condition', () => {
  it('runs only while the element has the class, the breakpoint is the one named, or the element is open', () => {
    const page = fakePage('<button id="a" class="ready">A</button><button id="b">B</button><details id="c"><summary>C</summary></details>');
    startOn(page.win as unknown as Window, config({
      timelines: marking,
      bindings: [
        { selector: '#a', interaction: { trigger: { kind: 'click' }, timeline: 'Mark', control: 'play', condition: { kind: 'class', name: 'ready' } } },
        { selector: '#b', interaction: { trigger: { kind: 'click' }, timeline: 'Mark', control: 'play', condition: { kind: 'breakpoint', name: 'phone' } } },
        { selector: '#c', interaction: { trigger: { kind: 'click' }, timeline: 'Mark', control: 'play', condition: { kind: 'state', name: 'open', not: true } } },
      ],
    }), { mode: 'page' });
    const [a, b, c] = ['#a', '#b', '#c'].map((selector) => page.document.querySelector(selector) as HTMLElement) as [HTMLElement, HTMLElement, HTMLDetailsElement];
    click(a, page.win);
    click(b, page.win);
    c.open = true;
    click(c, page.win);
    page.tick(16);
    expect([a.classList.contains('on'), b.classList.contains('on'), c.classList.contains('on')]).toEqual([true, false, false]);
    page.resize(390);
    click(b, page.win);
    page.tick(16);
    expect(b.classList.contains('on')).toBe(true);
  });

  it('compares a variable of the application through its bridge', () => {
    const page = fakePage('<button id="a">A</button>');
    const state: Record<string, unknown> = { cart: 1 };
    (page.win as unknown as { __builderApp: unknown }).__builderApp = { get: (name: string) => state[name], set: (name: string, value: unknown) => (state[name] = value) };
    startOn(page.win as unknown as Window, config({ timelines: marking, bindings: [{ selector: '#a', interaction: { trigger: { kind: 'click' }, timeline: 'Mark', control: 'play', condition: { kind: 'variable', name: 'cart', compare: 'greater', value: '2' } } }] }), { mode: 'page' });
    const a = page.document.querySelector('#a') as HTMLElement;
    click(a, page.win);
    page.tick(16);
    expect(a.classList.contains('on')).toBe(false);
    state.cart = 3;
    click(a, page.win);
    page.tick(16);
    expect(a.classList.contains('on')).toBe(true);
  });
});

describe('a Set variable action on the application', () => {
  it('sets the variable through the bridge, read as JSON, or keeps it for the application that has not started', () => {
    const setting = { id: 'v', target: { kind: 'self' as const }, start: 0, duration: 0, effect: { kind: 'variable' as const, name: 'open', value: 'true', scope: 'app' as const } };
    const timelines: RuntimeConfig['timelines'] = { Set: { name: 'Set', markers: [], actions: [setting] } };
    const early = fakePage('<button id="a">A</button>');
    startOn(early.win as unknown as Window, config({ timelines, bindings: [{ selector: '#a', interaction: { trigger: { kind: 'click' }, timeline: 'Set', control: 'play' } }] }), { mode: 'page' });
    click(early.document.querySelector('#a') as HTMLElement, early.win);
    early.tick(16);
    expect((early.win as unknown as { __builderAppQueue: unknown }).__builderAppQueue).toEqual([['open', true]]);
    const started = fakePage('<button id="a">A</button>');
    const state: Record<string, unknown> = {};
    (started.win as unknown as { __builderApp: unknown }).__builderApp = { get: (name: string) => state[name], set: (name: string, value: unknown) => (state[name] = value) };
    startOn(started.win as unknown as Window, config({ timelines, bindings: [{ selector: '#a', interaction: { trigger: { kind: 'click' }, timeline: 'Set', control: 'play' } }] }), { mode: 'page' });
    click(started.document.querySelector('#a') as HTMLElement, started.win);
    started.tick(16);
    expect(state.open).toBe(true);
  });
});

describe('the parallax range', () => {
  const placed = (markup: string, top: number, parent: { top: number; bottom: number } | null) => {
    const page = fakePage(markup);
    const layer = page.document.querySelector('#layer') as HTMLElement;
    layer.getBoundingClientRect = () => ({ top, height: 100, left: 0, width: 100, right: 100, bottom: top + 100, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    const section = layer.parentElement as HTMLElement;
    if (parent !== null) section.getBoundingClientRect = () => ({ top: parent.top, bottom: parent.bottom, height: parent.bottom - parent.top, left: 0, right: 100, width: 100, x: 0, y: parent.top, toJSON: () => ({}) }) as DOMRect;
    return { page, layer };
  };
  it('moves no further than its section lets it', () => {
    // its centre 700 against the viewport's 450: half of it is 125 px up, but the section above leaves 40
    const { page, layer } = placed('<section><div id="layer"></div></section>', 650, { top: 610, bottom: 800 });
    startOn(page.win as unknown as Window, config({ behaviours: [{ selector: '#layer', behaviour: { kind: 'parallax', amount: 0.5, axis: 'y' } }] }), { mode: 'page' });
    expect(layer.style.getPropertyValue('translate')).toBe('0 -40px');
  });
  it('moves at most its travel, and only inside the part of the way it is set to', () => {
    const { page, layer } = placed('<section><div id="layer"></div></section>', 650, { top: 0, bottom: 2000 });
    startOn(page.win as unknown as Window, config({ behaviours: [{ selector: '#layer', behaviour: { kind: 'parallax', amount: 0.5, axis: 'y', max: 60 } }] }), { mode: 'page' });
    expect(layer.style.getPropertyValue('translate')).toBe('0 -60px');
    // 25 % of the way: held at 40 % when the range starts there (100 px from the centre, half of it)
    const ranged = placed('<section><div id="layer"></div></section>', 650, { top: 0, bottom: 2000 });
    startOn(ranged.page.win as unknown as Window, config({ behaviours: [{ selector: '#layer', behaviour: { kind: 'parallax', amount: 0.5, axis: 'y', start: 40, end: 100 } }] }), { mode: 'page' });
    expect(ranged.layer.style.getPropertyValue('translate')).toBe('0 -50px');
  });
});

describe('the first paint handed over', () => {
  const entering: RuntimeConfig['timelines'] = {
    In: { name: 'In', markers: [], actions: [{ id: 'a', target: { kind: 'self' }, start: 0, duration: 700, effect: { kind: 'animate', tracks: [{ id: 'o', property: 'opacity', keyframes: [{ id: 'k', time: 0, value: '0' }, { id: 'l', time: 700, value: '1' }] }] } }] },
  };
  it('takes the first-paint class away once its runs hold their first state', () => {
    const page = fakePage('<h1 id="t">Hi</h1>');
    page.document.documentElement.classList.add('bm-motion-start');
    startOn(page.win as unknown as Window, config({ timelines: entering, bindings: [{ selector: '#t', interaction: { trigger: { kind: 'page-load' }, timeline: 'In', control: 'play' } }] }), { mode: 'page' });
    expect(page.document.documentElement.classList.contains('bm-motion-start')).toBe(false);
    expect(page.animations.some((one) => one.keyframes !== null && one.currentTime === 0)).toBe(true);
  });
  it('shows an entrance at its end at once when less motion is asked, before its trigger fires', () => {
    const page = fakePage('<h1 id="t">Hi</h1>');
    page.reduceMotion(true);
    startOn(page.win as unknown as Window, config({ timelines: entering, bindings: [{ selector: '#t', interaction: { trigger: { kind: 'scroll-into-view', threshold: 0.2 }, timeline: 'In', control: 'play' } }] }), { mode: 'page' });
    const moving = page.animations.filter((one) => one.keyframes !== null);
    expect(moving.length).toBeGreaterThan(0);
    expect(moving.every((one) => one.currentTime === 700)).toBe(true);
  });
});
