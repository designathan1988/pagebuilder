// The tree's structure, in one place (the plan's T1): the patches that take a subtree out, put
// children in, and release the references that pointed at what is leaving — and the one test that says whether a move
// would put a node inside itself.
//
// The invariants this module owns are the tree's own, so the commands that move, remove or replace elements cannot
// forget one: a node sits in exactly one place, a reference never points at nothing, a move never targets its own
// subtree. Policy — locks, the content model, names, the words a refusal says — belongs to the commands, which refuse
// before they build anything (a predictable invalid operation never becomes a patch; see the store's commit).
//
// Every function is pure: it reads the document and returns patches, never a new document (the store's one applier
// applies them), so a command can compose several and hand them out in one transaction.
import { locate, walk, type DocNode, type DocumentJson, type NodeId, type Location } from './model.ts';
import { referenceNamesLeaving, referencesOf } from '../elements/references.ts';
import { releaseMotionTargets } from '../motion/document.ts';
import { parentKeyClass } from '../style/state-keys.ts';
import type { Patch, Path } from '../history/transaction.ts';

// The path children of a node take: the parent's own path, then the index among its children.
export function childPath(parentPath: Path, index: number): Path {
  return [...parentPath, 'children', index];
}

// A subtree leaving its place (its paths and its node, as the document holds them now).
export function removeSubtree(at: Location): Patch[] {
  return [{ op: 'remove', path: at.path }];
}

// Whether putting a subtree under this parent would put it inside itself: the parent is the node itself or one of its
// descendants. One rule, read by every move and every wrap (the plan's T1; the refusal's words are the caller's).
export function movesIntoItself(moved: readonly DocNode[], parentId: NodeId): boolean {
  return moved.some((node) => [...walk(node)].some((inner) => inner.id === parentId));
}

// The names a reference may give what is leaving: every node id going away, and the HTML id each of them carries that
// no node staying carries too — an imported reference names its target by that id (a label's for="email", a link's
// "#contact": references.ts orphanReferences), and once its element leaves it names nothing (the audit's RF1).
export function leavingNames(document: DocumentJson, leaving: ReadonlySet<NodeId>): ReadonlySet<string> {
  const names = new Set<string>(leaving);
  const staying = new Set<string>();
  const going: string[] = [];
  for (const page of document.pages) {
    for (const node of walk(page.tree)) {
      const id = node.attributes.id;
      if (typeof id !== 'string' || id === '') continue;
      if (leaving.has(node.id)) going.push(id);
      else staying.add(id);
    }
  }
  for (const id of going) if (!staying.has(id)) names.add(id);
  return names;
}

// The patches that release every reference pointing at what is leaving: a label's `for`, a link's `#anchor`. What
// leaves is the id of every node going away — the node itself and, when a subtree goes, everything inside it — with the
// HTML id it alone carries (leavingNames), and no node that stays may point at one of them (a reference to nothing is
// what the validator refuses a document over).
export function releaseReferencesPatch(document: DocumentJson, leaving: ReadonlySet<NodeId>, names: ReadonlySet<string> = leavingNames(document, leaving)): Patch[] {
  const patches: Patch[] = [];
  for (const reference of referencesOf(document)) {
    // a node that is itself leaving goes with its attributes: nothing to release
    if (leaving.has(reference.node.id)) continue;
    const named = reference.value.startsWith('#') ? reference.value.slice(1) : reference.value;
    if (!names.has(named)) continue;
    const at = locate(document, reference.node.id);
    if (at !== null) patches.push({ op: 'remove', path: [...at.path, 'attributes', reference.attribute] });
  }
  // an interaction that acts on a node that is leaving goes with it: its script would select nothing (the export wrote
  // querySelector(".") for it, which throws)
  for (const page of document.pages) {
    for (const node of walk(page.tree)) {
      if (leaving.has(node.id) || node.interactions === undefined) continue;
      const kept = node.interactions.filter((one) => one.target === undefined || !leaving.has(one.target));
      if (kept.length === node.interactions.length) continue;
      const at = locate(document, node.id);
      if (at !== null) patches.push(kept.length === 0 ? { op: 'remove', path: [...at.path, 'interactions'] } : { op: 'replace', path: [...at.path, 'interactions'], value: kept });
    }
  }
  // a component's definition lets go too (the audit's STRUCT-6): its elements may point at an element of a page (a
  // button that shows a panel outside the card), and every instance placed later copies what the definition holds, so
  // a definition left pointing at a deleted element made every Insert, Repeat and Fill of its component refused
  // (an HTML id the definition's own elements carry still names one of them: what points at it stays)
  (document.components ?? []).forEach((component, c) => {
    const own = new Set([...walk(component.tree)].map((node) => node.attributes.id).filter((id): id is string => typeof id === 'string' && id !== ''));
    const gone = own.size === 0 ? names : new Set([...names].filter((name) => !own.has(name)));
    const visit = (node: DocNode, path: Path): void => {
      if (!leaving.has(node.id)) {
        for (const [attribute, value] of Object.entries(node.attributes)) {
          if (referenceNamesLeaving(attribute, value, gone)) patches.push({ op: 'remove', path: [...path, 'attributes', attribute] });
        }
        if (node.interactions !== undefined) {
          const kept = node.interactions.filter((one) => one.target === undefined || !leaving.has(one.target));
          if (kept.length !== node.interactions.length) patches.push(kept.length === 0 ? { op: 'remove', path: [...path, 'interactions'] } : { op: 'replace', path: [...path, 'interactions'], value: kept });
        }
      }
      node.children.forEach((child, i) => visit(child, childPath(path, i)));
    };
    visit(component.tree, ['components', c, 'tree']);
  });
  // a motion action that acts on a picked element that is leaving goes with it (core/motion/document.ts)
  patches.push(...releaseMotionTargets(document, leaving));
  return patches;
}

