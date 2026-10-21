// The document's self-checks (the incident feed's, core/incidents.ts reportSelfChecks): rules the app keeps that the
// validator does not refuse a document over, because an opened file may break them without the person losing work,
// yet that no command of the editor may break. Read in development and tests at every publication of the store.
//
// The rules a command breaks that the validator does refuse (a component's definition pointing at a missing element,
// validate.ts definitionReferenceProblems; a part of an instance outside any instance, validateInstances) reach the
// feed as 'invariant' incidents at the commit; they are not repeated here.
import { walk, type DocumentJson } from './model.ts';

// Each finding in words, one per broken rule and place:
//  - two elements of one page carry the same HTML id: a page is one HTML document, so `#anchor` links, `label for`
//    and aria-controls become ambiguous (the audit's STRUCT-5; the copy makers give each copy an id of its own).
export function documentFindings(document: DocumentJson): readonly string[] {
  const found: string[] = [];
  for (const page of document.pages) {
    const holders = new Map<string, string>();
    for (const node of walk(page.tree)) {
      const id = node.attributes.id;
      if (typeof id !== 'string' || id === '') continue;
      const first = holders.get(id);
      if (first === undefined) holders.set(id, node.name);
      else found.push(`page ${page.file}: ${first} and ${node.name} carry the same HTML id "${id}"`);
    }
  }
  return found;
}
