// Storing an image file and placing it (spec explorer-assets-use; the user's real-use
// audit, 7.3): assets.insertImageFile stores one image file in the project's files (`src/core/files/files.ts`, the
// tree's owner) and places an Image that uses it in the document — at the drop position (parent + index), or, when the
// drop landed on an image (`replace`), as that image's source. The drop position's grammar is element.insert's: the
// same placementRefusal, the same locked parent. An image the project already holds, dragged from an Explorer row
// (`path`, DCS-071), is placed the same way without being stored again.
import { message, registerHandler, type Message } from '../commands/registry.ts';
import type { DocNode, DocumentJson, NodeId, ProjectFile } from '../document/model.ts';
import { locate } from '../document/model.ts';
import { placementRefusal } from '../elements/content-model.ts';
import type { Patch } from '../history/transaction.ts';
import { lockRefusal } from '../nodes/flags.ts';
import { placement } from '../structure/insert.ts';
import { newElement, nodeMaker } from '../structure/node-maker.ts';
import { addRecords, fileAt, fileList, nameOfPath, recordsFor, unsupported } from './files.ts';

// the element type a dropped file is placed as, and the element a drop replaces the source of
const IMAGE_TYPE = 'image';
// the media type every image file's type begins with
const IMAGE_MEDIA = 'image/';

// The image the command places, and the patches that store it: an uploaded file is stored first; a project file
// (`path`) is used as it is, refused when the project no longer holds it or it is not an image.
function placedImage(document: DocumentJson, file: unknown, path: string | undefined): { readonly stored: ProjectFile; readonly held: readonly Patch[] } | { readonly refused: Message } {
  if (path !== undefined) {
    const found = fileAt(document, path);
    if (found === null) return { refused: message('status.stale') };
    if (!found.type.toLowerCase().startsWith(IMAGE_MEDIA)) return { refused: message('status.files.unsupportedType', { name: nameOfPath(path) }) };
    return { stored: found, held: [] };
  }
  const list = fileList(file).filter((f) => f !== null && typeof f === 'object');
  if (list[0] === undefined) throw new Error('assets.insertImageFile: no file');
  const wrong = unsupported(list);
  if (wrong !== undefined) return { refused: message('status.files.unsupportedType', { name: wrong.name }) };
  const records = recordsFor(document, list, undefined);
  const stored = records[0];
  if (stored === undefined) throw new Error('assets.insertImageFile: no file stored');
  return { stored, held: addRecords(document, records) };
}

export const insertImageFileCommand = registerHandler('assets.insertImageFile', ({ state, ids, rules, words }, { file, path, parent, index, replace }) => {
  const placed = placedImage(state.document, file, path);
  if ('refused' in placed) return { kind: 'refused' as const, message: placed.refused };
  const { stored, held } = placed;
  // a drop on an image replaces its source (the user's real-use audit, 7.3): the file is stored, the image points at it
  const target = replace === undefined || replace === null ? null : locate(state.document, replace as NodeId);
  if (target !== null) {
    if (target.node.type !== IMAGE_TYPE) {
      return { kind: 'refused' as const, message: message('status.assets.notImage', { name: target.node.name }) };
    }
    // a locked image, or one inside a locked element, keeps its picture (spec lock-element; the audit's LK1)
    const lockedImage = lockRefusal(state.document, target.node.id, 'status.locked.edit');
    if (lockedImage !== null) return { kind: 'refused' as const, message: lockedImage };
    return {
      kind: 'change' as const,
      patches: [...held, { op: 'add' as const, path: [...target.path, 'attributes', 'src'], value: stored.path }],
      selection: [target.node.id],
      message: message('status.assets.replaced', { name: target.node.name, file: stored.path }),
    };
  }
  const at = placement(state, state.selection, rules, parent as NodeId | undefined, index === undefined ? undefined : Number(index));
  if (at === null) throw new Error(`assets.insertImageFile: the document has no node ${String(parent)}`);
  const receiver = at.parent.node;
  const locked = lockRefusal(state.document, receiver.id, 'status.locked.insert');
  if (locked !== null) return { kind: 'refused' as const, message: locked };
  // the element as element.insert makes one (its default styles and text), with the file as its source
  const made = newElement(nodeMaker(state.document, rules, ids, words), IMAGE_TYPE);
  const node: DocNode = { ...made, attributes: { ...made.attributes, src: stored.path } };
  const refused = placementRefusal(state.document, rules, receiver.id, [node]);
  if (refused !== null) return { kind: 'refused' as const, message: refused };
  return {
    kind: 'change' as const,
    patches: [...held, { op: 'add' as const, path: [...at.parent.path, 'children', at.index], value: node }],
    selection: [node.id],
    message: message('status.placed', { element: node.name, parent: receiver.name, position: at.index + 1, count: receiver.children.length + 1 }),
  };
});
