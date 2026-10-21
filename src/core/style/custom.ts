// style.setCustomDeclarations (feature props-attributes): the element's declarations
// written as CSS text, one "property: value;" each, at the layer the editor edits (rules.base) of the holder every
// style write goes to (set.ts replaceLayer; what the field shows is set.ts replacedDeclarations). The text replaces the
// declarations held there: a property written is stored with its value, a property left out is removed.
// A property is an edited property of properties.json, a custom property of the person's own (--brand, the user's
// real-use audit, item A3.33) or a shorthand an owner reads (background, border: the composite's codec expands it into
// its longhands, which are what is stored); a structured property (a shadow) is read into its layers by its own reader;
// every value is non-empty CSS text without braces inside that the browser takes (the CSS support port, as style.set
// asks it); the first piece that is not is refused naming its line and why (status.css.notDeclaration,
// status.css.unknownProperty, status.css.badValue), and the document keeps its declarations. One undo step; a locked
// element refuses (spec lock-element). The declarations are written to the page by the renderer through the element's
// own style rule, never as a style attribute.
import type { NodeId } from '../../generated/commands.ts';
import { message, registerHandler, type HandlerContext, type Message, type Outcome } from '../commands/registry.ts';
import { locate, type StoredValue } from '../document/model.ts';
import { lockRefusal, stateRefusal } from '../nodes/flags.ts';
import { declarationsOf, readValue, replaceLayer } from './set.ts';
import { shadowLayersFromCss } from './shadows.ts';
import { readAddress } from '../elements/address.ts';

// the keyword a structured value with no layer is written as (render/output.ts structuredCss)
const NONE = 'none';
// a value that names a CSS variable
const VARIABLE = /\bvar\(/i;

// every address a url(…) in a value carries, in order (spec props-attributes, the audit's A3.2)
function addressesIn(value: string): readonly string[] {
  const found: string[] = [];
  for (const match of value.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'\s][^)]*))\s*\)/gi)) {
    const address = match[1] ?? match[2] ?? match[3] ?? '';
    if (address !== '') found.push(address.trim());
  }
  return found;
}

// "property: value" pairs of CSS text, or why the first piece that is wrong is wrong, naming its line
export function parseDeclarations<Ui>(text: string, context: HandlerContext<Ui>): { readonly declarations: ReadonlyMap<string, StoredValue> } | { readonly refused: Message } {
  const { rules, css } = context;
  const declarations = new Map<string, StoredValue>();
  const lines = text.split('\n');
  for (const [i, raw] of lines.entries()) {
    for (const part of raw.split(';')) {
      const piece = part.trim();
      if (piece === '') continue;
      const colon = piece.indexOf(':');
      if (colon <= 0) return { refused: message('status.css.notDeclaration', { line: i + 1, text: piece }) };
      const property = piece.slice(0, colon).trim().toLowerCase();
      const value = piece.slice(colon + 1).trim();
      // the person's own custom property: any --name, its value kept as typed
      if (property.startsWith('--')) {
        if (value === '' || /[{}]/.test(value)) return { refused: message('status.css.badValue', { line: i + 1, property, value }) };
        declarations.set(property, value);
        continue;
      }
      // a shorthand an owner reads: expanded into its longhands here, so the store holds what is written out
      if (rules.compositeFacts.has(property)) {
        const read = readValue(context, property, value);
        if (read === null) return { refused: message('status.css.badValue', { line: i + 1, property, value }) };
        for (const [longhand, written] of Object.entries(declarationsOf(property, read, rules))) declarations.set(longhand, written);
        continue;
      }
      if (!rules.properties.has(property)) return { refused: message('status.css.unknownProperty', { line: i + 1, property }) };
      // the browser decides a value (width: banana, opacity: 2px are none: the audit's STYLE-13), as style.set asks it;
      // a value naming a variable is the browser's to compute where it is used (CSS.supports takes any var())
      if (value === '' || /[{}]/.test(value) || !(VARIABLE.test(value) || css.supports(property, value))) return { refused: message('status.css.badValue', { line: i + 1, property, value }) };
      // a structured value (a shadow) is stored as its layers, read by its one reader (shadows.ts; the audit's STYLE-2:
      // stored as text, the document was refused); none is no layer
      const fields = rules.structures.get(property);
      if (fields !== undefined) {
        const layers = value.toLowerCase() === NONE ? [] : shadowLayersFromCss(value, fields);
        if (layers === null) return { refused: message('status.css.badValue', { line: i + 1, property, value }) };
        declarations.set(property, layers);
        continue;
      }
      // a url() inside a declaration is an address: the one rule of an address decides (core/elements/address.ts, the
      // audit's A3.2), so url("javascript:…") is refused with its reason
      for (const address of addressesIn(value)) {
        const read = readAddress(address);
        if (!read.ok) return { refused: read.refusal };
      }
      declarations.set(property, value);
    }
  }
  return { declarations };
}

export const setCustomDeclarationsCommand = registerHandler('style.setCustomDeclarations', (context, { declarations, target }): Outcome<never> => {
  const { state, rules } = context;
  const id = (target as NodeId | undefined) ?? (state.selection.length === 1 ? state.selection[0] : undefined);
  if (id === undefined) return { kind: 'refused', message: message('status.needsSingleSelection') };
  const at = locate(state.document, id);
  if (at === null) throw new Error(`style.setCustomDeclarations: the document has no node ${id}`);
  const locked = lockRefusal(state.document, at.node.id, 'status.locked.edit') ?? stateRefusal(state.document, [at.node.id as NodeId], rules);
  if (locked !== null) return { kind: 'refused', message: locked };
  const parsed = parseDeclarations(String(declarations), context);
  if ('refused' in parsed) return { kind: 'refused', message: parsed.refused };
  const said = message('status.style.declarationsSet', { name: at.node.name, count: parsed.declarations.size });
  // the one writer of declarations, through the holders every style write goes to (the audit's OW1); a text that holds
  // what the holder written holds records nothing (replaceLayer compares with that holder's layer, the one the field
  // shows: set.ts replacedDeclarations)
  return { kind: 'change' as const, patches: replaceLayer(context, at, Object.fromEntries(parsed.declarations)), message: said };
});
