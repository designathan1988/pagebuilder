// The page's output: the one owner of what the page writes, on the canvas (render.ts) and in the
// export (core/export/export.ts): the manifest data both need (OutputModel), a node's CSS (nodeCss) and the HTML
// attributes of its element (elementAttributes). No class and no DOM: every tool can load it.
import type { ElementsFile, PropertiesFile } from '../../manifest/schema.ts';
import type { DocNode, StyleClass } from '../document/model.ts';
import { compactDeclarations, type Composite } from './clean.ts';
import { codecOf } from '../style/codecs.ts';
import { buttonKind, pageLanguage } from '../export/names.ts';
import { isPageSetting } from '../page/settings.ts';
import { viewBoxOf } from '../elements/svg.ts';
import { writtenByWord } from '../elements/word-states.ts';
import { hasLogic } from '../logic/model.ts';
import { orderedStates, stateSelector } from '../style/state-keys.ts';

// The manifest data the page's output needs, on the canvas and in the export: the elements, their attributes' HTML
// names, the breakpoints, the states' pseudo-classes and the recipes.
export interface OutputModel {
  readonly composites?: readonly Composite[];
  readonly elements: ReadonlyMap<string, { readonly namespace: 'html' | 'svg'; readonly content: 'children' | 'text' | 'markup' | 'none' }>;
  // attribute id → its HTML attribute name, or null when it is not one (the text, the tag)
  readonly attributes: ReadonlyMap<string, string | null>;
  // attribute id → the element types it applies to, or "all" (a setting of the page applies to a page root's alone)
  readonly appliesTo: ReadonlyMap<string, readonly string[] | 'all'>;
  // the breakpoints in cascade order: the base first, with no media query
  readonly breakpoints: readonly { readonly id: string; readonly width: number; readonly base: boolean }[];
  // state id → its pseudo-class (or pseudo-element) and the element types it stands on (elements.json; null for every
  // one): a rule a browser would ignore is never written (A3.36)
  // and whether it may be an ancestor's (a parent state: core/style/state-keys.ts)
  readonly states: ReadonlyMap<string, { readonly pseudo: string | null; readonly elements: readonly string[] | null; readonly ancestor?: boolean }>;
  // recipe id → its declarations; a null value is the stored value
  readonly recipes: ReadonlyMap<string, readonly { readonly property: string; readonly value: string | null }[]>;
  // property → the fields of its structured value, in order, and how each reaches CSS (properties.json structures)
  readonly structures: ReadonlyMap<string, readonly { readonly id: string; readonly css: 'value' | 'keyword' | 'hides-layer'; readonly keyword: string | null }[]>;
  // the base breakpoint and state, and the properties of a box's size (width, height): an SVG's viewBox is its size
  readonly base: { readonly breakpoint: string; readonly state: string };
  readonly boxSize: readonly string[];
}

