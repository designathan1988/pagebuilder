// The screen guard: what a person sees wrong on the editor's screen, checked at the end of every browser test (as the
// incident guard checks the document and the page's errors: tests/support/test.ts) and at each screen the sweeps open
// (tests/e2e/screen-sweep.spec.ts). Each kind is a family of defects, held by one rule for every surface instead of a
// test per surface:
//
// - cut: a text of the interface wider (or taller) than the box that clips it, with no ellipsis, or with one and its
//   whole text nowhere a person can read it (a title or an accessible name on it or on its control);
// - wrapped: a one-line name of the interface (a field's name, a button, a tab, a menu item, an option, a chip, a
//   title) drawn on two lines or more;
// - off-window: a control a person must reach whose visible part passes the window's edge;
// - covered: a control a press cannot reach, because another part of the editor that is not a layer opened above it
//   (a menu, a dialog, a popover, the command bar) lies over most of it — two canvas controls over each other among them;
// - english: in Portuguese, an interface text that is an English catalogue text;
// - sideways: a panel that scrolls down holding content wider than itself, so it scrolls sideways too or hides what
//   lies past its side until the focus scrolls it there (CLAUDE.md, rule G5: the Inspector scrolled 45 px sideways
//   under every Style tab, a copy of its keyword buttons measured out of sight widening it, and the focus put in a field
//   scrolled it and cut every label).
//
// Every kind fails the test that leaves it on screen. Exceptions are only those of tests/support/screen-guard-allowed.ts,
// each with its reason. The guard's own precision and recall are proven on pages built of each defect and of the same
// thing drawn right (tests/e2e/screen-guard.spec.ts). SCREEN_GUARD=report writes a test's findings to
// .cache/screen-guard/ as well, to look at them all at once; it never lets one pass.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import { ALLOWED } from './screen-guard-allowed.ts';

export type FindingKind = 'cut' | 'wrapped' | 'off-window' | 'covered' | 'english' | 'sideways';
export interface Finding {
  readonly kind: FindingKind;
  readonly text: string;
  readonly where: string;
  readonly box: readonly [number, number, number, number];
  // what was measured (a cut text: its scroll and client sizes, its font and whether the page's fonts had loaded)
  readonly detail?: string;
}

export const SCREEN_GUARD_DIR = path.join('.cache', 'screen-guard');
export const REPORT = process.env.SCREEN_GUARD === 'report';

// the English texts of the interface whose Portuguese differs (a CSS value is written as CSS in both languages)
const catalogue = (locale: string) => JSON.parse(fs.readFileSync(path.join('src', 'i18n', 'locales', `${locale}.json`), 'utf8')) as Record<string, string>;
const en = catalogue('en');
const ptBR = catalogue('pt-BR');
// a word that is the Portuguese text of some key is Portuguese too ("Canvas" names the canvas element in both, and is the
// English of the canvas view, "Tela")
const PORTUGUESE = new Set(Object.values(ptBR).map((value) => value.trim()));
const ENGLISH: readonly string[] = [
  ...new Set(
    Object.entries(en)
      .filter(([key, value]) => ptBR[key] !== undefined && ptBR[key] !== value && !value.includes('{') && /[a-z]{3}/.test(value))
      .map(([, value]) => value.trim())
      .filter((value) => !PORTUGUESE.has(value)),
  ),
];

