// The transition between the site's pages (spec page-transitions): the page leaving and the page arriving animate
// (a fade, or a slide to the side), set for the whole site (DocumentJson.pageTransition) and per link by its own
// attribute (PAGE_TRANSITION_ATTRIBUTE: a kind, or "none").
//  - Where the browser has view transitions across documents (Chrome 126+, a page served over http or https), the
//    pages opt in with @view-transition and the leaving and arriving snapshots animate by the transition's type, which
//    the script names on both pages (pageswap, pagereveal) from the link the visitor followed.
//  - Elsewhere (a page opened from disk, a browser without them) the script plays the leaving animation on the page,
//    then follows the link; the arriving page plays its entering animation from its first paint (the window's name
//    carries the kind across, as nothing else of the leaving page reaches the next one from file://).
//  - In the editor's Preview (one page in a frame), a link asks the editor whether it opens a page (preview.tsx
//    builderPreviewGoes): another page of the site, or an item page, plays the leaving animation, then asks the editor
//    for that page (builderPreviewPage), which arrives entering; the open page itself, or a page the site does not
//    have, is answered with a stay (builderPreviewAnswer), and the page stays shown (scrolled to the link's fragment).
//  - A link to a place of the same page (its own address with a fragment) is no page change: nothing animates.
//  - Less motion asked: no animation at all, the link followed at once.
//  - Nothing stays hidden: the entering animation runs from CSS alone and ends visible, and a page shown again from
//    the back-forward cache drops the leaving state.
// Written into the head of every page, inline, so it runs before the first paint; nothing when the site has no
// transition and no link names one.
import { walk, type DocumentJson } from '../document/model.ts';
import { PAGE_TRANSITION_ATTRIBUTE, type PageTransition } from './model.ts';

// the duration a link's own transition takes while the site sets none
const LINK_ONLY_DURATION = 300;
// the window's name a leaving page hands the arriving one: this prefix, then the kind
const NAME_PREFIX = 'bm-page-transition:';

// The site's transition, or the one its links ask for when only they name one (a fade of LINK_ONLY_DURATION, the
// kind each link names), or null when nothing asks for one.
export function pageTransitionOf(document: DocumentJson): PageTransition | null {
  if (document.pageTransition !== undefined) return document.pageTransition;
  for (const page of document.pages) for (const node of walk(page.tree)) if (node.customAttributes?.[PAGE_TRANSITION_ATTRIBUTE] !== undefined) return { kind: 'fade', duration: LINK_ONLY_DURATION };
  return null;
}

// whether the site's own transition is none, and only its links ask for one
const linksOnly = (document: DocumentJson): boolean => document.pageTransition === undefined;

// The rules of the transitions: the view transition's opt-in and its animations by type, and the same animations on
// the body for the script's own leaving and entering, all under no-preference for reduced motion.
export function pageTransitionCss(transition: PageTransition): readonly string[] {
  const time = `${transition.duration}ms`;
  const ease = 'cubic-bezier(0.22, 1, 0.36, 1)';
  return [
    '@media (prefers-reduced-motion: no-preference) {',
    '  @view-transition {',
    '    navigation: auto;',
    '  }',
    '  @keyframes bm-page-fade-out { to { opacity: 0; } }',
    '  @keyframes bm-page-fade-in { from { opacity: 0; } }',
    '  @keyframes bm-page-slide-out { to { opacity: 0; translate: -40px 0; } }',
    '  @keyframes bm-page-slide-in { from { opacity: 0; translate: 40px 0; } }',
    `  html:active-view-transition-type(bm-fade)::view-transition-old(root) { animation: bm-page-fade-out ${time} ${ease} both; }`,
    `  html:active-view-transition-type(bm-fade)::view-transition-new(root) { animation: bm-page-fade-in ${time} ${ease} both; }`,
    `  html:active-view-transition-type(bm-slide)::view-transition-old(root) { animation: bm-page-slide-out ${time} ${ease} both; }`,
    `  html:active-view-transition-type(bm-slide)::view-transition-new(root) { animation: bm-page-slide-in ${time} ${ease} both; }`,
    `  html.bm-page-out-fade body { animation: bm-page-fade-out ${time} ${ease} forwards; }`,
    `  html.bm-page-out-slide body { animation: bm-page-slide-out ${time} ${ease} forwards; }`,
    `  html.bm-page-in-fade body { animation: bm-page-fade-in ${time} ${ease} both; }`,
    `  html.bm-page-in-slide body { animation: bm-page-slide-in ${time} ${ease} both; }`,
    '}',
  ];
}

