// What a piece of code can name where it stands (spec app-logic), for the code editor's completion: the project's
// variables, the functions its scripts export, and the item names of the element's repeated ancestors (each one's
// `as`, and index) — the element's own repetition too, for every field but the one that says what it repeats.
import { locate, type DocumentJson } from '../../core/document/model.ts';
import type { NodeId } from '../../generated/commands.ts';
import { exportedNames } from '../../core/logic/references.ts';
import type { CodeScope } from './code-editor.tsx';

export function projectScope(document: DocumentJson): Pick<CodeScope, 'variables' | 'functions'> {
  const app = document.app ?? {};
  return { variables: (app.variables ?? []).map((one) => one.name), functions: [...new Set((app.scripts ?? []).flatMap((one) => exportedNames(one.code)))] };
}

export function localsAt(document: DocumentJson, id: NodeId, ownRepeat: boolean): readonly string[] {
  const names: string[] = [];
  let at = locate(document, id);
  let own = true;
  while (at !== null) {
    const each = at.node.logic?.each;
    if (each !== undefined && (ownRepeat || !own)) names.push(at.node.logic?.as ?? 'item', 'index');
    own = false;
    at = at.parent === null ? null : locate(document, at.parent.id as NodeId);
  }
  return [...new Set(names)];
}
