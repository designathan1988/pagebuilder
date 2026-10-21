// Align and distribute (spec align-distribute), on absolutely or fixed positioned
// elements (predicate positionedSelection), as drawn: their border boxes in page px (the layout port).
//  - position.align: several elements line up on an edge or the centre of the selection's bounds; one element on its
//    parent's padding box (the layout port's place).
//  - position.distribute: three elements or more (status.distribute.needsThree) get equal gaps along an axis between
//    the first and the last, which stay where they are.
// Each element moves through the inset it is anchored to (core/geometry/position.ts movedInsets), all in one undo step;
// a locked element refuses (status.locked.move). The status bar names the command and how many elements it moved.
import type { NodeId, Rect } from '../../generated/commands.ts';
import type { MessageId } from '../../generated/ids.ts';
import { message, registerHandler, registerPredicate, type HandlerContext, type Outcome } from '../commands/registry.ts';
import type { Location } from '../document/model.ts';
import type { Patch } from '../history/transaction.ts';
import { firstLockRefusal, stateRefusal } from '../nodes/flags.ts';
import { selectionRoots } from '../structure/remove.ts';
import { writeDeclarations } from '../style/set.ts';
import { measuredPlace, movedInsets, positionedSelection } from './position.ts';

type Axis = 'horizontal' | 'vertical';
// what each edge argument lines up: its axis, and the start edge, the centre or the end edge
const EDGES: Readonly<Record<string, { readonly axis: Axis; readonly at: 'start' | 'center' | 'end' }>> = {
  left: { axis: 'horizontal', at: 'start' },
  'horizontal-center': { axis: 'horizontal', at: 'center' },
  right: { axis: 'horizontal', at: 'end' },
  top: { axis: 'vertical', at: 'start' },
  'vertical-center': { axis: 'vertical', at: 'center' },
  bottom: { axis: 'vertical', at: 'end' },
};
// an axis of a box: where it starts and how long it is
const span = (box: Rect, axis: Axis) => (axis === 'horizontal' ? { start: box.x, size: box.width } : { start: box.y, size: box.height });
// a door's label key names its edge or axis in camel case (command.align.horizontalCenter)
const camel = (text: string) => text.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

// the selection's roots, refused while one is locked
function movable<Ui>(context: HandlerContext<Ui>): { readonly roots: readonly Location[] } | { readonly refused: Outcome<Ui> } {
  const { state } = context;
  const roots = selectionRoots(state.document, state.selection);
  const locked = firstLockRefusal(state.document, roots.map((at) => at.node.id as NodeId), 'status.locked.move') ?? stateRefusal(state.document, roots.map((at) => at.node.id as NodeId), context.rules);
  return locked === null ? { roots } : { refused: { kind: 'refused', message: locked } };
}

// the patches that move each element by its travel along the axis
function moves<Ui>(context: HandlerContext<Ui>, travels: readonly { readonly at: Location; readonly delta: number }[], axis: Axis): Patch[] {
  return travels.flatMap(({ at, delta }) => {
    const dx = axis === 'horizontal' ? delta : 0;
    const dy = axis === 'vertical' ? delta : 0;
    return writeDeclarations(at.node, at.path, context.rules.base, movedInsets(at.node, context.rules, measuredPlace(context as HandlerContext<unknown>, at.node), dx, dy).writes);
  });
}

export const alignCommand = registerHandler('position.align', (context, { edge }) => {
  const found = movable(context);
  if ('refused' in found) return found.refused;
  const { roots } = found;
  const target = EDGES[edge];
  if (target === undefined) throw new Error(`position.align: no edge ${edge}`);
  if (roots.length === 0) return { kind: 'change' };
  const said = message('status.align.done', { edge: { key: `command.align.${camel(edge)}` as MessageId }, elements: { plural: 'status.elementCount', count: roots.length } });
  const only = roots.length === 1 ? roots[0] : undefined;
  if (only !== undefined) {
    // one element: its parent's padding box, from the distances to its edges
    const place = measuredPlace(context as HandlerContext<unknown>, only.node);
    if (place === null) return { kind: 'change', message: said };
    const [before = 0, after = 0] = target.axis === 'horizontal' ? [place.left, place.right] : [place.top, place.bottom];
    const delta = target.at === 'start' ? -before : target.at === 'end' ? after : (after - before) / 2;
    return { kind: 'change', patches: moves(context, [{ at: only, delta }], target.axis), message: said };
  }
  // several: the selection's bounds, from the border boxes drawn
  const boxes = roots.map((at) => ({ at, box: context.layout.box(at.node.id as NodeId) }));
  const measured = boxes.flatMap(({ at, box }) => (box === null ? [] : [{ at, ...span(box, target.axis) }]));
  if (measured.length === 0) return { kind: 'change', message: said };
  const low = Math.min(...measured.map((m) => m.start));
  const high = Math.max(...measured.map((m) => m.start + m.size));
  const travels = measured.map((m) => ({
    at: m.at,
    delta: target.at === 'start' ? low - m.start : target.at === 'end' ? high - (m.start + m.size) : (low + high) / 2 - (m.start + m.size / 2),
  }));
  return { kind: 'change', patches: moves(context, travels, target.axis), message: said };
});

// Distribute's door is available only for three positioned elements or more (the audit's A3.23): with fewer it says
// so (status.distribute.needsThree), with elements that are not positioned its own reason
// (status.distribute.needsPositioned), never align's.
const DISTRIBUTE_MIN = 3;
export const distributableSelection = registerPredicate(
  'distributableSelection',
  (state, rules) => positionedSelection.test(state, rules) && selectionRoots(state.document, state.selection).length >= DISTRIBUTE_MIN,
  (state, rules) => message(positionedSelection.test(state, rules) ? 'status.distribute.needsThree' : 'status.distribute.needsPositioned'),
);

export const distributeCommand = registerHandler('position.distribute', (context, { axis }) => {
  const found = movable(context);
  if ('refused' in found) return found.refused;
  const { roots } = found;
  if (roots.length < DISTRIBUTE_MIN) return { kind: 'refused', message: message('status.distribute.needsThree') };
  const measured = roots
    .flatMap((at) => {
      const box = context.layout.box(at.node.id as NodeId);
      return box === null ? [] : [{ at, ...span(box, axis) }];
    })
    .sort((a, b) => a.start - b.start);
  const first = measured[0];
  const last = measured.at(-1);
  const said = message('status.distribute.done', { axis: { key: `command.distribute.${axis}` as MessageId }, elements: { plural: 'status.elementCount', count: roots.length } });
  if (first === undefined || last === undefined || measured.length < 3) return { kind: 'change', message: said };
  // the gap that fills the span from the first's start to the last's end with every element and equal gaps
  const gap = (last.start + last.size - first.start - measured.reduce((sum, m) => sum + m.size, 0)) / (measured.length - 1);
  let next = first.start;
  const travels = measured.map((m) => {
    const delta = next - m.start;
    next += m.size + gap;
    return { at: m.at, delta };
  });
  return { kind: 'change', patches: moves(context, travels, axis), message: said };
});
