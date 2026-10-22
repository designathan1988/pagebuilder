// What an element can show of an item (spec data-binding): the parts a binding may fill. Its own module, with no
// dependency beyond the model, because the document's validator reads it (core/document/validate.ts runs in the tools
// too, outside the editor).
import type { DocNode } from '../document/model.ts';
import type { ModelRules } from '../document/validate.ts';
import { ITEM_PAGE, type BindTarget, type Field } from './model.ts';

const IMAGE_TYPE = 'image';

// The parts of an element a binding can fill: an image's source and alternative text, a link's address, the text of
// an element that holds text and no children.
export function targetsOf(node: DocNode, rules: ModelRules): readonly BindTarget[] {
  const targets: BindTarget[] = [];
  if (node.type === IMAGE_TYPE) targets.push('image', 'alt');
  if (node.tag === 'a') targets.push('link');
  if (rules.elements.get(node.type)?.content === 'text' && node.children.length === 0) targets.push('text');
  return targets;
}

// Which fields a target takes: an image's source takes an image (or a link: a web address); a link's address a link, a
// file, a video's address, an email (written mailto:), or the item's own page; a text and an alternative text any
// field.
export function fieldFits(target: BindTarget, field: Field | typeof ITEM_PAGE): boolean {
  if (field === ITEM_PAGE) return target === 'link';
  if (target === 'image') return field.type === 'image' || field.type === 'link';
  if (target === 'link') return field.type === 'link' || field.type === 'file' || field.type === 'video' || field.type === 'email';
  return true;
}
