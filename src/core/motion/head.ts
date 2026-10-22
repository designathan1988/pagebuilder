// What motion writes in a page's head, before its first paint (spec export-motion-js, page-transitions): the first
// states of the elements the page's interactions hold until they fire (first-paint.ts), and the transition between the
// site's pages (page-transition.ts). The export writes these lines after the stylesheet's link; the preview shows the
// exported page, so it writes them too.
import { playedClassName } from '../animation/animation.ts';
import { walk, type DocNode, type DocumentJson, type NodeId } from '../document/model.ts';
import { motionConfig, type RuntimeConfig } from './export.ts';
import { firstPaintRules, firstPaintScript } from './first-paint.ts';
import { pageTransitionCss, pageTransitionOf, pageTransitionScript } from './page-transition.ts';

// `classOf`: the class the export gave one of the page's nodes, if any; a node without one is addressed by its own
// id attribute, as the motion script addresses it (core/export/export.ts siteFiles)
export function motionHeadLines(document: DocumentJson, tree: DocNode, breakpoints: RuntimeConfig['breakpoints'], classOf: (node: NodeId) => string | undefined): readonly string[] {
  const own = new Map<string, DocNode>();
  for (const node of walk(tree)) own.set(node.id, node);
  const selectorOf = (id: NodeId): string | null => {
    const node = own.get(id);
    if (node === undefined) return null;
    const generated = classOf(id);
    const named = node.attributes.id;
    return generated !== undefined ? `.${generated}` : typeof named === 'string' && named !== '' ? `#${named}` : null;
  };
  const config = motionConfig(document, { selectorOf, breakpoints, playedClassName, lottie: false });
  const rules = config === null ? [] : firstPaintRules(config);
  const lines: string[] = [];
  if (rules.length > 0) lines.push('  <style>', ...rules.map((line) => `    ${line}`), '  </style>', `  <script>${firstPaintScript()}</script>`);
  const transition = pageTransitionOf(document);
  if (transition !== null) lines.push('  <style>', ...pageTransitionCss(transition).map((line) => `    ${line}`), '  </style>', '  <script>', ...pageTransitionScript(document, transition).split('\n').map((line) => `  ${line}`), '  </script>');
  return lines;
}
