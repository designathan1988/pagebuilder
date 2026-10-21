// The check of the interface's text against the space it is drawn in (the investigation's C4, with the measured widths
// of option D; DEF-0573): for every door whose control draws a text of the interface, that text in pt-BR and in
// English has to fit the space that door's own label has, with 1 px of slack. The width of a text comes from the face
// itself (font.ts, no browser); the space comes from manifest/generated/ui-widths.json, where
// tools/ui-fit/measure.spec.ts records, in each screen condition, how wide a far longer text gets in the label before
// it is cut or breaks its line (the rule G5 asks: measure against the element's own space, never a track chosen by its
// place), with the text the label draws, its letter spacing and its transform. A text measured is tied to its message
// in the catalogues, so a message changed since is checked as it reads now, without a browser.
// The pseudo-expansion (140 % of the English, its ends marked) is reported, not failed (decisoes.md, DCS-024: the
// interface as it is gives 57 labels less room than that; widening its columns is a decision of the product).
// The measurement is kept beside the hash of the stylesheets it was taken with: a stylesheet changed since makes it
// stale, which is a finding; and every door whose label no measurement reaches is named, in a region whose reason is
// written below (none is skipped in silence).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { textWidth, uiFont, type Font, type Weight } from './font.ts';
import { commandsFileSchema } from '../../src/manifest/schema.ts';
import { loadManifest } from '../manifest/load.ts';
import { mutatedSource } from '../runner/mutants.ts';

// The measured widths (tools/ui-fit/measure.spec.ts): one entry per door and per screen condition.
export const UI_WIDTHS = 'manifest/generated/ui-widths.json';

// Why the doors of a region have labels no measurement reaches: the measurer opens the editor's first screen, every
// menu of the top bar, the command bar with a query, the quick panel, the context menu of an element, the colour
// picker, every view of the activity bar and every tab of the dock, and the Style (every section and row open),
// Settings and Interactions tabs for a heading, a form, a field, a video, a button, a link and an image. A door of a
// region below is drawn in a state none of those reaches.
export const UNMEASURED_REASONS: Readonly<Record<string, string>> = {
  'assistant-panel': 'the assistant draws its controls once a connection is set up, which the measurer has none of',
  'app-panel': "the App panel draws a variable's, a module's and a table's fields once the app has one (the measured projects have no app layer)",
  'asset-picker': 'the asset picker opens from a field of an image source, with project files to list',
  'batch-rename-dialog': 'a dialog opened from several elements selected',
  'breakpoints-dialog': 'a dialog opened from the breakpoints menu',
  'canvas-breakpoints': 'a breakpoint tab drawn for a breakpoint a project adds',
  'canvas-side-by-side': 'the side-by-side view of the canvas, a mode of its own',
  'captured-inspector': 'the inspector of a captured page, a project of another kind',
  'capture-url-dialog': 'a dialog of the capture of a site',
  'code-view': 'the code view, a mode of its own',
  'color-picker': 'the parts of the colour picker for gradients and the eyedropper, drawn in states of the picker',
  'command-palette': 'an entry is listed by the query it matches and the state it acts on (the entries the query "e" lists are measured)',
  'component-prompt': 'a prompt opened when a component is made',
  'context-menu': 'an entry is drawn for the kind of the element pressed (the heading\'s entries are measured)',
  'data-collection': 'the Data panel draws a collection\'s controls once a collection exists',
  'data-grid': 'the grid of a collection\'s items',
  'data-mapping': 'the mapping of an import of data',
  'data-pages': 'the pages made from a collection',
  'data-panel': 'the Data panel with collections in it',
  'data-preview': 'the preview of an import of data',
  'data-shared': 'the collections shared between projects',
  'dock-checks': 'a fix of the checks is drawn for the problem the page has',
  'dock-motion': 'the motion dock draws an animation\'s controls once an animation exists',
  'dock-timeline': 'the timeline draws its tracks once an animation exists',
  'explorer-files': 'a file row is drawn for a file the project holds',
  'file-tabs': 'a page tab is drawn for each page a project has',
  'guides-grids-dialog': 'a dialog opened from the View menu',
  'html-import': 'the report of an import of HTML',
  'inspector-interactions': 'an interaction\'s controls are drawn once an interaction exists',
  'inspector-selector-bar': 'the class bar draws a class\'s controls once a class is applied',
  'inspector-settings': 'an attribute field is drawn for the elements that take it (a heading, a form, a field, a video, a button, a link and an image are measured)',
  'inspector-style': 'a property field is drawn for the elements it applies to (the same elements are measured)',
  insert: 'a component tile is drawn once a component exists',
  'layers-row': 'a row\'s parts are drawn for the state of its node (a lock, a hidden node, a component)',
  'layout-composer-panel': 'the Layout Composer draws its steps once a composition starts',
  'inspector-logic': "the Logic tab of an app's element (the measurer opens the Style, Settings and Interactions tabs of projects with no app layer)",
  'link-picker': 'the link picker opens from a field of a link',
  'menu:layers-row-details': 'the details menu of a Layers row',
  'menu:style-state': 'a state is offered for the elements that take it (a heading\'s states are measured)',
  'menu:theme': 'the theme menu draws the themes a project defines',
  'preview-bar': 'the preview, a mode of its own',
  'quick-panel': 'a field of the quick panel is drawn for the kind of the element selected (a heading\'s are measured)',
  'recovery-dialog': 'a dialog shown when a previous session left unsaved work',
  'snap-settings-dialog': 'a dialog opened from the snap menu',
  'start-ai': 'the start card is drawn only on the empty project (isEmptyProject); the measurer opens projects with content',
  'start-examples': 'the start card is drawn only on the empty project (isEmptyProject); the measurer opens projects with content',
  'start-templates': 'the start card is drawn only on the empty project (isEmptyProject); the measurer opens projects with content',
  styles: 'the Styles view draws a class\'s controls once classes exist',
  'tab-guard': 'the notice shown when the project is open in another tab',
  'tab-strip': 'a tab strip drawn by a panel with tabs of its own',
  'text-toolbar': 'the toolbar of the text edited in place',
  toast: 'a notice shown after an action',
};

