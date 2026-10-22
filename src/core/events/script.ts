// The plain JavaScript of a project's interactions (group 18, spec export-events-js):
// the one writer of the site's `js/interactions.js`, read by the export (core/export/export.ts, which puts it in the
// archive and links it from the pages that use interactions) and by the preview (previewPage, which runs the same
// script). No framework, no inline handler, no editor id and no data attribute: every element is addressed by the BEM
// class the export gives it or by the person's own `id` attribute, the class the exporter wrote for the element.
//  - A trigger: click; double click; hover; the pointer leaving; the focus in or out; a field changed; (pointerenter, and pointerleave for the actions that reverse: show and hide); entering
//    the screen (an IntersectionObserver, once); the page loading (the script runs deferred, so the page is parsed); a
//    form's submit (the browser's own submit, never navigated away).
//  - An action: show, hide and toggle (the hidden property the editor's eye and a hidden element's export agree on); toggle a
//    class; play an animation (the class rule the export writes beside its @keyframes, restarted when it fires again);
//    scroll to an element; open a link (a new tab like the element's own link, or the same one).
import { walk, type DocNode, type DocumentJson, type Interaction, type NodeId } from '../document/model.ts';
import { actionTarget, firesOnce, interactionsOf, needsAddress, needsAnimation, needsTarget } from './interactions.ts';
import { playedClassName } from '../animation/animation.ts';

// A page links this script while one of its elements holds an interaction. The Tabs and Modal templates are no shape
// this script recognises: they carry the web components' explicit marks (data-wc="tabs" with data-wc-tab and
// data-wc-panel; a button's data-wc-open naming its dialog), which js/widgets.js binds to the panels and the opener
// the person built on the canvas. The shape this script once recognised (a nav of buttons above a div; a dialog with a
// button) made panels and an opener of its own that the document did not hold, and turned a person's own toolbar into
// tabs (the audit's RENDER-3 and RENDER-4; G7).
export const pageNeedsScript = (tree: DocNode): boolean => [...walk(tree)].some((node) => interactionsOf(node).length > 0);

// One selector per node, as the export writes it: the class the export gave the element (the export gives every element
// an interaction addresses a class of its own), or the person's own `id` attribute.
export type SelectorOf = (node: NodeId) => string;

