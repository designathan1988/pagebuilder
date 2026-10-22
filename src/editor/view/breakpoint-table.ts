// The project's breakpoints, changed (spec project-breakpoints; the plan's stage 2): a breakpoint added at the width
// the canvas shows ("create a breakpoint here"), renamed, given another width between its neighbours, or removed with
// the styles set at it. The table is the document's (core/document/breakpoints.ts holds what each change makes of it);
// the first change writes the project's own table, the default's copy with the change. Each change is one undo step,
// and the breakpoint the editor shows follows it: a new one is shown, a removed one gives way to the base.
import { message, registerHandler, registerPredicate, type Message, type Outcome } from '../../core/commands/registry.ts';
import { addedTable, breakpointById, breakpointsOf, breakpointWords, documentWithout, isRefusal, renamedTable, resizedTable, type ProjectBreakpoint, type TableRefusal } from '../../core/document/breakpoints.ts';
import type { DocumentJson } from '../../core/document/model.ts';
import type { Patch } from '../../core/history/transaction.ts';
import type { MessageId } from '../../generated/ids.ts';
import type { EditorUi } from '../state.ts';
import { activeBreakpoint, choosing, viewportWidth } from './breakpoints.ts';

const refused = (refusal: TableRefusal): Outcome<EditorUi> => ({ kind: 'refused', message: message(`status.breakpoints.${refusal.refused}` as MessageId, refusal.params) });

// the patch that writes the table: the project's own from its first change on
const tablePatch = (document: DocumentJson, table: readonly ProjectBreakpoint[]): Patch => ({ op: document.breakpoints === undefined ? 'add' : 'replace', path: ['breakpoints'], value: table });

const unknown = (): Outcome<EditorUi> => ({ kind: 'refused', message: message('status.breakpoints.unknown') });

// Whether a breakpoint can be added at the width asked (the canvas's when none): the base's width, or one a breakpoint
// holds already, refuses it. The Breakpoints dialog offered "Add a breakpoint at this width (1440 px)" at the base's
// width, and said why only in the status bar behind it.
const additionAt = (state: Parameters<typeof viewportWidth>[0], args: unknown): TableRefusal | null => {
  const asked = (args as { readonly width?: unknown } | undefined)?.width;
  const at = typeof asked === 'number' && Number.isFinite(asked) ? Math.round(asked) : viewportWidth(state);
  const made = addedTable(breakpointsOf(state.document), at, null, '', (key) => key);
  return isRefusal(made) ? made : null;
};
export const breakpointAddable = registerPredicate<EditorUi>(
  'breakpointAddable',
  (state, _rules, args) => additionAt(state, args) === null,
  (state, _rules, args) => {
    const refusal = additionAt(state, args);
    return refusal === null ? message('status.breakpoints.unknown') : message(`status.breakpoints.${refusal.refused}` as MessageId, refusal.params);
  },
);

export const addBreakpoint = registerHandler<'breakpoints.add', EditorUi>('breakpoints.add', ({ state, words }, { width, name }) => {
  // the width the canvas shows, unless the door names one
  const at = typeof width === 'number' && Number.isFinite(width) ? Math.round(width) : viewportWidth(state);
  const made = addedTable(breakpointsOf(state.document), at, typeof name === 'string' ? name : null, words('breakpoints.defaultName', { width: at }), (key) => words(key));
  if (isRefusal(made)) return refused(made);
  const { viewportWidth: _width, ...ui } = state.ui;
  void _width;
  return {
    kind: 'change',
    patches: [tablePatch(state.document, made.table)],
    ui: { ...ui, preferences: choosing(state.ui, made.added) },
    message: message('status.breakpoints.added', { name: breakpointWords(made.added), width: made.added.width }),
  };
});

export const renameBreakpoint = registerHandler<'breakpoints.rename', EditorUi>('breakpoints.rename', ({ state, words }, { breakpoint, name }) => {
  const held = breakpointById(state.document, breakpoint);
  if (held === undefined) return unknown();
  const table = renamedTable(breakpointsOf(state.document), breakpoint, typeof name === 'string' ? name : '', (key) => words(key));
  if (isRefusal(table)) return refused(table);
  const renamed = table.find((b) => b.id === breakpoint) ?? held;
  if (renamed.name === held.name) return { kind: 'change' };
  return { kind: 'change', patches: [tablePatch(state.document, table)], message: message('status.breakpoints.renamed', { name: breakpointWords(renamed) }) };
});

export const setBreakpointWidth = registerHandler<'breakpoints.setWidth', EditorUi>('breakpoints.setWidth', ({ state }, { breakpoint, width }) => {
  const held = breakpointById(state.document, breakpoint);
  if (held === undefined) return unknown();
  const rounded = Math.round(width);
  if (rounded === held.width) return { kind: 'change' };
  const table = resizedTable(breakpointsOf(state.document), breakpoint, rounded);
  if (isRefusal(table)) return refused(table);
  // the canvas shows the breakpoint at its new width when it is the one shown
  const shown = activeBreakpoint(state).id === breakpoint;
  const { viewportWidth: _width, ...rest } = state.ui;
  void _width;
  return { kind: 'change', patches: [tablePatch(state.document, table)], ...(shown ? { ui: rest } : {}), message: message('status.breakpoints.resized', { name: breakpointWords(held), width: rounded }) };
});

// Where a removed breakpoint's styles go: nowhere, or into the next wider or narrower breakpoint (the narrower keeps
// its own look: it inherited them anyway)
export const removeBreakpoint = registerHandler<'breakpoints.remove', EditorUi>('breakpoints.remove', ({ state }, { breakpoint, styles }) => {
  const held = breakpointById(state.document, breakpoint);
  if (held === undefined) return unknown();
  if (held.base) return { kind: 'refused', message: message('status.breakpoints.baseStays', { name: breakpointWords(held) }) };
  const table = breakpointsOf(state.document);
  const at = table.findIndex((b) => b.id === breakpoint);
  const into = styles === 'wider' ? table[at - 1] : styles === 'narrower' ? table[at + 1] : undefined;
  if (styles === 'narrower' && into === undefined) return { kind: 'refused', message: message('status.breakpoints.noNarrower', { name: breakpointWords(held) }) };
  const without = documentWithout(state.document as unknown as Readonly<Record<string, unknown>>, breakpoint, into?.id ?? null);
  if (isRefusal(without)) return { kind: 'refused', message: message('status.breakpoints.usedByMotion', { name: breakpointWords(held) }) };
  const before = state.document as unknown as Readonly<Record<string, unknown>>;
  const after = without.document;
  // every field of the document the styles at the breakpoint lived in, written again without them
  const patches: Patch[] = Object.keys(after)
    .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .map((field) => ({ op: 'replace', path: [field], value: after[field] }));
  patches.push(tablePatch(state.document, breakpointsOf(state.document).filter((b) => b.id !== breakpoint)));
  const shown = activeBreakpoint(state).id === breakpoint;
  const said: Message = into === undefined ? message('status.breakpoints.removed', { name: breakpointWords(held) }) : message('status.breakpoints.removedInto', { name: breakpointWords(held), into: breakpointWords(into) });
  if (!shown) return { kind: 'change', patches, message: said };
  const { viewportWidth: _width, ...ui } = state.ui;
  void _width;
  const { breakpoint: _was, ...preferences } = state.ui.preferences;
  void _was;
  return { kind: 'change', patches, ui: { ...ui, preferences }, message: said };
});