export interface LabelSpace {
  readonly width: number;
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly letterSpacing: number;
  readonly textTransform: string;
  // the text the label draws in that condition's language
  readonly text: string;
  // the lines the label may take before it cuts (a tile's name clamped to two: sidebar.css); one when absent
  readonly lines?: number;
}
export interface Measured {
  readonly doors: { readonly [ref: string]: { readonly [condition: string]: LabelSpace } };
  readonly textless: { readonly [condition: string]: readonly string[] };
  readonly css: string;
}

export interface Finding {
  readonly region: string;
  readonly ref: string;
  readonly text: string;
  readonly need: number;
  readonly column: number;
  readonly slack: number;
}

// The English text with the vowels accented and the ends marked, extended to 140 % of its length: the headroom a
// translation into a longer language takes (the investigation's C4 cites the W3C table of text expansion, 130 % to
// 300 % by length; 140 % is the value this check reports every label against).
export function pseudoExpansion(text: string): string {
  const accented = text.replace(/[aeiou]/g, (c) => 'áéíóú'['aeiou'.indexOf(c)] ?? c);
  return `【${accented.padEnd(Math.round(text.length * 1.4), '·')}】`;
}

// the hash of every stylesheet of the application, sorted, read with the passage of the mutant under run swapped and
// without its comments (a comment draws nothing, so rewording one keeps the measurement): the key of a measurement
// (the measurer writes the same hash: tools/ui-fit/measure.spec.ts)
export function cssHash(root = ''): string {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(`${root}${dir}`, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.css')) files.push(full);
    }
  };
  walk('src');
  const hash = crypto.createHash('sha256');
  for (const file of files.sort()) hash.update(`${file}\n${mutatedSource(file.split(path.sep).join('/'), fs.readFileSync(`${root}${file}`, 'utf8')).replace(/\/\*[\s\S]*?\*\//gu, '')}`);
  return hash.digest('hex');
}

interface Labels {
  readonly ptBR: Readonly<Record<string, unknown>>;
  readonly en: Readonly<Record<string, unknown>>;
}

export interface DoorLabel {
  readonly ref: string;
  readonly region: string;
}

// Every door of the manifest whose control may draw a text, with the region it is placed in: a door drawn as an icon
// button carries its label as the accessible name and the tooltip, and the page draws no text for it.
export function drawnLabels(files: Readonly<Record<string, unknown>>): DoorLabel[] {
  const out: DoorLabel[] = [];
  for (const [file, json] of Object.entries(files)) {
    if (!file.startsWith('commands/')) continue;
    const parsed = commandsFileSchema.safeParse(json);
    if (!parsed.success) continue;
    for (const command of parsed.data.commands)
      for (const door of command.entryPoints) {
        if (door.placement === 'none' || door.placement === 'unplaced') continue;
        const drawnAs = 'drawnAs' in door ? door.drawnAs : null;
        if (drawnAs === 'icon-button') continue;
        out.push({ ref: `${command.id}#${door.id}`, region: door.placement.region });
      }
  }
  return out;
}