const SVG_TAG = 'svg';
// the attribute a link to the page it stands on carries (WAI-ARIA aria-current)
const CURRENT = 'aria-current';
// Whether a link's stored address names the page at `file` (a project path, as a link to a page stores it, with or
// without a fragment or a query): what makes it that page's current link. An address with no path (#top) names no page.
export function linksToFile(address: string, file: string): boolean {
  const cut = address.search(/[#?]/);
  const path = (cut < 0 ? address : address.slice(0, cut)).replace(/^(?:\.\/|\/)+/, '');
  return path !== '' && path === file;
}
const VIEW_BOX = 'viewBox';
// a media part (a <source> or a <track> the person added): HTML writes it only with an address (the audit's A3.6)
const MEDIA_PART_TAGS = new Set(['source', 'track']);
const ADDRESSES = ['src', 'srcset'];

// Whether an element of the page's HTML is written at all, on the canvas and in the export alike: a media part with no
// address is a draft (a Source or Track the person added and did not fill yet) — it stays in the document and in its
// parts editor, and nothing of it reaches the page (the user's real-use audit, A3.6). An image is never dropped: an
// <img> with no source draws its own alternative text (alt=""), the browser's own fallback, which the export keeps.
export function writesNode(node: DocNode, model: OutputModel): boolean {
  const tag = node.tag ?? '';
  if (!MEDIA_PART_TAGS.has(tag)) return true;
  return Object.entries(node.attributes).some(([id, value]) => {
    const name = model.attributes.get(id);
    return name !== null && name !== undefined && ADDRESSES.includes(name) && String(value ?? '') !== '';
  });
}

// The properties of a box's size, width then height: those the size section of properties.json summarises.
const SIZE_SECTION = 'size';
export const boxSizeOf = (properties: PropertiesFile): readonly string[] => properties.sections.find((s) => s.id === SIZE_SECTION)?.summary ?? [];

// A stylesheet's own addresses, resolved: every url(…) an address names goes through the resolver, the way an
// element's source attribute does (files.ts resolvedSource) — the canvas draws a project file through its object URL,
// since it holds the bytes and has no folder to fetch a path from, while the published stylesheet keeps the path.
export function fileUrlsIn(css: string, resolve: (address: string) => string | null): string {
  return css.replace(/url\(\s*(?:'([^']*)'|"([^"]*)"|([^'")]*))\s*\)/g, (all, single: string | undefined, double: string | undefined, bare: string | undefined) => {
    const address = (single ?? double ?? bare ?? '').trim();
    if (address === '') return all;
    const resolved = resolve(address);
    return resolved === null || resolved === address ? all : `url("${resolved}")`;
  });
}

export function outputModelFromManifest(elements: ElementsFile, properties: PropertiesFile): OutputModel {
  return {
    elements: new Map(elements.elements.map((e) => [e.id, { namespace: e.namespace, content: e.content }])),
    attributes: new Map(elements.attributes.map((a) => [a.id, a.html])),
    appliesTo: new Map(elements.attributes.map((a) => [a.id, a.elements])),
    breakpoints: properties.breakpoints.map((b) => ({ id: b.id, width: b.width, base: b.base })),
    states: new Map(properties.states.map((s) => [s.id, { pseudo: s.pseudo, elements: s.elements, ancestor: s.ancestor === true }] as const)),
    base: { breakpoint: properties.breakpoints.find((b) => b.base)?.id ?? '', state: properties.states[0]?.id ?? '' },
    boxSize: boxSizeOf(properties),
    composites: properties.composites.flatMap(c => c.shorthand === null ? [] : [{ shorthand: c.shorthand, longhands: c.longhands, codec: c.codec, compose: codecOf(c.codec)?.compose }]),
    recipes: new Map(properties.recipes.map((r) => [r.id, r.declarations])),
    structures: new Map(
      properties.properties.flatMap((p) => {
        const structure = properties.structures.find((s) => s.id === p.valueType);
        return structure === undefined ? [] : [[p.id, structure.fields.map((f) => ({ id: f.id, css: f.css, keyword: f.keyword }))] as const];
      }),
    ),
  };
}

// The CSS of one node: every declaration of every breakpoint and state it stores, for the selector given; each rule on
// one line for the canvas, or, laid out as a stylesheet a person reads (the export), one declaration per line indented
// by two spaces.
// The viewport the canvas resolves itself (the user's real-use audit, item 2.3; DCS-035): the canvas frame is as tall
// as the whole page, so the page inside it would take that height as its viewport; it takes the breakpoint's screen
// instead — what the site shows in a window of the breakpoint's size. vh, svh, dvh and lvh become that screen's px, and
// a media query's height features (height, aspect-ratio, orientation, and their device- and min-/max- forms) are
// decided against the breakpoint's width × that screen, wherever a stylesheet of the canvas writes them; the export
// keeps the units and queries the person wrote. vw and the width features need no rewriting: the frame is exactly the
// breakpoint wide. The one writer of the canvas's stylesheets (editor/canvas/render/render.ts canvasCss) runs every
// sheet through canvasViewport.
const VIEWPORT_HEIGHT = new RegExp('(^|[^a-z0-9.-])(-?(?:[0-9]+[.]?[0-9]*|[.][0-9]+))(svh|dvh|lvh|vh)(?![a-z])', 'gi');
function viewportUnits(text: string, screen: { readonly height: number }): string {
  return text.replace(VIEWPORT_HEIGHT, (_all, before: string, n: string) => `${before}${Math.round((Number(n) * screen.height) / 100 * 100) / 100}px`);
}
// a feature that always holds and one that never does, in place of a height feature decided against the screen (the
// frame is never 0 px wide)
const HOLDS = '(min-width: 0px)';
const FAILS = '(max-width: 0px)';
// (the height, the ratio of width to height, their device- forms, the orientation)
const HEIGHT_FEATURE = /^(?:device-)?(?:height|aspect-ratio)$|^orientation$/;
const isRatio = (name: string): boolean => name.endsWith('ratio');
const MEDIA_PRELUDE = /@media\b([^{};]*)\{/g;
const FEATURE = /\(([^()]*)\)/g;
// a length or a ratio of a media feature, in px (a ratio as width over height); null for a value this reader does not
// know (left to the browser as written)
function featureValue(text: string, ratio: boolean): number | null {
  const value = text.trim();
  if (ratio) {
    const [w, h] = value.split('/').map((part) => Number(part.trim()));
    if (w === undefined || !Number.isFinite(w)) return null;
    const over = h === undefined ? 1 : h;
    return Number.isFinite(over) && over > 0 ? w / over : null;
  }
  const length = /^(-?[0-9]*\.?[0-9]+)(px|em|rem)?$/i.exec(value);
  if (length === null) return null;
  const n = Number(length[1]);
  const unit = length[2]?.toLowerCase();
  // a bare number is a length only when it is 0; em and rem in a media query are the initial font size's (16 px)
  if (unit === undefined) return n === 0 ? 0 : null;
  return unit === 'px' ? n : n * 16;
}
const compare = (a: number, op: string, b: number): boolean => (op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : op === '>=' ? a >= b : Math.abs(a - b) < 1e-9);
const flipped: Readonly<Record<string, string>> = { '<': '>', '<=': '>=', '>': '<', '>=': '<=', '=': '=' };
// One height feature of a media query decided against the screen: true or false, or null where it is no height
// feature or its value is one this reader does not know.
function heightFeature(text: string, screen: { readonly width: number; readonly height: number }): boolean | null {
  const actual = (name: string): number => (isRatio(name) ? screen.width / screen.height : screen.height);
  const plain = /^\s*(min-|max-)?([a-z-]+)\s*(?::\s*(.+?))?\s*$/i.exec(text);
  if (plain !== null && plain[2] !== undefined && HEIGHT_FEATURE.test(plain[2].toLowerCase())) {
    const name = plain[2].toLowerCase();
    const raw = plain[3];
    if (name === 'orientation') {
      const portrait = screen.height >= screen.width;
      return raw === undefined ? true : raw.trim().toLowerCase() === 'portrait' ? portrait : raw.trim().toLowerCase() === 'landscape' ? !portrait : null;
    }
    if (raw === undefined) return plain[1] === undefined ? actual(name) > 0 : null;
    const wanted = featureValue(raw, isRatio(name));
    if (wanted === null) return null;
    return compare(actual(name), plain[1] === 'min-' ? '>=' : plain[1] === 'max-' ? '<=' : '=', wanted);
  }
  // the range form: (height > 600px), (400px <= height < 900px), (16/9 < aspect-ratio)
  const range = /^\s*(?:([^<>=]+?)\s*(<=|>=|<|>|=)\s*)?([a-z-]+)\s*(?:(<=|>=|<|>|=)\s*([^<>=]+?))?\s*$/i.exec(text);
  if (range === null || range[3] === undefined || !HEIGHT_FEATURE.test(range[3].toLowerCase()) || range[3].toLowerCase() === 'orientation') return null;
  if (range[1] === undefined && range[4] === undefined) return null;
  const name = range[3].toLowerCase();
  let holds = true;
  if (range[1] !== undefined && range[2] !== undefined) {
    const low = featureValue(range[1], isRatio(name));
    if (low === null) return null;
    holds = holds && compare(actual(name), flipped[range[2]] ?? '=', low);
  }
  if (range[4] !== undefined && range[5] !== undefined) {
    const high = featureValue(range[5], isRatio(name));
    if (high === null) return null;
    holds = holds && compare(actual(name), range[4], high);
  }
  return holds;
}
// A stylesheet of the canvas with its viewport resolved against the breakpoint's screen (above).
export function canvasViewport(css: string, screen: { readonly width: number; readonly height: number }): string {
  const units = viewportUnits(css, screen);
  return units.replace(MEDIA_PRELUDE, (rule: string, prelude: string) => {
    const decided = prelude.replace(FEATURE, (feature: string, inner: string) => {
      const holds = heightFeature(inner, screen);
      return holds === null ? feature : holds ? HOLDS : FAILS;
    });
    return decided === prelude ? rule : `@media${decided}{`;
  });
}

// The media query a breakpoint's rules are written in: desktop-first, the breakpoint's width as the widest it covers.
// One writer for the node rules and for the export's cascade order (export.ts, clean.ts cascadeOrder).
export function mediaQuery(breakpoint: { readonly width: number }): string {
  return `@media (max-width: ${breakpoint.width}px)`;
}

export function nodeCss(node: Pick<DocNode, 'styles'> & { readonly type?: string }, selector: string, model: OutputModel, layout: 'line' | 'block' = 'line', extra: readonly string[] = []): string {
  const blocks: string[] = [];
  for (const breakpoint of model.breakpoints) {
    const byState = node.styles[breakpoint.id as keyof DocNode['styles']];
    // a base rule an animation adds to: written even where the element holds no value of its own (spec
    // export-keyframes)
    if (!byState && !(breakpoint.base && extra.length > 0)) continue;
    const rules: string[] = [];
    // the states it holds, in the order their rules are written (core/style/state-keys.ts): the base first, with the
    // declarations an animation adds even where it holds none
    const held = Object.keys(byState ?? {});
    const keys = breakpoint.base && extra.length > 0 && !held.includes(model.base.state) ? [model.base.state, ...held] : held;
    for (const state of orderedStates(keys, model.states)) {
      const declarations = byState?.[state as keyof typeof byState];
      const added = breakpoint.base && state === model.base.state ? extra : [];
      if (!declarations && added.length === 0) continue;
      // a state the element does not stand on writes nothing, however it was stored (A3.36: no :disabled on an h2); a
      // class holds no type of its own and writes what it holds
      const elements = model.states.get(state)?.elements ?? null;
      if (elements !== null && node.type !== undefined && !elements.includes(node.type)) continue;
      const written = stateSelector(selector, state, model.states);
      if (written === null) continue;
      const lines = declarationLines(declarations ?? {}, model, layout).concat(added);
      if (lines.length === 0) continue;
      const indent = breakpoint.base ? '' : '  ';
      rules.push(layout === 'line' ? `${written} { ${lines.join(' ')} }` : `${indent}${written} {\n${lines.map((l) => `${indent}  ${l}`).join('\n')}\n${indent}}`);
    }
    if (rules.length === 0) continue;
    blocks.push(breakpoint.base ? rules.join('\n') : `${mediaQuery(breakpoint)} {\n${rules.join('\n')}\n}`);
  }
  return blocks.join('\n');
}

// The declarations of one layer's values as CSS lines ("width: 240px;"), in the order they are stored: a recipe by its
// own declarations, a structured value (a shadow's layers) by its writer, everything else its stored text (the canvas
// resolves its viewport units in its one stylesheet writer: canvasViewport). The one writer of a declarations object,
// read by the node rules and by an animation's keyframes (core/animation/animation.ts keyframesCss).
export function declarationLines(declarations: Readonly<Record<string, unknown>>, model: OutputModel, layout: 'line' | 'block' = 'line'): string[] {
  const lines = Object.entries(declarations).flatMap(([property, value]) => {
    const recipe = model.recipes.get(property);
    if (recipe) return recipe.map((d) => `${d.property}: ${d.value ?? String(value)};`);
    const fields = model.structures.get(property);
    if (fields !== undefined && Array.isArray(value)) return [`${property}: ${structuredCss(value as readonly Readonly<Record<string, string | boolean>>[], fields)};`];
    return [`${property}: ${String(value)};`];
  });
  return layout === 'block' ? compactDeclarations(lines, model.composites ?? []) : lines;
}

// The project's style classes as their rules (spec shared-style-classes): each class that holds styles, in the
// project's order, its selector the class; the canvas and the export write them before every element's rules, so an
// element's own values, of the same specificity, override them.
export function classesCss(classes: readonly StyleClass[], model: OutputModel, layout: 'line' | 'block' = 'line'): string {
  return classes
    .map((c) => nodeCss(c, `.${c.name}`, model, layout))
    .filter((css) => css !== '')
    .join(layout === 'line' ? '\n' : '\n\n');
}

// The CSS of a structured value (a shadow's layers): each layer that is not hidden, its fields in their structure's
// order (a value as it is stored, a flag as its keyword while it is on), the layers separated by commas; none when no
// layer shows.
export function structuredCss(layers: readonly Readonly<Record<string, string | boolean>>[], fields: readonly { readonly id: string; readonly css: 'value' | 'keyword' | 'hides-layer'; readonly keyword: string | null }[]): string {
  const shown = layers.filter((layer) => !fields.some((f) => f.css === 'hides-layer' && layer[f.id] === true));
  if (shown.length === 0) return 'none';
  return shown
    .map((layer) =>
      fields
        .flatMap((f) => {
          const v = layer[f.id];
          if (f.css === 'value') return typeof v === 'string' ? [v] : [];
          if (f.css === 'keyword') return v === true && f.keyword !== null ? [f.keyword] : [];
          return [];
        })
        .join(' '),
    )
    .join(', ');
}

// The HTML attributes of a node's element as the page writes them, on the canvas and in the export (the editor's own
// marks apart): its classes, its attributes by their HTML names (never an event attribute; a link's address and tab
// only on an <a>; a new tab as target _blank with rel noopener noreferrer), and the person's own attributes (never
// over one of the model's). On the page root, the settings of the page go to the page's <html> (page).
export function elementAttributes(
  node: DocNode,
  tag: string,
  root: boolean,
  model: OutputModel,
  // how a stored value is written (a project file as its object URL on the canvas, a reference as the target's id
  // attribute): null writes nothing at all (a reference whose target holds no id; core/elements/references.ts)
  resolve: (name: string, value: string) => string | null = (_name, value) => value,
  // `currentPage`: whether a link's stored address is the page written (the export's page, the canvas's open page)
  context: { readonly language?: string; readonly inForm?: boolean; readonly currentPage?: (address: string) => boolean } = {},
): { readonly element: Map<string, string | true>; readonly page: Map<string, string> } {
  const element = new Map<string, string | true>();
  const page = new Map<string, string>();
  let address: string | null = null;
  if (node.classes.length > 0) element.set('class', node.classes.join(' '));
  for (const [id, value] of Object.entries(node.attributes)) {
    const name = model.attributes.get(id);
    if (name === null || name === undefined || name.startsWith('on') || value === false) continue;
    // a link switched to a button keeps its address and tab in the document, for when it is switched back, but a
    // button is no link
    if ((name === 'href' || name === 'target') && tag !== 'a') continue;
    if (name === 'href') address = String(value);
    if (name === 'target' && value === true) {
      element.set('target', '_blank');
      element.set('rel', 'noopener noreferrer');
      continue;
    }
    // a boolean attribute is written by its name alone (true), a word state by the word (aria-hidden="true",
    // core/elements/word-states.ts); a text attribute with an empty value keeps its ""
    const written = value === true ? (writtenByWord(name) ? 'true' : true) : resolve(name, String(value));
    if (written === null) continue;
    (root && isPageSetting(model.appliesTo.get(id), node.type) ? page : element).set(name, written);
  }
  for (const [name, value] of Object.entries(node.customAttributes ?? {})) if (!element.has(name)) element.set(name, value);
  // an element its item's content hides (core/data/materialize.ts: a show binding that does not hold, a repeated item
  // past a list's first page on the site) is hidden on the canvas and on the page alike, by the base style's [hidden]
  if (node.dataHidden === true) element.set('hidden', true);
  // a link to the page written is its current page's link (spec state-styles: the Current state styles
  // [aria-current="page"]; Webflow's w--current): the export marks it on the page it writes, the canvas on the open
  // page, unless the person wrote an aria-current of their own
  if (tag === 'a' && address !== null && element.has('href') && !element.has(CURRENT) && context.currentPage?.(address) === true) element.set(CURRENT, 'page');
  // an element with logic is found by the application runtime by its id (core/logic/compile.ts, spec app-logic)
  if (hasLogic(node)) element.set('data-app', node.id);
  // the code component it draws (spec app-logic): the canvas shows its name where the site draws it
  if (node.logic?.component !== undefined) element.set('data-app-component', node.logic.component);
  if (root) page.set('lang', pageLanguage(page.get('lang'), context.language));
  if (tag === 'button') element.set('type', buttonKind(element.get('type'), context.inForm === true, typeof element.get('form') === 'string' && element.get('form') !== ''));
  // an input says its type, the HTML default "text" included, as a button does (html-validate no-implicit-input-type;
  // the audit's AUD-22)
  if (tag === 'input' && !element.has('type')) element.set('type', 'text');
  // an SVG draws in its own size: a unit of its drawing is a CSS px (spec elements-svg-shapes, Problems in Pager 2)
  const viewBox = tag === SVG_TAG ? viewBoxOf(node, model) : null;
  if (viewBox !== null) element.set(VIEW_BOX, viewBox);
  return { element, page };
}