// The classes worn by the elements of the pages and of the components' definitions.
function wornClasses(document: DocumentJson): ReadonlySet<string> {
  const worn = new Set<string>();
  for (const one of [...document.pages, ...(document.components ?? [])]) for (const node of walk(one.tree)) for (const name of node.classes) worn.add(name);
  return worn;
}

// The patches that release every parent state (`parent:card:hover`, core/style/state-keys.ts) naming a class a change
// took out of the project: a class no rule registered (an imported page's elements wear classes of their own) is the
// project's only while an element wears it, so once a change leaves none wearing it — the last one deleted, cut,
// replaced, unwrapped or written anew, or the class taken off it — the export's `.card:hover .title` matches nothing
// and the validator refuses the key (validate.ts orphanParentStates). Read from the documents before and after the
// change, so it holds whatever command made it and whatever it wrote back. A registered class is never released here:
// it leaves only through its own commands, which rename or refuse its parent states (design/classes.ts).
// `after` is the document the patches apply to; a breakpoint left with no state goes too.
export function releasedParentStates(before: DocumentJson, after: DocumentJson): Patch[] {
  if (before === after) return [];
  const registered = new Set((before.classes ?? []).map((one) => one.name));
  const stays = new Set([...(after.classes ?? []).map((one) => one.name), ...wornClasses(after)]);
  const gone = new Set([...wornClasses(before)].filter((name) => !registered.has(name) && !stays.has(name)));
  if (gone.size === 0) return [];
  const patches: Patch[] = [];
  const release = (styles: DocNode['styles'] | undefined, path: Path): void => {
    for (const [breakpoint, states] of Object.entries(styles ?? {})) {
      const keys = Object.keys(states ?? {});
      const going = keys.filter((key) => {
        const className = parentKeyClass(key);
        return className !== null && gone.has(className);
      });
      if (going.length === 0) continue;
      if (going.length === keys.length) patches.push({ op: 'remove', path: [...path, 'styles', breakpoint] });
      else for (const key of going) patches.push({ op: 'remove', path: [...path, 'styles', breakpoint, key] });
    }
  };
  const visit = (node: DocNode, path: Path): void => {
    release(node.styles, path);
    node.children.forEach((child, i) => visit(child, childPath(path, i)));
  };
  after.pages.forEach((page, i) => visit(page.tree, ['pages', i, 'tree']));
  (after.components ?? []).forEach((component, i) => visit(component.tree, ['components', i, 'tree']));
  (after.classes ?? []).forEach((one, i) => release(one.styles, ['classes', i]));
  return patches;
}

// The ids of a subtree: the node and everything under it.
export function subtreeIds(node: DocNode): ReadonlySet<NodeId> {
  return new Set([...walk(node)].map((inner) => inner.id as NodeId));
}

// A node and its subtree with every reference to what is leaving taken away (`leaving`: the names leavingNames gives,
// the node ids and the HTML ids that go).
//
// A patch cannot do this job for a node a command writes back — a re-inserted child, a replaced subtree: the patch
// would have to run before the write (the old paths) and the write puts the value back. So the rule has two shapes,
// both here: patches for the nodes that stay where they are, and this value-level one for the nodes that are written.
export function withoutReferencesTo(node: DocNode, leaving: ReadonlySet<string>): DocNode {
  const attributes = Object.fromEntries(Object.entries(node.attributes).filter(([attribute, value]) => !referenceNamesLeaving(attribute, value, leaving)));
  const children = node.children.map((child) => withoutReferencesTo(child, leaving));
  const changed = children.some((child, i) => child !== node.children[i]);
  const interactions = node.interactions?.filter((one) => one.target === undefined || !leaving.has(one.target));
  const interactionsChanged = interactions !== undefined && interactions.length !== node.interactions?.length;
  if (Object.keys(attributes).length === Object.keys(node.attributes).length && !changed && !interactionsChanged) return node;
  if (!interactionsChanged) return { ...node, attributes, children };
  const rest: Record<string, unknown> = { ...node };
  delete rest.interactions;
  return (interactions.length === 0 ? { ...rest, attributes, children } : { ...rest, attributes, children, interactions }) as unknown as DocNode;
}
