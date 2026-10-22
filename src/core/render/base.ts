// The project's base style (spec base-style; the user's real-use audit, item 2.4): the rules every page starts from —
// the heading ladder (h1 32 px down to h6 14 px, the browser's own top two steps and a step between each below them),
// border-box sizing, so a height or a width the person sets is the size the element takes on screen, padding and
// border included, and a hero at 100vh measures the screen. One owner: the editor's canvas writes it into the page's
// document before every other rule (editor/canvas/render/render.ts) and every exported stylesheet carries it at its
// head (core/export/export.ts), so what the canvas shows is what the site does. A list keeps the browser's own indent
// (its
// rule once narrowed it to 1.5rem, and a list nested in an item then indented 24 px where the browser indents 40:
// spec elements-lists, Problems in Pager 6, "no style of the editor's own").
//
// A neutral starting point for page content belongs here, not in each node's stored styles. All presentation rules
// use :where() so a class or an element's own declaration wins without extra specificity. The one exception is
// [hidden]: a hidden element (its hidden flag, written as the hidden attribute by the export; a tab panel or a
// filtered item the site's scripts hide) stays hidden whatever display its own rule or class gives it, as the canvas
// hides it (render.ts, data-hidden with display: none !important). The browser's own [hidden] rule loses to any author
// display (the audit's RENDER-1: a hidden Row showed on the exported site). An embedded frame, like an image or a
// video, never grows wider than its container: its default 420 px overflowed the 390 px Phone breakpoint (RENDER-9);
// its height stays the one it is given (an iframe has no intrinsic ratio for height: auto to keep).
// A function, not a constant: the tooth proof switches a module off by stubbing its exports (tools/runner/
// tooth-plugin.ts), and only a function can be stubbed.
import { generate as generateCssTree, parse as parseCssTree } from 'css-tree';

// The web components' closed parts (editor/widgets/widgets.js, the ready components of the Insert panel): the cart
// drawer, the phone menu's links, every tab panel but the first, the countdown's "over" text and the filter's "nothing
// matches" text stay closed until the site's script opens them, which it does by marking the part data-wc-open. The
// closed state is CSS beside the base, which the canvas writes after it and the export writes into the stylesheet of a
// site that holds a web component (core/export/export.ts siteFiles; the rules match nothing on a page without one),
// unscoped on a captured page too, since the marks are the builder's own (the user's final-use audit, USE-1: the rule
// lived in the script alone, so the canvas, which runs no script, drew the cart drawer open over the page). The
// canvas opens a part while it or a node inside it is selected (editor/canvas/render/render.ts reveal), so it can be
// seen and edited; the document and the export keep it closed.
export const WIDGET_OPEN_ATTRIBUTE = 'data-wc-open';
// Whether a node with these custom attributes is a closed part of a web component (the rules below name each one).
// A popup's opener names its dialog in the same attribute (data-wc-open="<id>"): it is no part of these rules.
export function widgetClosedPart(attributes: Readonly<Record<string, string>>): boolean {
  const kind = attributes['data-wc'];
  return kind === 'cart' || kind === 'menu' || 'data-wc-panel' in attributes || 'data-wc-done' in attributes || 'data-wc-empty' in attributes;
}
export function widgetStateCss(): string {
  return `[data-wc="cart"]:not([data-wc-open]) { transform: translateX(105%); visibility: hidden; }
[data-wc="tabs"] [data-wc-panel] ~ [data-wc-panel]:not([data-wc-open]) { display: none !important; }
[data-wc="countdown"] [data-wc-done]:not([data-wc-open]) { display: none !important; }
[data-wc="filter"] [data-wc-empty]:not([data-wc-open]) { display: none !important; }
@media (max-width: 767px) {
  [data-wc="menu"] [data-wc-toggle] { display: inline-flex !important; }
  [data-wc="menu"]:not([data-wc-open]) [data-wc-menu] { display: none !important; }
  [data-wc="menu"][data-wc-open] [data-wc-menu] { display: flex !important; flex-direction: column; width: 100%; }
}
`;
}

