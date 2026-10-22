// The document's format versions (the plan's T4): what a file written by an older version becomes when this app reads
// it, and what happens to one this app cannot read.
//
// Every reader of a project document goes through `migrateDocument` before it validates (File › Open and the restored
// autosave both read through src/core/project/archive.ts readProject): a document of the current version is taken as it
// is, an older one is carried forward step by step by the chain, and one of a version newer than this app is refused —
// never guessed at. A version the chain has no step for is refused too, so a hole in the chain is a refusal with a
// reason instead of a document half-read. One repair runs on every version after the chain: the references a
// component's definition kept to elements a delete took away (STRUCT-6, withDefinitionReferencesReleased below).
//
// Version 2 gives captured pages an HTML-root class setting. Version 3 gives captured pages a distinct ordered
// source DOM; old authored pages keep their existing tree and gain no capture data in either migration step.
// Version 4 holds a captured page as one tree for every observed width (DEC-61): a version-3 page kept one snapshot per
// width with no node identity between them, so it keeps its widest snapshot.
// A second repair runs on every version: a parent state naming a class the project no longer has, which a rename or a
// delete of the class left behind before both took their parent states into account (the review's R-1), is dropped.
import { DOCUMENT_VERSION, type DocumentJson } from './model.ts';
import { referenceHtmlOf } from '../elements/references.ts';
import { parentKeyClass } from '../style/state-keys.ts';

export interface Migration {
  // the version the document is at, and the one this step brings it to
  readonly from: number;
  readonly to: number;
  // the document as this step leaves it: the same object, changed where the format changed
  readonly migrate: (document: Record<string, unknown>) => Record<string, unknown>;
}

// The steps this app knows, in order.
const MIGRATIONS: readonly Migration[] = [
  { from: 1, to: 2, migrate: (document) => ({ ...document, version: 2 }) },
  { from: 2, to: 3, migrate: (document) => ({ ...document, version: 3 }) },
  { from: 3, to: 4, migrate: (document) => ({ ...document, version: 4, pages: Array.isArray(document.pages) ? document.pages.map(widestCapture) : document.pages }) },
];

function widestCapture(page: unknown): unknown {
  if (page === null || typeof page !== 'object' || !('capture' in page)) return page;
  const capture = (page as { capture: unknown }).capture as { viewports?: unknown; resourceProblems?: unknown } | null;
  if (capture === null || typeof capture !== 'object' || !Array.isArray(capture.viewports)) return page;
  // only the snapshots that are one (an object with its width): a file written by hand may hold anything there, and
  // the validator refuses the capture it leaves (DEF-0544)
  const snapshots = (capture.viewports as unknown[]).filter((one): one is { width: number; root: unknown } => one !== null && typeof one === 'object' && typeof (one as { width?: unknown }).width === 'number');
  const widest = [...snapshots].sort((a, b) => b.width - a.width)[0];
  if (widest === undefined) return page;
  return { ...page, capture: { widths: [widest.width], root: widest.root, ...(capture.resourceProblems === undefined ? {} : { resourceProblems: capture.resourceProblems }) } };
}

export type MigrationResult =
  | { readonly ok: true; readonly document: unknown }
  | { readonly ok: false; readonly reason: 'not-a-document' | 'newer'; readonly version?: number }
  | { readonly ok: false; readonly reason: 'no-step'; readonly version: number };

// The document a parsed file holds, carried to this app's version, or why it cannot be.
export function migrateDocument(parsed: unknown, chain: readonly Migration[] = MIGRATIONS, current: number = DOCUMENT_VERSION): MigrationResult {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, reason: 'not-a-document' };
  const version = (parsed as { version?: unknown }).version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { ok: false, reason: 'not-a-document' };
  if (version > current) return { ok: false, reason: 'newer', version };
  let document = parsed as Record<string, unknown>;
  let at = version;
  while (at < current) {
    const step = chain.find((one) => one.from === at);
    if (step === undefined) return { ok: false, reason: 'no-step', version: at };
    document = step.migrate(document);
    at = step.to;
  }
  return { ok: true, document: withOrphanParentStatesDropped(withDefinitionReferencesReleased(document)) as unknown as DocumentJson };
}

