// element.delete: the selected nodes leave the document with their whole subtrees, in
// one transaction (spec delete-element, "Result in the document"). It acts on the selection's roots (the manifest's
// adapter.selection "roots"): a selected node inside another selected node goes with that one. The page root is never
// deleted, nor a locked element or one inside a locked element (spec lock-element, src/core/nodes/flags.ts): the
// status bar says why and nothing changes. Undo puts every subtree back at its index with its ids, and
// the selection from before the command (history.ts). After a delete the selection moves to the next sibling of the
// primary node, else its previous sibling, else its parent (spec, Problems 1), so the next key has a target.
import type { NodeId } from '../../generated/commands.ts';
import { message, registerHandler, type Outcome } from '../commands/registry.ts';
import { locate, walk, type DocNode, type DocumentJson, type Location, type Selection } from '../document/model.ts';
import { referencesTo } from '../elements/references.ts';
import { releaseReferencesPatch } from '../document/tree.ts';
import type { Patch } from '../history/transaction.ts';
import { firstLockRefusal } from '../nodes/flags.ts';
import type { StoreState } from '../store/store.ts';

// The selected nodes no other selected node holds, in document order.
export function selectionRoots(document: DocumentJson, selection: Selection): Location[] {
  const selected = new Set(selection);
  const roots: Location[] = [];
  const visit = (node: DocNode) => {
    if (selected.has(node.id)) {
      const at = locate(document, node.id);
      if (at) roots.push(at);
      return;
    }
    for (const child of node.children) visit(child);
  };
  for (const page of document.pages) visit(page.tree);
  return roots;
}

// Where the selection goes when these roots leave: the primary root's next sibling that stays, else its previous
// sibling that stays, else its parent (which stays: it holds a root, so it is no root itself nor inside one).
function selectionAfter(roots: readonly Location[], primary: Location): NodeId | null {
  const leaving = new Set(roots.map((r) => r.node.id));
  const siblings = primary.parent?.children ?? [];
  const next = siblings.slice(primary.index + 1).find((s) => !leaving.has(s.id));
  if (next) return next.id;
  const previous = siblings
    .slice(0, primary.index)
    .reverse()
    .find((s) => !leaving.has(s.id));
  if (previous) return previous.id;
  return primary.parent?.id ?? null;
}

export const deleteCommand = registerHandler('element.delete', ({ state }): Outcome<never> => {
  const roots = selectionRoots(state.document, state.selection);
  // the availability predicate (hasSelection) lets no door run without a selection; a selection of nodes the document
  // lacks is a defect of the store
  const primaryId = state.selection[0];
  const primary = roots.find((r) => r.node.id === primaryId) ?? roots.find((r) => primaryId !== undefined && [...walk(r.node)].some((n) => n.id === primaryId)) ?? roots[0];
  if (primary === undefined) throw new Error('element.delete: the selection names no node of the document');
  if (roots.some((r) => r.parent === null)) return { kind: 'refused', message: message('status.delete.root') };
  // a locked root, or one inside a locked element, stays (spec lock-element)
  const locked = firstLockRefusal(state.document, roots.map((r) => r.node.id), 'status.locked.delete');
  if (locked !== null) return { kind: 'refused', message: locked };
  const after = selectionAfter(roots, primary);
  // the last root first, so every path taken from the document before the delete still points at its node
  const patches: Patch[] = roots
    .slice()
    .reverse()
    .map((r) => ({ op: 'remove', path: r.path }));
  // what pointed at what goes (the audit's A3.4): the delete says so, and the references it takes away go with it in
  // the same undo step, so no label or link is left pointing at nothing (the toast under the message offers Undo)
  const cited = roots.reduce((sum, root) => sum + referencesTo(state.document, root.node.id), 0);
  // the references' number goes in as the count, so the text takes its singular or plural form ("the reference",
  // not "1 references"); several elements are counted, never put where a name goes
  const said =
    cited > 0
      ? roots.length === 1
        ? message('status.deleted.cited', { name: primary.node.name, count: cited })
        : message('status.deletedMany.cited', { elements: roots.length, count: cited })
      : roots.length === 1
        ? message('status.deleted', { name: primary.node.name })
        : message('status.deletedMany', { count: roots.length });
  const going = new Set(roots.flatMap((root) => [...walk(root.node)].map((node) => node.id)));
  const released = releaseReferencesPatch(state.document, going);
  return {
    kind: 'change',
    patches: [...released, ...patches],
    selection: after === null ? [] : [after],
    message: said,
  };
});

// Whether the state follows a delete: the most recent undo step is a delete and the last message is still the one it
// said. The toast that follows a delete (src/editor/shell/toast.tsx) shows while this holds, so there is at most one,
// a new delete replaces it, and its Undo undoes that delete and nothing else (spec, Problems 2); the next message (an
// undo, a selection, a refusal) takes it away.
export function followsDelete(state: StoreState<unknown>): boolean {
  const key = state.message?.key;
  return state.history.past.at(-1)?.command === deleteCommand.command && (key === 'status.deleted' || key === 'status.deletedMany' || key === 'status.deleted.cited' || key === 'status.deletedMany.cited');
}