// the text as the browser sets it: its transform (CSS Text 3, text-transform)
function setText(text: string, transform: string): string {
  if (transform === 'uppercase') return text.toUpperCase();
  if (transform === 'lowercase') return text.toLowerCase();
  if (transform === 'capitalize') return text.replace(/(^|\s)(\p{L})/gu, (_whole, gap: string, letter: string) => `${gap}${letter.toUpperCase()}`);
  return text;
}
// the width a text takes as the label sets it: its glyphs, and the letter spacing added after every character (CSS
// Text 3, letter-spacing)
const setWidth = (font: Font, text: string, space: LabelSpace): number => {
  const set = setText(text, space.textTransform);
  return textWidth(font, set, space.fontSize) + space.letterSpacing * [...set].length;
};

// The width a text needs in a label of several lines (a tile's name, clamped to two): its words broken over the lines
// as the browser breaks them, the widest line; a text that takes more lines than the label has needs its whole width
// (it is cut). One line: the text's width.
const linesNeed = (font: Font, text: string, space: LabelSpace): number => {
  const lines = space.lines ?? 1;
  const whole = setWidth(font, text, space);
  if (lines <= 1) return whole;
  const words = text.split(/\s+/).filter((word) => word !== '');
  const drawn: string[] = [];
  for (const word of words) {
    const last = drawn.length - 1;
    const joined = last < 0 ? word : `${drawn[last]} ${word}`;
    if (last >= 0 && setWidth(font, joined, space) + 1 <= space.width) drawn[last] = joined;
    else drawn.push(word);
  }
  return drawn.length > lines ? whole : Math.max(...drawn.map((line) => setWidth(font, line, space)));
};

// The messages a drawn text is: the keys whose text it is, exactly; or, for a message with placeholders ({count}
// stands for whatever the page writes there), the keys whose text it matches. A text of no catalogue is the person's
// own (an element's name, a value typed), whose length is theirs.
interface Messages {
  readonly keysOf: (text: string) => readonly string[];
  readonly templated: (text: string) => boolean;
}
function messagesOf(catalogue: Readonly<Record<string, unknown>>): Messages {
  const exact = new Map<string, string[]>();
  const patterns: RegExp[] = [];
  for (const [key, value] of Object.entries(catalogue)) {
    if (typeof value !== 'string') continue;
    if (!value.includes('{')) exact.set(value, [...(exact.get(value) ?? []), key]);
    // a message that is placeholders and little else ({value}, "{name} {kind}") matches any text, the person's own
    // among them (measured: an element's name, a font list, a band's "0"): it names no text of the interface
    else if ((value.replace(/\{[^}]*\}/g, '').match(/\p{L}/gu) ?? []).length >= 3)
      patterns.push(new RegExp(`^${value.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]*\}/g, '.+?')}$`, 's'));
  }
  return { keysOf: (text) => exact.get(text) ?? [], templated: (text) => patterns.some((pattern) => pattern.test(text)) };
}

export interface UiFitInput {
  readonly measured: Measured | null;
  readonly cssNow: string;
  readonly labels: readonly DoorLabel[];
  readonly catalogue: Labels;
}
export interface UiFitReport {
  // the texts of pt-BR and English that do not fit their label's space
  readonly findings: readonly Finding[];
  // the pseudo-expansions that do not fit (reported: DCS-024)
  readonly stretched: readonly Finding[];
  // the doors whose label no measurement reaches, and those of a region with no reason written
  readonly unmeasured: readonly DoorLabel[];
  readonly unexplained: readonly DoorLabel[];
  // the doors measured with no text of their own (an icon, a row's gesture, a text kept for screen readers)
  readonly textless: readonly DoorLabel[];
  // the measurement was taken with other stylesheets: it says nothing of the interface now
  readonly stale: boolean;
}