export function baseCss(): string {
  return `*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
:where(body) { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 16px; line-height: 1.5; }
:where(h1, h2, h3, h4, h5, h6) { margin: 0 0 0.6em; font-weight: 700; line-height: normal; }
:where(h1) { font-size: 2rem; }
:where(h2) { font-size: 1.5rem; }
:where(h3) { font-size: 1.25rem; }
:where(h4) { font-size: 1.125rem; }
:where(h5) { font-size: 1rem; }
:where(h6) { font-size: 0.875rem; }
:where(p, ul, ol, dl) { margin: 0 0 1rem; }
:where(a) { color: #2563eb; text-decoration-thickness: 1px; text-underline-offset: 2px; }
:where(blockquote) { margin: 0 0 1rem; padding: 0.75rem 1rem; border-inline-start: 3px solid #cbd5e1; background: #f8fafc; color: #475569; }
:where(pre) { max-width: 100%; margin: 0 0 1rem; padding: 1rem; overflow: auto; border: 1px solid #e2e8f0; border-radius: 6px; background: #f8fafc; color: #0f172a; }
:where(pre, code, kbd, samp) { font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace; }
:where(hr) { margin: 1.5rem 0; border: 0; border-top: 1px solid #cbd5e1; }
:where(table) { width: 100%; margin: 0 0 1rem; border-collapse: collapse; }
:where(th, td) { padding: 0.625rem 0.75rem; border: 1px solid #e2e8f0; text-align: start; }
:where(th) { background: #f8fafc; color: #0f172a; font-weight: 600; }
:where(figure) { margin: 0 0 1rem; }
:where(figcaption) { margin-top: 0.5rem; color: #64748b; font-size: 0.875rem; }
:where(img, video) { max-width: 100%; height: auto; }
:where(iframe) { max-width: 100%; }
:where(button, input, select, textarea) { font: inherit; color: inherit; }
:where(button, input[type="button"], input[type="submit"], input[type="reset"]) { padding: 0.625rem 1rem; border: 1px solid #cbd5e1; border-radius: 6px; background: #f1f5f9; color: #0f172a; cursor: pointer; }
:where([role="tab"][aria-selected="true"]) { background: #dbeafe; border-color: #93c5fd; }
:where(input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="file"]):not([type="hidden"]):not([type="image"]):not([type="button"]):not([type="submit"]):not([type="reset"]), textarea, select) { max-width: 100%; min-height: 2.5rem; padding: 0.5rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; color: #0f172a; }
:where(button, input, select, textarea):focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
:where(fieldset) { margin: 0 0 1rem; padding: 1rem; border: 1px solid #cbd5e1; border-radius: 6px; }
:where(legend) { padding-inline: 0.25rem; font-weight: 600; }
`;
}

// Captured pages retain the site's own user-agent and author defaults. In a project containing both captured and
// authored pages, the shared stylesheet still gives the authored pages the Builder base, with zero added specificity.
// The captured page itself carries data-builder-capture on <html> in canvas and export.
export const CAPTURE_BASE_LAYER = '__builder_base';
export function capturedBaseCss(): string {
  const scope = ':where(html:not([data-builder-capture]))';
  const lines = baseCss().split('\n').map((line) => {
    const brace = line.indexOf('{');
    if (brace < 0) return line;
    const selectors = parseCssTree(line.slice(0, brace).trim(), { context: 'selectorList' });
    if (selectors.type !== 'SelectorList') throw new Error('The Builder base has an invalid selector list');
    return `${selectors.children.toArray().map((selector) => `${scope} ${generateCssTree(selector)}`).join(', ')} ${line.slice(brace)}`;
  });
  return `${scope} { box-sizing: border-box; }\n${lines.join('\n')}`;
}
