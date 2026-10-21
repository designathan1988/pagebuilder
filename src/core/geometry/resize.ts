// geometry.resize (spec resize-handles): the selected element's width and height, and
// for a positioned element its left and top, written as whole CSS px at the base breakpoint and state through the one
// writer of declarations (core/style/set.ts). The canvas's handles run it during their drag, in one gesture: the page
// shows the size live and the history keeps one step. A locked element refuses (spec lock-element). The status bar
// says the size the element now declares ("Resized to 200px × 200px"; a size it does not declare reads auto).
// A shape of an SVG (spec elements-svg-shapes, Problems in Pager 3) takes the box as its own geometry attributes, in
// its SVG's coordinates (core/elements/svg.ts): the width and height of the box its geometry spans, and its corner for
// left and top; what the arguments leave out stays as it is.
import type { NodeId } from '../../generated/commands.ts';
import { message, registerHandler, type Outcome } from '../commands/registry.ts';
import { locate } from '../document/model.ts';
import { stateRefusal } from '../nodes/flags.ts';
import { styleHolders, styleLockRefusal, writeDeclarations } from '../style/set.ts';
import { attributeOf, geometryAttributes, resizedShape, shapeBox } from '../elements/svg.ts';
import { argumentRefused } from '../store/args.ts';

const LENGTH = /^-?\d+px$/;
// the margin box of properties.json and the prefix of the two arguments a drag's flow compensation comes in
const MARGIN_BOX = 'margin';
const MARGIN_ARG = 'margin';

export const resizeCommand = registerHandler('geometry.resize', (context, args): Outcome<never> => {
  const { state, rules } = context;
  const id: NodeId | undefined = state.selection.length === 1 ? state.selection[0] : undefined;
  if (id === undefined) return { kind: 'refused', message: message('status.needsSingleSelection') };
  const at = locate(state.document, id);
  if (at === null) throw new Error(`geometry.resize: the document has no node ${id}`);
  // the element and every page element its size reaches (an instance's part writes every instance: STRUCT-9)
  const locked = styleLockRefusal(context, [at]) ?? stateRefusal(state.document, [at.node.id as NodeId], rules);
  if (locked !== null) return { kind: 'refused', message: locked };
  const values: Record<string, string> = {};
  for (const [property, value] of Object.entries(args)) {
    if (typeof value !== 'string') continue;
    if (!LENGTH.test(value)) return { kind: 'refused', message: argumentRefused(property) };
    // A drag's flow compensation arrives as the manifest's own marginLeft or marginTop argument (item 4.2: the dragged
    // edge follows the pointer by the element's margin): it goes to the margin longhand of that side, read from the
    // properties.json composite, so no declaration is named by hand.
    if (!property.startsWith(MARGIN_ARG)) {
      values[property] = value;
      continue;
    }
    const side = property.slice(MARGIN_ARG.length).toLowerCase();
    const longhand = rules.compositeFacts.get(MARGIN_BOX)?.longhands.find((name) => name.endsWith(`-${side}`));
    if (longhand === undefined) return { kind: 'refused', message: argumentRefused(property) };
    values[longhand] = value;
  }

  const geometry = geometryAttributes(rules, at.node.type, resizeCommand.command);
  const from = geometry.length > 0 ? shapeBox(at.node, geometry) : null;
  if (from !== null) {
    const number = (value: string | undefined, held: number) => (value === undefined ? held : Number.parseFloat(value));
    const box = { x: number(values.left, from.x), y: number(values.top, from.y), width: number(values.width, from.width), height: number(values.height, from.height) };
    const shaped = resizedShape(at.node, geometry, box) ?? {};
    const patches = Object.entries(shaped).flatMap(([id, value]) => (attributeOf(at.node, id) === value ? [] : [{ op: id in at.node.attributes ? ('replace' as const) : ('add' as const), path: [...at.path, 'attributes', id], value }]));
    return { kind: 'change', patches, message: message('status.resized', { width: `${box.width}px`, height: `${box.height}px` }) };
  }
  const { breakpoint, state: base } = rules.base;
  const declared = (at.node.styles as Record<string, Record<string, Record<string, string>> | undefined>)[breakpoint]?.[base] ?? {};
  const size = { ...declared, ...values };
  const said = message('status.resized', { width: size.width ?? 'auto', height: size.height ?? 'auto' });
  // the write goes where every style write goes (A3.8): with a class as the style target, the class holds it, not the
  // element
  const patches = styleHolders(context, [at]).flatMap((held) => writeDeclarations(held.node, held.path, { breakpoint, state: base }, values));
  return { kind: 'change', patches, message: said };
});

