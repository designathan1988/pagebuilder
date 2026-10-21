// style.setSpacing (spec props-spacing): a box's sides (padding or margin) in the box
// model editor. One side writes its own longhand; `all` (a linked box) writes the four longhands, one undo step. What
// was typed is read as style.set reads it (set.ts readValue: the longhand's codec against what it offers, a bare number
// in px, written only when the browser takes it): a padding below zero is refused with status.value.negativePadding (a
// negative margin is written), anything else not taken with status.value.invalid naming the property and the text. A
// locked element, or one inside one, refuses with status.locked.edit. The status bar names the property, the element
// and the value kept. A spacing band's drag (spec spacing-handles) runs it too: the key held with it (its modifier)
// is already the sides it writes (Shift: all; Alt: the opposite side, written by a second run in the same gesture).
import { message, registerHandler, type Outcome } from '../commands/registry.ts';
import { locate, type NodeId } from '../document/model.ts';
import type { Patch } from '../history/transaction.ts';
import { firstLockRefusal, stateRefusal } from '../nodes/flags.ts';
import { propertyName, readValue, styleHolders, withTargets, writeDeclarations } from './set.ts';

// the box whose negative values the browser never takes, refused with their own word
const NO_NEGATIVE = 'padding';
// whether a box's sides may be negative (a margin; a padding never)
export const mayBeNegative = (box: string): boolean => box !== NO_NEGATIVE;

export const setSpacingCommand = registerHandler('style.setSpacing', (given, { box, sides, value, targets }): Outcome<never> => {
  // the elements its value was typed for, when a press selected another before the field kept it (set.ts
  // withTargets; DEF-0530)
  const context = withTargets(given, targets);
  if (context === null) return { kind: 'change' };
  const { state, rules } = context;
  const composite = rules.compositeFacts.get(box);
  if (composite === undefined) throw new Error(`style.setSpacing: ${box} is no box composite of properties.json`);
  // a side names its longhand: the composite's longhand that ends with it (padding-top for top)
  const properties = sides === 'all' ? composite.longhands : composite.longhands.filter((p) => p === `${box}-${sides}`);
  const first = properties[0];
  if (first === undefined) throw new Error(`style.setSpacing: ${box} has no side ${sides}`);
  const named = sides === 'all' ? propertyName(box, rules) : propertyName(first, rules);
  const nodes = state.selection.map((id) => locate(state.document, id)).filter((found) => found !== null);
  const primary = nodes[0];
  if (primary === undefined) return { kind: 'change' };
  const locked = firstLockRefusal(state.document, nodes.map((found) => found.node.id as NodeId), 'status.locked.edit');
  if (locked !== null) return { kind: 'refused', message: locked };
  // a state the element does not take (Disabled on the page) is refused here, as style.set refuses it: the door's
  // predicate alone let a direct run write it, and the document became invalid (the invariant probe, seed 20261002)
  const misplaced = stateRefusal(state.document, nodes.map((found) => found.node.id as NodeId), rules);
  if (misplaced !== null) return { kind: 'refused', message: misplaced };
  if (box === NO_NEGATIVE && /^\s*-/.test(value) && Number.parseFloat(value) < 0) return { kind: 'refused', message: message('status.value.negativePadding') };
  const read = readValue(context, first, value);
  if (read === null) return { kind: 'refused', message: message('status.value.invalid', { property: named, value }) };
  const { breakpoint, state: base } = rules.base;
  const values = Object.fromEntries(properties.map((p) => [p, read.css]));
  const holders = styleHolders(context, nodes);
  const patches: Patch[] = holders.flatMap((held) => writeDeclarations(held.node, held.path, { breakpoint, state: base }, values));
  // several elements are named by their count (J28: the message named the first one only)
  const said = holders.length > 1 ? message('status.style.setMany', { property: named, count: holders.length, value: read.css }) : message('status.spacing.set', { property: named, name: holders[0]?.name ?? primary.node.name, value: read.css });
  return { kind: 'change', patches, message: said };
});
