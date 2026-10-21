// element.organize (the user's real-use audit, item 8.1): the loose children of the
// selected container become a flex layout whose direction and gap are read from where they lie now. The children's
// real boxes come from the layout port; the direction is the line they run along (one below the next, or one beside
// the next, each when their other extent overlaps) and the gap is the whole-pixel distance most of the neighbours
// stand apart; the gaps of a line and the margins of a child are the longhands of the composites the command's own
// doors name (the manifest's data). The container takes display: flex, its direction and its gap at the layer the
// editor edits; each child's margins along that line go with them, so the spacing moves into the gap and what the page
// shows does not move — the point of the command. One selected container whose type holds children, at least two of
// them and every one drawn on the canvas, is required; a locked element, or one inside a locked element, is refused
// and keeps its layout.
import type { NodeId, Rect  } from '../../generated/commands.ts';
import type { CommandId } from '../../generated/ids.ts';
import { message, registerHandler, registerPredicate, type Outcome } from '../commands/registry.ts';
import { locate, type Location, type StoredValue } from '../document/model.ts';
import type { ModelRules } from '../document/validate.ts';
import type { Patch } from '../history/transaction.ts';
import { commandOf } from '../../manifest/runtime.ts';
import { styleHolders, styleLockRefusal, writeDeclarations } from './set.ts';

// the arguments a command's own doors carry, as text (the manifest's data)
const doorArgs = (command: CommandId): Readonly<Record<string, string>> => {
  const entry = commandOf(command).entryPoints[0];
  return Object.fromEntries(Object.entries(entry?.args ?? {}).map(([name, value]) => [name, String(value)]));
};

// The one container element.organize acts on: the primary selected element, a container by its type (elements.json
// content "children") holding at least two children.
function containerOf(state: { readonly document: Parameters<typeof locate>[0]; readonly selection: readonly NodeId[] }, rules: ModelRules): Location | null {
  const [only, ...others] = state.selection;
  if (only === undefined || others.length > 0) return null;
  const at = locate(state.document, only);
  if (at === null) return null;
  const element = rules.elements.get(at.node.type);
  return element !== undefined && element.content === 'children' && at.node.children.length >= 2 ? at : null;
}

// Available on that container alone: a leaf holds no children to organize, and one child has no layout to infer.
export const organizableSelection = registerPredicate('organizableSelection', (state, rules) => containerOf(state, rules) !== null, (state) =>
  message('status.organize.unavailable', { name: state.selection[0] === undefined ? '' : (locate(state.document, state.selection[0])?.node.name ?? '') }),
);

// The line the children run along: down (a column) or across (a row); null when neither reads as a line (boxes on top
// of each other).
function lineOf(boxes: readonly Rect[]): 'column' | 'row' | null {
  const before = (i: number): Rect => boxes[i - 1] as Rect;
  const down = boxes.every((box, i) => i === 0 || box.y >= before(i).y + before(i).height - 1);
  const across = boxes.every((box, i) => i === 0 || box.x >= before(i).x + before(i).width - 1);
  if (down && !across) return 'column';
  if (across && !down) return 'row';
  return null;
}

// The gap most of the neighbours stand apart: the most frequent whole-pixel distance between consecutive boxes along
// the line (the smaller one where two are as frequent).
function gapOf(boxes: readonly Rect[], line: 'column' | 'row'): number {
  const gaps = boxes.slice(1).map((box, i) => {
    const before = boxes[i] as Rect;
    return Math.max(0, Math.round(line === 'column' ? box.y - (before.y + before.height) : box.x - (before.x + before.width)));
  });
  const counts = new Map<number, number>();
  for (const gap of gaps) counts.set(gap, (counts.get(gap) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
}

// the places the gaps of a line and the margins along it hold among the composite's longhands (CSS order)
const ROW_GAP = 0;
const COLUMN_GAP = 1;
const TOP = 0;
const RIGHT = 1;
const BOTTOM = 2;
const LEFT = 3;
const SIDES_OF: Readonly<Record<'column' | 'row', readonly number[]>> = { column: [TOP, BOTTOM], row: [RIGHT, LEFT] };

export const organizeCommand = registerHandler('element.organize', (context): Outcome<never> => {
  const { state, rules, layout } = context;
  const at = containerOf(state, rules);
  // the availability predicate (organizableSelection) keeps anything else from reaching here
  if (at === null) throw new Error('element.organize: the selection is not one container holding two children');
  const locked = styleLockRefusal(context, [at]);
  if (locked !== null) return { kind: 'refused', message: locked };
  // the children measured are the selected container's own, the ones the canvas draws (an instance's part writes into
  // its component's definition, which is drawn nowhere: the audit's STYLE-8 measured the definition's and was refused)
  const boxes = at.node.children.map((child) => layout.box(child.id as NodeId));
  // what the canvas does not draw cannot be read: the command says so instead of guessing
  if (boxes.some((box) => box === null)) return { kind: 'refused', message: message('status.organize.unmeasured', { name: at.node.name }) };
  const drawn = boxes as readonly Rect[];
  const line = lineOf(drawn) ?? 'column';
  const gap = gapOf(drawn, line);
  const gaps = rules.compositeFacts.get(ARGS.gaps ?? '')?.longhands[line === 'column' ? ROW_GAP : COLUMN_GAP];
  const sides = (rules.compositeFacts.get(ARGS.margins ?? '')?.longhands ?? []).filter((_, i) => SIDES_OF[line].includes(i));
  const layer = rules.base;
  // the container's values go to every holder of its styles, as every style write's (set.ts styleHolders: the class
  // that is the style target, an instance's component and its copies, else the element)
  const patches: Patch[] = styleHolders(context, [at]).flatMap((held) =>
    writeDeclarations(held.node, held.path, layer, {
      [ARGS.view ?? '']: 'flex',
      [ARGS.axis ?? '']: line,
      [gaps ?? '']: `${gap}px`,
    }),
  );
  // the children's own margins along the line (the ones they hold at this layer) move into the gap: each child's own
  // holders (a class targeted for the container is not the children's)
  const ofChildren = { ...context, styleClass: null };
  const margins = Object.fromEntries(sides.map((property): [string, StoredValue | null] => [property, null]));
  for (const child of at.node.children) {
    const where = locate(state.document, child.id as NodeId);
    if (where === null) continue;
    for (const held of styleHolders(ofChildren, [where])) patches.push(...writeDeclarations(held.node, held.path, layer, margins));
  }
  return {
    kind: 'change',
    patches,
    message: message('status.organized', { name: at.node.name, direction: line, gap }),
  };
});

// the arguments element.organize's own doors carry, read after its registration
const ARGS = doorArgs(organizeCommand.command);