const quoted = (text: string): string => `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

// what an interaction's action does, as JavaScript statements, on the element it acts on: the target it names, else the
// element itself (actionTarget; an action on its own element wrote `if (target)` with no target declared, which throws
// in the script's strict mode, so an animation an element plays on itself never played in the exported site)
function actionJs(node: DocNode, interaction: Interaction, selectorOf: SelectorOf): string | null {
  // an action on the element itself acts on the element the event fired on (`el`): elements that share a class (a
  // component's instances, an interaction that applies to a class) each act on their own (the audit's EV1)
  const find = !needsTarget(interaction.action) ? null : interaction.target === undefined ? 'var target = el;' : `var target = document.querySelector(${quoted(selectorOf(actionTarget(node, interaction)))});`;
  const act: string | null = (() => {
    if (interaction.action === 'show') return `if (target) target.hidden = false;`;
    if (interaction.action === 'hide') return `if (target) target.hidden = true;`;
    // shown when hidden, hidden when shown: a button that opens and closes a part of the page
    if (interaction.action === 'toggle') return `if (target) target.hidden = !target.hidden;`;
    if (interaction.action === 'toggle-class')
      return interaction.className === undefined ? null : `if (target) target.classList.toggle(${quoted(interaction.className)});`;
    if (interaction.action === 'add-class') return interaction.className === undefined ? null : `if (target) target.classList.add(${quoted(interaction.className)});`;
    if (interaction.action === 'remove-class') return interaction.className === undefined ? null : `if (target) target.classList.remove(${quoted(interaction.className)});`;
    if (interaction.action === 'focus') return `if (target) target.focus();`;
    // a dialog element opens as a modal (its backdrop, Escape closes it); any other element is shown and hidden
    if (interaction.action === 'open-dialog') return `if (target) { if (typeof target.showModal === 'function') { if (!target.open) target.showModal(); } else target.hidden = false; }`;
    if (interaction.action === 'close-dialog') return `if (target) { if (typeof target.close === 'function') target.close(); else target.hidden = true; }`;
    // a video or an audio plays or pauses; the element may hold one (a video's frame)
    if (interaction.action === 'play-media') return `if (target) { var media = target.play ? target : target.querySelector('video, audio'); if (media) { var playing = media.play(); if (playing && playing.catch) playing.catch(function () {}); } }`;
    if (interaction.action === 'pause-media') return `if (target) { var media = target.pause ? target : target.querySelector('video, audio'); if (media) media.pause(); }`;
    if (needsAnimation(interaction.action)) {
      if (interaction.animation === undefined) return null;
      // the class rule the export writes next to the @keyframes; taken off and on again so a second firing plays anew
      const name = playedClassName(interaction.animation);
      return `if (target) { target.classList.remove(${quoted(name)}); void target.offsetWidth; target.classList.add(${quoted(name)}); }`;
    }
    // smooth unless the visitor asks the system to reduce motion, as the motion runtime's scroll does (the audit's
    // STYLE-14)
    if (interaction.action === 'scroll-to') return `if (target) target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });`;
    if (needsAddress(interaction.action)) {
      if (interaction.address === undefined) return null;
      return `open(${quoted(interaction.address)}, ${interaction.newTab === true ? 'true' : 'false'});`;
    }
    return null;
  })();
  if (act === null) return null;
  return find === null ? act : `${find} ${act}`;
}

// the action a hover's leave runs, where the action has one (show and hide are each other's)
function reverseJs(node: DocNode, interaction: Interaction, selectorOf: SelectorOf): string | null {
  if (interaction.target === undefined) return null;
  const other = interaction.action === 'show' ? 'hide' : interaction.action === 'hide' ? 'show' : null;
  return other === null ? null : actionJs(node, { ...interaction, action: other }, selectorOf);
}

// one interaction of one element, as the statement that wires it. Its Options: an action that waits runs in a
// setTimeout of its delay; an interaction that fires once runs its action the first time only (a flag per element: a
// submit is still kept on the page every time, a hover's leave runs once after its enter), and one that enters the
// screen every time runs each time the element comes back into view.
function wiringJs(node: DocNode, interaction: Interaction, triggerSelectorOf: SelectorOf, selectorOf: SelectorOf): string | null {
  const action = actionJs(node, interaction, selectorOf);
  if (action === null) return null;
  const delay = interaction.delay ?? 0;
  const later = (js: string): string => (delay > 0 ? `setTimeout(function () { ${js} }, ${String(delay)});` : js);
  const act = later(action);
  const once = firesOnce(interaction);
  const flag = once ? 'var fired = false; ' : '';
  const guard = once ? 'if (fired) return; fired = true; ' : '';
  const selector = triggerSelectorOf(node.id as NodeId);
  if (interaction.trigger === 'click') return `each(${quoted(selector)}, function (el) { ${flag}el.addEventListener('click', function () { ${guard}${act} }); });`;
  if (interaction.trigger === 'hover') {
    const reverse = reverseJs(node, interaction, selectorOf);
    const leave = reverse === null ? null : later(reverse);
    const leaveGuard = once ? 'if (!fired || left) return; left = true; ' : '';
    return `each(${quoted(selector)}, function (el) { ${flag}${once && leave !== null ? 'var left = false; ' : ''}el.addEventListener('pointerenter', function () { ${guard}${act} });${leave === null ? '' : ` el.addEventListener('pointerleave', function () { ${leaveGuard}${leave} });`} });`;
  }
  if (interaction.trigger === 'scroll-into-view') {
    if (once)
      return `each(${quoted(selector)}, function (el) {\n    var fired = false;\n    var observer = new IntersectionObserver(function (entries) {\n      for (var i = 0; i < entries.length; i += 1) {\n        if (!entries[i].isIntersecting || fired) continue;\n        fired = true;\n        observer.disconnect();\n        ${act}\n      }\n    }, { threshold: 0.5 });\n    observer.observe(el);\n  });`;
    return `each(${quoted(selector)}, function (el) {\n    var inside = false;\n    var observer = new IntersectionObserver(function (entries) {\n      for (var i = 0; i < entries.length; i += 1) {\n        var now = entries[i].isIntersecting;\n        if (now && !inside) { ${act} }\n        inside = now;\n      }\n    }, { threshold: 0.5 });\n    observer.observe(el);\n  });`;
  }
  if (interaction.trigger === 'page-load') return `each(${quoted(selector)}, function (el) { ${act} });`;
  // the other events of the element, each the browser's own: a double click, the pointer leaving, the focus coming in
  // or going out (within the element too, so a form's fields count), a field's value changed
  const events: Readonly<Record<string, string>> = { 'double-click': 'dblclick', 'mouse-leave': 'pointerleave', focus: 'focusin', blur: 'focusout', change: 'change' };
  const event = events[interaction.trigger];
  if (event !== undefined) return `each(${quoted(selector)}, function (el) { ${flag}el.addEventListener(${quoted(event)}, function () { ${guard}${act} }); });`;
  if (interaction.trigger === 'form-submit') return `each(${quoted(selector)}, function (el) { ${flag}el.addEventListener('submit', function (event) { event.preventDefault(); ${guard}${act} }); });`;
  return null;
}

// How the script opens an address (Open a link): in a new tab, or in this one. The editor's Preview (one page written
// into a frame) puts PREVIEW_OPEN in its place (export.ts previewPage): there a page of the site is asked of the editor,
// which shows it as it shows a link's page (preview.tsx builderPreviewPage); loaded from the frame's own address, it was
// the editor's address and drew a blank page. The exported site keeps this one, and nothing of the editor.
export const SITE_OPEN = "  var open = function (address, newTab) { if (newTab) window.open(address, '_blank', 'noopener,noreferrer'); else window.location.assign(address); };";
export const PREVIEW_OPEN = "  var open = function (address, newTab) { if (!/^[a-z][a-z0-9+.-]*:/i.test(address)) parent.postMessage({ builderPreviewPage: address }, '*'); else if (newTab) window.open(address, '_blank', 'noopener,noreferrer'); else window.location.assign(address); };";

// The whole script of a project's interactions: the pages' elements in document order, one block per interaction.
// Null while the project holds none (a site without interactions gets no file and no script link).
export function interactionsJs(document: DocumentJson, selectorOf: SelectorOf): string | null {
  const blocks: string[] = [];
  for (const page of document.pages) {
    for (const node of walk(page.tree)) {
      for (const interaction of interactionsOf(node)) {
        // an interaction that applies to a class binds every element with it (model.ts scope, "Applies to": EV1)
        const wired = wiringJs(node, interaction, () => (interaction.scope === undefined ? selectorOf(node.id as NodeId) : `.${interaction.scope}`), selectorOf);
        // the same binding once: the instances of a component share their class, so their copies of one interaction
        // write the same block, which binds every one of them already (EV1)
        if (wired !== null && !blocks.includes(wired)) blocks.push(wired);
      }
    }
  }
  if (blocks.length === 0) return null;
  return [
    '// Generated by Builder: the interactions of the site. Plain JavaScript, no dependencies.',
    '(function () {',
    "  'use strict';",
    '  var each = function (selector, run) {',
    '    var found = document.querySelectorAll(selector);',
    '    for (var i = 0; i < found.length; i += 1) run(found[i]);',
    '  };',
    ...(blocks.some((block) => /(^|[^.\w])open\(/.test(block)) ? [SITE_OPEN] : []),
    ...blocks.map((block) => block.split('\n').map((line) => `  ${line}`).join('\n')),
    '})();',
    '',
  ].join('\n');
}