// The script of the transitions (plain JavaScript, ES5, no module): the site's kind and duration, then the arrival,
// the view transition's types, and the links followed.
export function pageTransitionScript(document: DocumentJson, transition: PageTransition): string {
  const site = linksOnly(document) ? 'none' : transition.kind;
  const lines = [
    '(function () {',
    `  var SITE = '${site}', TIME = ${transition.duration}, NAME = '${NAME_PREFIX}', ATTRIBUTE = '${PAGE_TRANSITION_ATTRIBUTE}';`,
    '  var root = document.documentElement;',
    "  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;",
    "  var preview = location.protocol === 'about:';",
    "  var crossDocument = 'onpagereveal' in window && !preview && location.protocol !== 'file:';",
    '  var arrived = null;',
    "  if (window.name.indexOf(NAME) === 0) { arrived = window.name.slice(NAME.length); window.name = ''; }",
    "  var kinds = { fade: true, slide: true };",
    '  // the arriving page enters from its first paint where no view transition carries it',
    "  if (!crossDocument && !reduced && kinds[arrived]) {",
    "    root.classList.add('bm-page-in-' + arrived);",
    "    setTimeout(function () { root.classList.remove('bm-page-in-' + arrived); }, TIME + 50);",
    '  }',
    '  var chosen = null;',
    '  var typed = function (event, kind) {',
    '    if (!event.viewTransition) return;',
    "    if (reduced || !kinds[kind]) event.viewTransition.skipTransition();",
    "    else event.viewTransition.types.add('bm-' + kind);",
    '  };',
    "  window.addEventListener('pagereveal', function (event) { typed(event, arrived || SITE); });",
    "  window.addEventListener('pageswap', function (event) { typed(event, chosen || SITE); });",
    "  var shown = function () { root.classList.remove('bm-page-out-fade', 'bm-page-out-slide'); };",
    "  window.addEventListener('pageshow', function (event) { if (event.persisted) shown(); });",
    '  // the preview: the editor answers whether it opens the page a link names (another page, an item page) or stays (the',
    '  // open page, a page the site does not have); the page leaves only for a page that opens, and is shown again, at the',
    "  // link's fragment, when the editor stays",
    '  var leaving = null;',
    "  var post = function (message) { window.parent.postMessage(message, '*'); };",
    "  if (preview) window.addEventListener('message', function (event) {",
    '    var answer = event.source === window.parent && event.data ? event.data.builderPreviewAnswer : null;',
    "    if (!answer || typeof answer !== 'object') return;",
    '    var left = leaving;',
    '    leaving = null;',
    '    if (answer.goes === true && left !== null) {',
    "      root.classList.add('bm-page-out-' + left.kind);",
    '      setTimeout(function () { post({ builderPreviewPage: left.address }); }, TIME);',
    '      return;',
    '    }',
    "    window.name = '';",
    '    shown();',
    "    var target = typeof answer.fragment === 'string' && answer.fragment !== '' ? document.getElementById(answer.fragment) : null;",
    '    if (target) target.scrollIntoView();',
    '  });',
    "  document.addEventListener('click', function (event) {",
    '    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;',
    "    var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;",
    '    if (!link || link.hasAttribute(\'download\')) return;',
    "    var address = link.getAttribute('href');",
    "    if (!address || address.charAt(0) === '#' || /^[a-z][a-z0-9+.-]*:/i.test(address) || address.indexOf('//') === 0) return;",
    "    if (!preview && link.target && link.target !== '_self') return;",
    '    // a link to a place of this same page (its address and a fragment) is no page change: the browser only scrolls',
    "    if (!preview && link.hash !== '' && link.pathname === location.pathname && link.search === location.search) return;",
    '    var kind = link.getAttribute(ATTRIBUTE) || SITE;',
    '    chosen = kind;',
    '    window.name = NAME + kind;',
    '    if (preview) {',
    '      event.preventDefault();',
    '      if (reduced || !kinds[kind]) post({ builderPreviewPage: address });',
    '      else {',
    '        leaving = { address: address, kind: kind };',
    '        post({ builderPreviewGoes: address });',
    '      }',
    '      return;',
    '    }',
    '    if (crossDocument || reduced || !kinds[kind]) return;',
    '    event.preventDefault();',
    "    root.classList.add('bm-page-out-' + kind);",
    '    setTimeout(function () { location.href = link.href; }, TIME);',
    '  });',
    '})();',
  ];
  return lines.join('\n');
}