// What a handle's drag writes (spec resize-handles; items 4.2 and A3.16): the element's border box from `from`, grown
// by the pointer's travel in CSS px on the handle's sides (twice as much with `centre`, Alt, around the middle); a
// handle with `aspect` keeps the box's ratio (a medium keeps it by default, everything else with Shift); whole px,
// never below `min` on either axis. The width and height written measure the content under content-box.
//
// The start edge follows the pointer: a positioned element's left and top move, and a block-level element in the flow
// moves by its own margin — so a west drag right by 60 px shrinks the width by 60 and adds 60 to the left margin, and
// the end edge stays where it was (4.2). A box never grows past the space its parent gives it (A3.16: a grid item's
// own cell, else the parent's content box): the width and height stop at that edge.
export interface ResizeFrom {
  readonly width: number;
  readonly height: number;
  readonly extraX: number;
  readonly extraY: number;
  readonly contentBox: boolean;
  readonly positioned: boolean;
  readonly left: number;
  readonly top: number;
  readonly margins?: { readonly left: number; readonly top: number };
  readonly room?: ResizeRoom | null;
  readonly starts?: { readonly x: boolean; readonly y: boolean };
  readonly ratio?: number | null;
}
export interface ResizeRoom {
  // how far the box may grow leftwards and rightwards before the space its parent gives it ends (a grid item: its own
  // cell). Only the width is bounded: a page grows downwards with its content, so a height is never capped.
  readonly start: number;
  readonly end: number;
}
export function resizedBox(from: ResizeFrom, handle: string, dx: number, dy: number, keys: { readonly aspect: boolean; readonly centre: boolean }, min: number): Record<string, string | undefined> {
  const side = handle.slice(handle.lastIndexOf('-') + 1);
  const east = side.includes('e');
  const west = side.includes('w');
  const south = side.includes('s');
  const north = side.includes('n');
  const across = east || west;
  const down = north || south;
  const times = keys.centre ? 2 : 1;
  const ratio = from.ratio ?? (from.width > 0 && from.height > 0 ? from.width / from.height : null);
  let width = from.width + (east ? dx : west ? -dx : 0) * times;
  let height = from.height + (south ? dy : north ? -dy : 0) * times;
  if (keys.aspect && ratio !== null && ratio > 0) {
    // the ratio is kept: a corner follows the side the pointer pulled further, an edge carries the other dimension
    if (across && down) {
      const scale = Math.max(width / from.width, height / from.height);
      width = from.width * scale;
      height = from.height * scale;
    } else if (across) height = width / ratio;
    else if (down) width = height * ratio;
  }
  const room = from.room ?? null;
  if (room !== null && across) {
    const bySide = east ? room.end : room.start;
    const byCentre = Math.min(room.start, room.end);
    width = Math.min(width, Math.max(min, from.width + (keys.centre ? 2 * byCentre : bySide)));
  }
  width = Math.max(min, Math.round(width));
  height = Math.max(min, Math.round(height));
  const px = (value: number) => `${Math.round(value)}px`;
  // how far the start edge moves (positive rightwards or downwards): the box shrinks by exactly that much
  const shiftX = from.width - width;
  const shiftY = from.height - height;
  const margins = from.margins ?? { left: 0, top: 0 };
  const starts = from.starts ?? { x: false, y: false };
  const left = !from.positioned || !across ? undefined : keys.centre ? from.left - (width - from.width) / 2 : west ? from.left + from.width - width : undefined;
  const top = !from.positioned || !down ? undefined : keys.centre ? from.top - (height - from.height) / 2 : north ? from.top + from.height - height : undefined;
  const marginLeft = !across || from.positioned || !starts.x || !west ? undefined : margins.left + (keys.centre ? -shiftX / 2 : shiftX);
  const marginTop = !down || from.positioned || !starts.y || !north ? undefined : margins.top + (keys.centre ? -shiftY / 2 : shiftY);
  return {
    width: across ? px(from.contentBox ? width - from.extraX : width) : undefined,
    height: down ? px(from.contentBox ? height - from.extraY : height) : undefined,
    left: left === undefined ? undefined : px(left),
    top: top === undefined ? undefined : px(top),
    // the caller names the two margins from the manifest (properties.json): the core writes no property by hand
    marginLeft: marginLeft === undefined ? undefined : px(marginLeft),
    marginTop: marginTop === undefined ? undefined : px(marginTop),
  };
}