// A component's definition that points at an element no longer there, released (the audit's STRUCT-6): before the
// fix, a delete let go of every reference on the pages but kept the ones a definition held, and a project saved then
// holds them still. The validator now refuses such a definition (validate.ts definitionReferenceProblems), so without
// this repair that project would no longer open; what the delete should have released is released here, the same
// way (tree.ts releaseReferencesPatch): an interaction whose target is gone, a `for` or "#…" reference that names
// no node id and no HTML id of the definition or of the pages. The format did not change, so this runs on every
// version, and a document that holds no such reference is returned as it is (the same object).
function withDefinitionReferencesReleased(document: Record<string, unknown>): Record<string, unknown> {
  const { components, pages } = document;
  if (!Array.isArray(components) || !Array.isArray(pages)) return document;
  const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
  const nodesOf = (root: unknown): Record<string, unknown>[] => {
    const found: Record<string, unknown>[] = [];
    const visit = (node: unknown): void => {
      if (!record(node)) return;
      found.push(node);
      if (Array.isArray(node.children)) node.children.forEach(visit);
    };
    visit(root);
    return found;
  };
  const nodeIdsOf = (nodes: readonly Record<string, unknown>[]): Set<string> => new Set(nodes.map((node) => node.id).filter((id): id is string => typeof id === 'string'));
  const htmlIdsOf = (nodes: readonly Record<string, unknown>[]): Set<string> =>
    new Set(nodes.map((node) => (record(node.attributes) ? node.attributes.id : undefined)).filter((id): id is string => typeof id === 'string' && id !== ''));
  // the validator's own reading: an interaction names a node id (a page's, its captured tree's, or the definition's),
  // a reference a node id or an HTML id of the pages or of the definition
  const pageNodes = pages.flatMap((page) => (record(page) ? nodesOf(page.tree) : []));
  const capturedNodes = pages.flatMap((page) => (record(page) && record(page.capture) ? nodesOf(page.capture.root) : []));
  const pageNodeIds = nodeIdsOf([...pageNodes, ...capturedNodes]);
  const pageHtmlIds = htmlIdsOf(pageNodes);
  let changed = false;
  const next = components.map((component) => {
    if (!record(component) || !record(component.tree)) return component;
    const ownNodes = nodesOf(component.tree);
    const ownNodeIds = nodeIdsOf(ownNodes);
    const ownHtmlIds = htmlIdsOf(ownNodes);
    const isNode = (name: string): boolean => ownNodeIds.has(name) || pageNodeIds.has(name);
    const known = (name: string): boolean => isNode(name) || ownHtmlIds.has(name) || pageHtmlIds.has(name);
    const repair = (node: Record<string, unknown>): Record<string, unknown> => {
      let out = node;
      if (record(node.attributes)) {
        const attributes = Object.fromEntries(Object.entries(node.attributes).filter(([name, value]) => {
          const html = referenceHtmlOf(name);
          if (html === undefined || typeof value !== 'string' || value === '' || (html === 'href' && !value.startsWith('#'))) return true;
          return known(value.startsWith('#') ? value.slice(1) : value);
        }));
        if (Object.keys(attributes).length !== Object.keys(node.attributes).length) out = { ...out, attributes };
      }
      if (Array.isArray(node.interactions)) {
        const interactions = node.interactions.filter((one) => !record(one) || typeof one.target !== 'string' || isNode(one.target));
        if (interactions.length !== node.interactions.length) {
          const { interactions: _gone, ...rest } = out;
          void _gone;
          out = interactions.length === 0 ? rest : { ...rest, interactions };
        }
      }
      if (Array.isArray(node.children)) {
        const children = node.children.map((child) => (record(child) ? repair(child) : child));
        if (children.some((child, i) => child !== (node.children as unknown[])[i])) out = { ...out, children };
      }
      if (out !== node) changed = true;
      return out;
    };
    const tree = repair(component.tree);
    return tree === component.tree ? component : { ...component, tree };
  });
  return changed ? { ...document, components: next } : document;
}

// The parent states that name a class the project has not (the review's R-1: a class renamed or deleted left its
// `parent:<class>:<state>` keys on the elements and classes that held them), dropped from the pages' elements, the
// components' definitions and the classes, with a breakpoint they leave empty. The export wrote them as a rule no
// element matches, so nothing the page shows changes; the validator now refuses them (validate.ts orphanParentStates),
// and without this repair such a project would no longer open. A document that holds none is returned as it is.
function withOrphanParentStatesDropped(document: Record<string, unknown>): Record<string, unknown> {
  const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
  const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);
  const trees = [...list(document.pages), ...list(document.components)].map((one) => (record(one) ? one.tree : undefined));
  const known = new Set<string>();
  for (const one of list(document.classes)) if (record(one) && typeof one.name === 'string') known.add(one.name);
  const wear = (node: unknown): void => {
    if (!record(node)) return;
    for (const name of list(node.classes)) if (typeof name === 'string') known.add(name);
    list(node.children).forEach(wear);
  };
  trees.forEach(wear);
  const kept = (styles: unknown): unknown => {
    if (!record(styles)) return styles;
    let dropped = false;
    const next: Record<string, unknown> = {};
    for (const [breakpoint, byState] of Object.entries(styles)) {
      if (!record(byState)) {
        next[breakpoint] = byState;
        continue;
      }
      const states = Object.entries(byState).filter(([key]) => {
        const className = parentKeyClass(key);
        return className === null || known.has(className);
      });
      if (states.length === Object.keys(byState).length) next[breakpoint] = byState;
      else {
        dropped = true;
        if (states.length > 0) next[breakpoint] = Object.fromEntries(states);
      }
    }
    return dropped ? next : styles;
  };
  const repair = (node: unknown): unknown => {
    if (!record(node)) return node;
    let out = node;
    const styles = kept(node.styles);
    if (styles !== node.styles) out = { ...out, styles };
    if (Array.isArray(node.children)) {
      const children = node.children.map(repair);
      if (children.some((child, i) => child !== (node.children as unknown[])[i])) out = { ...out, children };
    }
    return out;
  };
  const withTree = (one: unknown): unknown => {
    if (!record(one)) return one;
    const tree = repair(one.tree);
    return tree === one.tree ? one : { ...one, tree };
  };
  const withStyles = (one: unknown): unknown => {
    if (!record(one)) return one;
    const styles = kept(one.styles);
    return styles === one.styles ? one : { ...one, styles };
  };
  const changedIn = (key: 'pages' | 'components' | 'classes', change: (one: unknown) => unknown): Record<string, unknown> => {
    if (!Array.isArray(document[key])) return {};
    const before = document[key] as unknown[];
    const after = before.map(change);
    return after.some((one, i) => one !== before[i]) ? { [key]: after } : {};
  };
  const repaired = { ...changedIn('pages', withTree), ...changedIn('components', withTree), ...changedIn('classes', withStyles) };
  return Object.keys(repaired).length === 0 ? document : { ...document, ...repaired };
}