export function uiFit(input: UiFitInput): UiFitReport {
  const fonts = new Map<Weight, Font>();
  const fontOf = (weight: number): Font => {
    const key: Weight = weight >= 500 ? 600 : 400;
    let held = fonts.get(key);
    if (held === undefined) {
      held = uiFont(key);
      fonts.set(key, held);
    }
    return held;
  };
  const findings: Finding[] = [];
  const stretched: Finding[] = [];
  const english = messagesOf(input.catalogue.en);
  const portuguese = messagesOf(input.catalogue.ptBR);
  const regionOf = new Map(input.labels.map((door) => [door.ref, door.region] as const));
  const textOf = (catalogue: Readonly<Record<string, unknown>>, key: string): string => {
    const held = catalogue[key];
    return typeof held === 'string' ? held : '';
  };
  // a text with no letter (a number, a percentage, a value) is no word to translate
  const worded = (text: string): boolean => /\p{L}/u.test(text);
  const narrowest = (cells: readonly LabelSpace[]): LabelSpace | null => (cells.length === 0 ? null : cells.reduce((least, cell) => (cell.width < least.width ? cell : least)));
  for (const [ref, conditions] of Object.entries(input.measured?.doors ?? {})) {
    // each language against the space measured in its own condition (its neighbours in a row are in that language
    // too): English in the default and the Windows conditions, Portuguese in the pt-BR one
    const enSpace = narrowest([conditions.default, conditions.windows].filter((one): one is LabelSpace => one !== undefined));
    const ptSpace = conditions.ptbr ?? null;
    const drawnEn = enSpace?.text ?? '';
    const drawnPt = ptSpace?.text ?? '';
    // The message the label draws, as the catalogues hold it now: the keys both languages drew; else the keys of the
    // English when the Portuguese drawn is no message at all (it changed since the measurement), and the converse;
    // else what was drawn, when it is a message with its placeholders filled or one language drew a message the other
    // did not (a CSS keyword written alike in every language). A text of no catalogue is the person's own. The same
    // text drawn in both languages is a value the field shows as written ("auto" of min-width), not a message that
    // changed: it is checked as drawn.
    const keysEn = english.keysOf(drawnEn);
    const keysPt = portuguese.keysOf(drawnPt);
    const both = keysEn.filter((key) => keysPt.includes(key));
    const current = (keys: readonly string[]) => keys.map((key) => ({ pt: textOf(input.catalogue.ptBR, key), en: textOf(input.catalogue.en, key) }));
    const alike = drawnEn === drawnPt;
    let texts: { pt: string; en: string }[];
    if (both.length > 0) texts = current(both);
    else if (!alike && keysEn.length > 0 && (drawnPt === '' || (keysPt.length === 0 && !portuguese.templated(drawnPt)))) texts = current(keysEn);
    else if (!alike && keysPt.length > 0 && (drawnEn === '' || (keysEn.length === 0 && !english.templated(drawnEn)))) texts = current(keysPt);
    else if (keysEn.length > 0 || keysPt.length > 0 || english.templated(drawnEn) || portuguese.templated(drawnPt)) texts = [{ pt: drawnPt, en: drawnEn }];
    else continue;
    const region = regionOf.get(ref) ?? '?';
    const check = (text: string, space: LabelSpace | null, into: Finding[]): void => {
      if (space === null || text === '' || !worded(text)) return;
      const need = linesNeed(fontOf(space.fontWeight), text, space);
      if (need + 1 > space.width) into.push({ region, ref, text, need, column: space.width, slack: space.width - need });
    };
    const fails: Finding[] = [];
    const stretches: Finding[] = [];
    for (const { pt, en } of texts) {
      check(pt, ptSpace ?? enSpace, fails);
      check(en, enSpace ?? ptSpace, fails);
      if (en !== '') check(pseudoExpansion(en), enSpace ?? ptSpace, stretches);
    }
    // the worst of each, once per door
    const worst = (list: readonly Finding[]): Finding | undefined => list.reduce<Finding | undefined>((held, one) => (held === undefined || one.slack < held.slack ? one : held), undefined);
    const fail = worst(fails);
    const stretch = worst(stretches);
    if (fail !== undefined) findings.push(fail);
    if (stretch !== undefined) stretched.push(stretch);
  }
  const noText = new Set(Object.values(input.measured?.textless ?? {}).flat());
  const unmeasured: DoorLabel[] = [];
  const textless: DoorLabel[] = [];
  for (const door of input.labels) {
    if (input.measured?.doors[door.ref] !== undefined) continue;
    if (noText.has(door.ref)) textless.push(door);
    else unmeasured.push(door);
  }
  return {
    findings,
    stretched,
    unmeasured,
    unexplained: unmeasured.filter((door) => UNMEASURED_REASONS[door.region] === undefined),
    textless,
    stale: input.measured === null || input.measured.css !== input.cssNow,
  };
}

// The check against the disk: the measured spaces of manifest/generated/ui-widths.json, the hash of the stylesheets now
// and the two catalogues (each read with the mutant's passage swapped when one is under run), and the doors of the
// manifest.
export function uiFitFromDisk(root = ''): UiFitReport {
  const file = `${root}${UI_WIDTHS}`;
  const json = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as { $generated?: { css?: string }; doors?: Measured['doors']; textless?: Measured['textless'] }) : null;
  const measured: Measured | null = json === null ? null : { doors: json.doors ?? {}, textless: json.textless ?? {}, css: json.$generated?.css ?? '' };
  const catalogue = (locale: string): Readonly<Record<string, unknown>> => {
    const at = `src/i18n/locales/${locale}.json`;
    return JSON.parse(mutatedSource(at, fs.readFileSync(`${root}${at}`, 'utf8'))) as Readonly<Record<string, unknown>>;
  };
  return uiFit({
    measured,
    cssNow: cssHash(root),
    labels: drawnLabels(loadManifest().input.files),
    catalogue: { ptBR: catalogue('pt-BR'), en: catalogue('en') },
  });
}
