// The project's breakpoints as the document and the model rules hold them (spec project-breakpoints): the table's
// shape, what makes a table a project's, and the rules and output a table gives. No manifest here: the validator and
// the generator read it before the manifest's runtime exists (core/document/breakpoints.ts adds the default table).
import type { ModelRules } from './validate.ts';
import type { OutputModel } from '../render/output.ts';

// what holds a table: a document, or what a reader took of one
export interface Tabled {
  readonly breakpoints?: readonly ProjectBreakpoint[] | undefined;
}

export interface ProjectBreakpoint {
  readonly id: string;
  // null: a default breakpoint, named by its catalogue label; a text: the name the person gave it
  readonly name: string | null;
  readonly width: number;
  readonly height: number;
  readonly base: boolean;
}

// the widths a breakpoint may take (the narrowest phone a page is made for, the widest screen the canvas shows)
export const MIN_BREAKPOINT_WIDTH = 240;
export const MAX_BREAKPOINT_WIDTH = 7680;

// the fields a breakpoint holds
const FIELDS: Readonly<Record<keyof ProjectBreakpoint, true>> = { id: true, name: true, width: true, height: true, base: true };

// Why a table cannot be a project's, by the path inside it; none when it can.
export function breakpointProblems(value: unknown, defaultIds: readonly string[]): readonly { readonly path: string; readonly message: string }[] {
  const issues: { path: string; message: string }[] = [];
  const bad = (path: string, message: string) => issues.push({ path, message });
  if (!Array.isArray(value) || value.length === 0) return [{ path: '/breakpoints', message: 'a breakpoint table holds at least the base' }];
  const ids = new Set<string>();
  const names = new Set<string>();
  let previous = Infinity;
  let bases = 0;
  value.forEach((raw: unknown, index) => {
    const at = `/breakpoints/${index}`;
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return bad(at, 'a breakpoint is an object');
    const entry = raw as Record<string, unknown>;
    for (const key of Object.keys(entry)) if (!Object.hasOwn(FIELDS, key)) bad(`${at}/${key}`, 'not a field of a breakpoint');
    if (typeof entry.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(entry.id) || ids.has(entry.id)) bad(`${at}/id`, 'a breakpoint id is a unique kebab-case word');
    else ids.add(entry.id);
    const width = entry.width;
    if (typeof width !== 'number' || !Number.isInteger(width) || width < MIN_BREAKPOINT_WIDTH || width > MAX_BREAKPOINT_WIDTH) bad(`${at}/width`, `a width is a whole number of px from ${MIN_BREAKPOINT_WIDTH} to ${MAX_BREAKPOINT_WIDTH}`);
    else {
      if (width >= previous) bad(`${at}/width`, 'breakpoints go from the widest to the narrowest, each width once');
      previous = width;
    }
    if (typeof entry.height !== 'number' || !Number.isInteger(entry.height) || entry.height < 200 || entry.height > 7680) bad(`${at}/height`, 'a height is a whole number of px from 200 to 7680');
    if (typeof entry.base !== 'boolean') bad(`${at}/base`, 'base is true or false');
    else if (entry.base) {
      bases += 1;
      if (index !== 0) bad(`${at}/base`, 'the base breakpoint is the first');
    }
    if (entry.name === null) {
      if (typeof entry.id === 'string' && !defaultIds.includes(entry.id)) bad(`${at}/name`, 'only a default breakpoint goes without a name');
    } else if (typeof entry.name !== 'string' || entry.name.trim() === '' || entry.name !== entry.name.trim()) bad(`${at}/name`, 'a name is a text with no space around it');
    else {
      const folded = entry.name.toLocaleLowerCase();
      if (names.has(folded)) bad(`${at}/name`, 'each breakpoint has its own name');
      names.add(folded);
    }
  });
  if (bases !== 1) bad('/breakpoints', 'a table has exactly one base breakpoint');
  return issues;
}

// An output model (the export's, the canvas's) with a table's breakpoints: the media queries and the base layer.
const outputs = new WeakMap<readonly ProjectBreakpoint[], WeakMap<OutputModel, OutputModel>>();
export function outputForTable<Model extends OutputModel>(model: Model, table: readonly ProjectBreakpoint[] | undefined): Model {
  if (table === undefined) return model;
  let byModel = outputs.get(table);
  if (byModel === undefined) {
    byModel = new WeakMap();
    outputs.set(table, byModel);
  }
  const held = byModel.get(model);
  if (held !== undefined) return held as Model;
  const base = table.find((b) => b.base) ?? table[0];
  const next: Model = { ...model, breakpoints: table.map(({ id, width, base: isBase }) => ({ id, width, base: isBase })), base: { ...model.base, breakpoint: base?.id ?? model.base.breakpoint } };
  byModel.set(model, next);
  return next;
}

// The model rules of a project: the manifest's, with the project's breakpoints wherever the rules name them (the
// validator's ids, the import's widths, the base layer, the output's media queries). One object per table and rules,
// so a reader comparing what it read sees no change while the table stays.
const derived = new WeakMap<readonly ProjectBreakpoint[], WeakMap<ModelRules, ModelRules>>();
export function rulesForDocument(rules: ModelRules, document: Tabled): ModelRules {
  const table = document.breakpoints;
  if (table === undefined) return rules;
  let byRules = derived.get(table);
  if (byRules === undefined) {
    byRules = new WeakMap();
    derived.set(table, byRules);
  }
  const held = byRules.get(rules);
  if (held !== undefined) return held;
  const base = table.find((b) => b.base) ?? table[0];
  if (base === undefined) return rules;
  const next: ModelRules = {
    ...rules,
    breakpoints: new Set(table.map((b) => b.id)),
    breakpointTable: table,
    breakpointWidths: new Map(table.map((b) => [b.id, b.width] as const)),
    base: { ...rules.base, breakpoint: base.id },
    baseLayer: { ...rules.baseLayer, breakpoint: base.id },
    output: outputForTable(rules.output, table),
    // the manifest's rules these were made from: what the validator reads any document against (validate.ts)
    manifest: rules.manifest ?? rules,
  };
  byRules.set(rules, next);
  return next;
}