// Runs in the editor's page (never inside the canvas's frame): the findings on screen now.
export function screenFindings(input: { readonly english: readonly string[] | null; readonly allowed: readonly { readonly kind: string; readonly selector: string; readonly by?: string }[]; readonly project?: readonly string[] }): Finding[] {
  const out: Finding[] = [];
  const SHORT_VALUE = 24;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const english = input.english === null ? null : new Set(input.english);
  // the texts the project itself holds (its names, tags, classes, words): the person's, never the interface's
  const project = new Set(input.project ?? []);
  // an exception names the element it covers, and for a control covered, what covers it
  const allowed = (kind: string, el: Element, by?: Element) => input.allowed.some((rule) => rule.kind === kind && el.closest(rule.selector) !== null && (rule.by === undefined || by?.closest(rule.by) != null));
  // the layers a person opens over the editor, which cover what lies under them on purpose until they close, by their
  // roles (WAI-ARIA: a menu, a listbox, a dialog, a tooltip), the editor's own floating surfaces (a popover, a floating
  // panel window, the open quick panel over the selection's handles: canvas-editing.css, DEC-75, a drag's ghost), and
  // any surface fixed over the whole window (a dialog's shield, a menu's backdrop)
  const LAYERS = '.quick-panel,[role=menu],[role=dialog],[role=alertdialog],[role=listbox],[role=tooltip],.popover,.menu,.command-bar,[data-region=toast],.floating,.panel-window,[data-drag-ghost],.chrome-ghost-stack';
  // a surface fixed over the whole window that the hit belongs to and the control does not (a dialog's shield lies over
  // the editor, never over what the dialog itself holds)
  const shield = (hit: Element, under: Element): boolean => {
    for (let e: Element | null = hit; e !== null && e !== document.body; e = e.parentElement) {
      const b = e.getBoundingClientRect();
      if (style(e).position === 'fixed' && b.width * b.height >= 0.9 * W * H) return !e.contains(under);
    }
    return false;
  };
  // a modal dialog open (aria-modal: what lies outside it is inert, WAI-ARIA): only what is inside it must take presses
  const modal = [...document.querySelectorAll('[aria-modal="true"]')].filter((m) => m.getClientRects().length > 0).at(-1) ?? null;
  // every element's computed style, read once: the checks below walk the same ancestors for thousands of elements
  const styles = new Map<Element, CSSStyleDeclaration>();
  const style = (el: Element): CSSStyleDeclaration => {
    let held = styles.get(el);
    if (held === undefined) {
      held = getComputedStyle(el);
      styles.set(el, held);
    }
    return held;
  };
  // The window's layers, by the editor's own scale (src/ui/tokens.css, --z-toast, --z-floating, --z-menu…): a
  // surface placed at one of them floats over the editor — a floating panel, a toast — and covers what lies under it
  // on purpose
  const floatsFrom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--z-toast')) || 40;
  const windowLayer = (e: Element | null): Element | null => {
    for (let x = e; x !== null && x !== document.body; x = x.parentElement) {
      const cs = style(x);
      if ((cs.position === 'fixed' || cs.position === 'absolute') && Number.parseInt(cs.zIndex, 10) >= floatsFrom) return x;
    }
    return null;
  };
  // a value written as CSS writes it, in the code face (DEC-65), and a key's name (kbd) are no interface text
  const codeFace = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim();
  // clipped to nothing (a text kept for screen readers alone: clip-path inset(50%), or a clip of zero area) is unseen
  const clippedAway = (cs: CSSStyleDeclaration) => /inset\(50%/.test(cs.clipPath) || /rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)/.test(cs.clip);
  // whether an element hides all it holds, itself or through an ancestor (transparent, hidden, clipped away): read once
  // per element
  const hiding = new Map<Element, boolean>();
  const hides = (el: Element | null): boolean => {
    if (el === null) return false;
    const known = hiding.get(el);
    if (known !== undefined) return known;
    const s = style(el);
    const value = Number(s.opacity) === 0 || s.visibility === 'hidden' || clippedAway(s) || hides(el.parentElement);
    hiding.set(el, value);
    return value;
  };
  const shown = (el: Element): DOMRect | null => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    const s = style(el);
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0 || clippedAway(s)) return null;
    return hides(el.parentElement) ? null : r;
  };
  // the window an element's content is seen through: the boxes of the ancestors that clip (an overflow other than
  // visible on an axis, paint containment on both), itself included, up to a fixed layer; read once per element
  type Box = [number, number, number, number];
  const EVERYWHERE: Box = [-Infinity, -Infinity, Infinity, Infinity];
  const clips = new Map<Element, Box>();
  const clipOf = (p: Element | null): Box => {
    if (p === null || p === document.documentElement) return EVERYWHERE;
    const known = clips.get(p);
    if (known !== undefined) return known;
    const s = style(p);
    const above = s.position === 'fixed' ? EVERYWHERE : clipOf(p.parentElement);
    const paint = s.contain.includes('paint');
    const x = s.overflowX !== 'visible' || paint;
    const y = s.overflowY !== 'visible' || paint;
    let box = above;
    if (x || y) {
      const pr = p.getBoundingClientRect();
      box = [x ? Math.max(above[0], pr.left) : above[0], y ? Math.max(above[1], pr.top) : above[1], x ? Math.min(above[2], pr.right) : above[2], y ? Math.min(above[3], pr.bottom) : above[3]];
    }
    clips.set(p, box);
    return box;
  };
  // whether what was hit belongs to a sticky element of the scroller that holds `el` too (within a few levels of the hit)
  const scrollerOf = (e: Element | null): Element | null => {
    for (let p = e?.parentElement ?? null; p !== null; p = p.parentElement) {
      const o = style(p).overflowY;
      if (o === 'auto' || o === 'scroll') return p;
    }
    return null;
  };
  const stuckOver = (hit: Element, el: Element): boolean => {
    let sticky: Element | null = hit;
    for (let i = 0; sticky !== null && i < 4 && style(sticky).position !== 'sticky'; i += 1) sticky = sticky.parentElement;
    if (sticky === null || style(sticky).position !== 'sticky') return false;
    const scroller = scrollerOf(sticky);
    return scroller !== null && scroller === scrollerOf(el);
  };
  // the part of a box a person sees: clipped by every ancestor that clips, up to a fixed layer
  const seen = (el: Element, r: DOMRect): [number, number, number, number] | null => {
    const [cl, ct, cr, cb] = clipOf(el.parentElement);
    const [l, t, ri, b] = [Math.max(r.left, cl), Math.max(r.top, ct), Math.min(r.right, cr), Math.min(r.bottom, cb)];
    return ri - l < 1 || b - t < 1 ? null : [l, t, ri, b];
  };
  // the window an element can be brought into: as clipOf, but a scroller (an overflow of auto or scroll on an axis)
  // hides nothing on that axis, as a person scrolls it to what it holds. A text cut or wrapped, or English, is so
  // wherever its scroller stands: these are read on what a person can reach, never on where the test left the scroll
  const reaches = new Map<Element, Box>();
  const reachOf = (p: Element | null): Box => {
    if (p === null || p === document.documentElement) return EVERYWHERE;
    const known = reaches.get(p);
    if (known !== undefined) return known;
    const s = style(p);
    const above = s.position === 'fixed' ? EVERYWHERE : reachOf(p.parentElement);
    const paint = s.contain.includes('paint');
    const scrolls = (overflow: string) => overflow === 'auto' || overflow === 'scroll';
    const x = !scrolls(s.overflowX) && (s.overflowX !== 'visible' || paint);
    const y = !scrolls(s.overflowY) && (s.overflowY !== 'visible' || paint);
    let box = above;
    if (x || y) {
      const pr = p.getBoundingClientRect();
      box = [x ? Math.max(above[0], pr.left) : above[0], y ? Math.max(above[1], pr.top) : above[1], x ? Math.min(above[2], pr.right) : above[2], y ? Math.min(above[3], pr.bottom) : above[3]];
    }
    reaches.set(p, box);
    return box;
  };
  const reachable = (el: Element, r: DOMRect): [number, number, number, number] | null => {
    const [cl, ct, cr, cb] = reachOf(el.parentElement);
    const [l, t, ri, b] = [Math.max(r.left, cl), Math.max(r.top, ct), Math.min(r.right, cr), Math.min(r.bottom, cb)];
    return ri - l < 1 || b - t < 1 ? null : [l, t, ri, b];
  };
  const where = (el: Element): string => {
    const region = el.closest('[data-region]')?.getAttribute('data-region') ?? '';
    const parts: string[] = [];
    let e: Element | null = el;
    for (let i = 0; i < 3 && e !== null && e !== document.body; i += 1, e = e.parentElement) {
      const cls = [...e.classList].slice(0, 2).join('.');
      const door = e.getAttribute('data-door');
      parts.unshift(`${e.tagName.toLowerCase()}${cls ? `.${cls}` : ''}${door ? `[${door}]` : ''}`);
    }
    return `${region} :: ${parts.join(' > ')}`;
  };
  const box = (b: readonly [number, number, number, number]): [number, number, number, number] => [Math.round(b[0]), Math.round(b[1]), Math.round(b[2] - b[0]), Math.round(b[3] - b[1])];
  const rect = (r: DOMRect): [number, number, number, number] => [r.left, r.top, r.right, r.bottom];
  const ownText = (el: Element): string =>
    [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent ?? '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
  // the controls a person reaches and names: a part of one (a drag zone inside a bar) is no control of its own
  const NAMED_CONTROL = 'button,input:not([type=hidden]),select,textarea,a[href],[role=button],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],[role=tab],[role=option],[role=checkbox],[role=radio],[role=switch],[role=slider]';
  const named = (el: Element, text: string): boolean => {
    // the whole text readable elsewhere: a title or an accessible name on it, or on the control it belongs to (the
    // nearest control around it, which a person hovers or a reader names)
    for (let e: Element | null = el, i = 0; e !== null && i < 4; e = e.parentElement, i += 1) {
      for (const attribute of ['title', 'aria-label']) {
        const value = e.getAttribute(attribute);
        if (value !== null && value.replace(/\s+/g, ' ').includes(text)) return true;
      }
      if (e.matches(NAMED_CONTROL)) break;
    }
    return false;
  };
  const CONTROL = `${NAMED_CONTROL},[data-door]`;
  // what a cut was judged on, for the report
  const measured = (el: Element, s: CSSStyleDeclaration): string =>
    `scroll ${el.scrollWidth}x${el.scrollHeight} in client ${el.clientWidth}x${el.clientHeight}, ${s.fontSize} ${s.fontFamily.split(',')[0] ?? ''}, fonts ${document.fonts.status}`;
  // the elements read, in one walk of the page: a subtree no person reads is left whole (a frame, a script, an icon's
  // drawing, what is measured off screen, kept for screen readers, hidden from them, inert, or a test's own harness)
  const SKIPPED = '.is-measuring,.visually-hidden,[aria-hidden="true"],[inert],[data-test-harness]';
  const all: Element[] = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) => {
      const el = node as Element;
      return el.tagName === 'IFRAME' || el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName.toLowerCase() === 'svg' || el.matches(SKIPPED) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let node = walk.nextNode(); node !== null; node = walk.nextNode()) all.push(node as Element);
  for (const el of all) {
    const tag = el.tagName;
    const text = ownText(el);
    // every check reads a text of the element's own, a field, or a control: a box holding none of them is passed over
    if (text === '' && tag !== 'INPUT' && !el.matches(CONTROL)) continue;
    const r = shown(el);
    if (r === null) continue;
    const s = style(el);
    // what a person can scroll to (the cut, wrapped and English texts are read there), and what is in view now (the
    // controls out of the window or covered are read there)
    const reached = reachable(el, r);
    if (reached === null) continue;
    const visible = seen(el, r);
    // CUT — of a text a person sees: one drawn in a transparent colour is not (a field at rest draws its value in its
    // face, field-face.tsx, over its input's own text made transparent: the face is what is read)
    const unseen = /^rgba\(.*,\s*0\)$|^transparent$/.test(s.color);
    if ((text !== '' || tag === 'INPUT') && tag !== 'TEXTAREA' && !unseen) {
      const clips = s.overflowX === 'hidden' || s.overflowX === 'clip' || s.textOverflow === 'ellipsis';
      if (clips && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 4) {
        const input = tag === 'INPUT' ? (el as HTMLInputElement) : null;
        const value = input === null ? text : input.value || input.placeholder;
        // a number fits its field whole (a value field shows its face over a transparent input: field-face.tsx); a
        // field of free text (a cell of a data table, a CSS declaration, an address) scrolls its text as any text
        // field does, and a field being typed in scrolls with the caret
        const numeric = input !== null && (input.type === 'number' || input.getAttribute('role') === 'spinbutton');
        const skip = input !== null && (!numeric || document.activeElement === input || value.length > SHORT_VALUE);
        const ellipsisNamed = s.textOverflow === 'ellipsis' && named(el, value);
        if (value !== '' && !skip && !ellipsisNamed && !allowed('cut', el)) out.push({ kind: 'cut', text: value.slice(0, 80), where: where(el), box: box(reached), detail: measured(el, s) });
      }
      if (text !== '' && s.whiteSpace === 'normal' && (s.overflowY === 'hidden' || s.overflowY === 'clip') && el.scrollHeight > el.clientHeight + 2 && !named(el, text) && !allowed('cut', el)) {
        out.push({ kind: 'cut', text: text.slice(0, 80), where: where(el), box: box(reached), detail: measured(el, s) });
      }
    }
    // WRAPPED: a short name of the interface drawn on two lines or more
    if (text.length > 2 && text.length <= 40) {
      const role = el.getAttribute('role') ?? '';
      const name =
        tag === 'BUTTON' ||
        tag === 'LABEL' ||
        tag === 'TH' ||
        tag === 'DT' ||
        ['menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'option', 'button'].includes(role) ||
        /(^|[-_])(label|name|title|head|caption|chip|tab)s?($|[-_])/.test(el.className.toString());
      // a name drawn to take more than one line on purpose is not wrapped: a line clamp, or the lines a label declares it
      // may wrap to (--label-lines: a palette tile's name grows with its tile, sidebar.css; read by the ui-fit measure)
      const clamped =
        (s.getPropertyValue('-webkit-line-clamp') !== '' && s.getPropertyValue('-webkit-line-clamp') !== 'none') ||
        Number.parseInt(s.getPropertyValue('--label-lines'), 10) > 1;
      if (name && !clamped && el.closest('p,[role=alert],[role=status],.toast,.notice,.hint,.empty,[data-region=assistant]') === null) {
        // the lines of its own text only: a label holding its field (a grid of the name over the input) has the field's
        // box below the name, which is no second line of the name
        const tops = new Set(
          [...el.childNodes]
            .filter((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '')
            .flatMap((n) => {
              const range = document.createRange();
              range.selectNodeContents(n);
              return [...range.getClientRects()];
            })
            .filter((q) => q.width > 0)
            .map((q) => Math.round(q.top)),
        );
        if (tops.size > 1 && !allowed('wrapped', el)) out.push({ kind: 'wrapped', text: text.slice(0, 80), where: where(el), box: box(reached) });
      }
    }
    if (visible !== null && el.matches(CONTROL) && (modal === null || modal.contains(el))) {
      // OFF-WINDOW
      if ((visible[0] < -1 || visible[1] < -1 || visible[2] > W + 1 || visible[3] > H + 1) && !allowed('off-window', el)) {
        out.push({ kind: 'off-window', text: (text || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('data-door') || tag).slice(0, 80), where: where(el), box: box(visible) });
      }
      // COVERED: what is seen of it takes no press of its own at most of five points along its length (its centre and
      // four more, so a long grip with a handle at its middle still takes presses, and a strip lying wholly under
      // another control does not)
      // only a control at least half in sight: one a scroller holds mostly out of view is the scroller's to bring back
      const [l, t, ri, b] = visible;
      const inSight = ri - l >= r.width / 2 && b - t >= r.height / 2;
      if (inSight && ri - l >= 4 && b - t >= 4 && s.pointerEvents !== 'none' && l >= 0 && t >= 0 && ri <= W && b <= H) {
        const wide = ri - l >= b - t;
        const points = [0.2, 0.35, 0.5, 0.65, 0.8].map((f) => (wide ? [l + (ri - l) * f, (t + b) / 2] : [(l + ri) / 2, t + (b - t) * f]) as [number, number]);
        // the centre first, then outwards; hit-testing is the guard's cost, so it stops as soon as the answer is known:
        // three points free mean three covered can no longer be reached, and three covered are enough
        const covering: Element[] = [];
        let free = 0;
        for (const at of [2, 1, 3, 0, 4]) {
          const [x, y] = points[at] as [number, number];
          const hit = document.elementFromPoint(x, y);
          const own = hit !== null && (el.contains(hit) || hit.contains(el) || (hit as HTMLLabelElement).control === el);
          // a layer opened above (a menu, a dialog, a popover) covers what is under it on purpose, until it closes
          const above = hit !== null && !own && ((hit.closest(LAYERS) !== null && el.closest(LAYERS) !== hit.closest(LAYERS)) || (windowLayer(hit) !== null && windowLayer(hit) !== windowLayer(el)) || shield(hit, el));
          // what a test mounts over the editor for its own proof (data-test-harness) is no part of the screen
          const harness = hit !== null && hit.closest('[data-test-harness]') !== null;
          // a header held at the top of the list it heads (position: sticky; the Inspector's sections, DEF-0598) is
          // the scroller's edge for what passes under it: what lies there is scrolled out of view, not covered
          const scrolledUnder = hit !== null && !own && stuckOver(hit, el);
          if (hit !== null && !own && !above && !harness && !scrolledUnder) covering.push(hit);
          else free += 1;
          if (free >= 3 || covering.length >= 3) break;
        }
        if (covering.length >= 3 && !allowed('covered', el, covering[0])) {
          out.push({ kind: 'covered', text: `${(text || el.getAttribute('aria-label') || el.getAttribute('data-door') || tag).slice(0, 50)} under ${where(covering[0] as Element)}`, where: where(el), box: box(visible) });
        }
      }
    }
    // ENGLISH
    const code = tag === 'KBD' || el.closest('kbd') !== null || (codeFace !== '' && s.fontFamily === codeFace);
    if (english !== null && text.length > 3 && english.has(text) && !project.has(text) && !code && !allowed('english', el)) out.push({ kind: 'english', text, where: where(el), box: box(rect(r)) });
  }
  // SIDEWAYS: a box that scrolls down (an overflow of auto or scroll down) holds its content across, whatever it does
  // with its own overflow across: wider content scrolls it sideways, or lies hidden past its side where a focus scrolls
  // it into view. Named by the box's own name, or its region's; the width it lacks is the detail.
  for (const el of all) {
    const s = style(el);
    if (s.overflowY !== 'auto' && s.overflowY !== 'scroll') continue;
    if (el.clientWidth < 4 || el.scrollWidth <= el.clientWidth + 1) continue;
    const r = shown(el);
    if (r === null || allowed('sideways', el)) continue;
    const name = el.getAttribute('aria-label') ?? el.closest('[data-region]')?.getAttribute('data-region') ?? el.tagName.toLowerCase();
    // what passes its side furthest, the first box that does on its way down (the one to fix)
    const side = r.left + el.clientWidth;
    let widest: Element | null = null;
    let furthest = 1;
    for (const inner of el.querySelectorAll('*')) {
      const ir = inner.getBoundingClientRect();
      const parent = inner.parentElement;
      if (ir.width < 1 || ir.right - side <= furthest || (parent !== null && parent !== el && parent.getBoundingClientRect().right - side > 1)) continue;
      widest = inner;
      furthest = ir.right - side;
    }
    const by = widest === null ? '' : `, past it: ${where(widest)} by ${Math.round(furthest)}px`;
    out.push({ kind: 'sideways', text: name, where: where(el), box: box(rect(r)), detail: `+${el.scrollWidth - el.clientWidth}px across, overflow-x ${s.overflowX}${by}` });
  }
  return out;
}

const NOT_FINISHED = new Set(['timedOut', 'interrupted']);

// At the end of a test: the findings of the page it leaves, reported or failing the test.
// `step` names a screen a test checks on its way (responsive-matrix.spec.ts: each surface it opens), its findings
// kept apart
export async function guardScreen(page: Page, info: TestInfo, step = ''): Promise<readonly Finding[]> {
  if (page.isClosed() || NOT_FINISHED.has(info.status ?? '')) return [];
  // the screen once it is still, as Playwright's screenshot assertion waits for two equal pictures: what the test did last
  // is drawn and the editor's own placing (the chrome's arrangement, a panel's place) has settled — three frames with
  // nothing changed in the page, at most twenty (a screen that animates on its own is read as it stands then); and then
  // whether the page is the editor, and in which language it speaks
  const settled = await page
    .evaluate(
      () =>
        new Promise<{ readonly editor: boolean; readonly portuguese: boolean }>((resolve) => {
          const editor = '__builderTestPort' in window && document.querySelector('.workbench') !== null;
          const said = () => ({ editor, portuguese: document.documentElement.lang === 'pt-BR' });
          if (!editor) {
            resolve(said());
            return;
          }
          let changed = false;
          let quiet = 0;
          let frames = 0;
          const seen = new MutationObserver(() => {
            changed = true;
          });
          seen.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
          const tick = () => {
            frames += 1;
            quiet = changed ? 0 : quiet + 1;
            changed = false;
            if (quiet >= 3 || frames >= 20) {
              seen.disconnect();
              resolve(said());
            } else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
    )
    .catch(() => ({ editor: false, portuguese: false }));
  if (!settled.editor) return [];
  const portuguese = settled.portuguese;
  // every text the project holds, read from the document through the test port (names, tags, classes, the words of its
  // texts): shown in a Portuguese editor, they are the person's own words, whatever their language
  const project = portuguese
    ? await page
        .evaluate(() => {
          const held = new Set<string>();
          const walk = (value: unknown): void => {
            if (typeof value === 'string') held.add(value.replace(/\s+/g, ' ').trim());
            else if (Array.isArray(value)) value.forEach(walk);
            else if (value !== null && typeof value === 'object') Object.values(value).forEach(walk);
          };
          walk((window as unknown as { __builderTestPort?: { document: () => unknown } }).__builderTestPort?.document());
          return [...held];
        })
        .catch(() => [] as string[])
    : [];
  const found = await page.evaluate(screenFindings, { english: portuguese ? ENGLISH : null, allowed: ALLOWED.map(({ kind, selector, by }) => ({ kind, selector, ...(by === undefined ? {} : { by }) })), project }).catch(() => [] as Finding[]);
  if (REPORT && found.length > 0) {
    const test = [path.relative(process.cwd(), info.file).replaceAll('\\', '/'), ...info.titlePath.slice(1), ...(step === '' ? [] : [step])].join(' › ');
    const viewport = page.viewportSize();
    fs.mkdirSync(SCREEN_GUARD_DIR, { recursive: true });
    fs.writeFileSync(path.join(SCREEN_GUARD_DIR, `${crypto.createHash('sha1').update(test).digest('hex')}.json`), JSON.stringify({ test, viewport, portuguese, found }));
  }
  return found;
}
