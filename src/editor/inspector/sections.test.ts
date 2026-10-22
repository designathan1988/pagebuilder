import { describe, expect, it } from 'vitest';
import { manualClock } from '../../core/ports/clock.ts';
import { sequentialIds } from '../../core/ports/ids.ts';
import type { MessageId } from '../../generated/ids.ts';
import { translate } from '../../i18n/index.ts';
import type { PreferenceStorage } from '../preferences/preferences.ts';
import { createEditorStore, MODEL_RULES } from '../store.ts';
import type { Declarations, DocNode, DocumentJson } from '../../core/document/model.ts';
import { collapsedSections, declaredBorderValues, searchMatches, searchWords, sectionClosed, summaryOf, summaryProperties } from './sections.ts';

function memory(text: string | null = null): PreferenceStorage & { text: string | null } {
  const box = {
    text,
    read: () => box.text,
    write: (t: string) => {
      box.text = t;
    },
  };
  return box;
}
const store = (storage = memory()) => createEditorStore({ storage, ids: sequentialIds('n'), clock: manualClock() });
const words = (key: MessageId, params?: Readonly<Record<string, string | number>>) => translate('en', key, params);

describe('collapsed sections (inspector/sections.ts)', () => {
  it('opens and closes a section, the same for every element, recording nothing and leaving the document', () => {
    const s = store();
    const before = s.getState();
    // Nothing is selected and no element holds anything: a section that carries the essentials is drawn open — it is
    // what the panel shows at first (the user's correction, 2026-09-28) — and a section without them is drawn
    // collapsed. No press is recorded.
    const held = new Set<string>();
    expect(sectionClosed(s.getState().ui, 'layout', held)).toBe(false);
    expect(sectionClosed(s.getState().ui, 'border', held)).toBe(true);
    expect(s.getState().ui.preferences).toEqual({ locale: 'en', theme: 'dark' });
    // the press opens the border section for this user, who keeps it open although the element holds nothing there
    s.dispatch('inspector.toggleSection', { section: 'border' });
    expect(sectionClosed(s.getState().ui, 'border', held)).toBe(false);
    const root = s.getState().document.pages[0]?.tree.id ?? '';
    s.dispatch('selection.select', { target: root });
    expect(sectionClosed(s.getState().ui, 'border', held)).toBe(false);
    // the second press closes it, and what the user pressed is kept in the sections' order, whatever the clicks' order
    s.dispatch('inspector.toggleSection', { section: 'border' });
    expect(sectionClosed(s.getState().ui, 'border', held)).toBe(true);
    s.dispatch('inspector.toggleSection', { section: 'advanced' });
    s.dispatch('inspector.toggleSection', { section: 'advanced' });
    expect(collapsedSections(s.getState().ui)).toEqual(['border', 'advanced']);
    s.dispatch('inspector.toggleSection', { section: 'advanced' });
    s.dispatch('inspector.toggleSection', { section: 'border' });
    expect(collapsedSections(s.getState().ui)).toEqual([]);
    expect(s.getState().ui.preferences).toEqual({ locale: 'en', theme: 'dark', expandedSections: ['border', 'advanced'] });
    expect(s.getState().document).toBe(before.document);
    expect(s.getState().history).toBe(before.history);
  });

  it('keeps what the user closed and what the user opened in the preferences after a reload, and leaves out what is no section', () => {
    const storage = memory();
    const held = new Set<string>();
    const first = store(storage);
    // text closed (what the user closed; it carries the essentials, so it was drawn open at first) and advanced
    // opened (what the user opened; it carries none, so it was drawn collapsed at first)
    first.dispatch('inspector.toggleSection', { section: 'text' });
    first.dispatch('inspector.toggleSection', { section: 'advanced' });
    expect(JSON.parse(storage.text ?? '')).toEqual({ locale: 'en', theme: 'dark', collapsedSections: ['text'], expandedSections: ['advanced'] });
    const reloaded = store(storage).getState().ui;
    expect(sectionClosed(reloaded, 'text', held)).toBe(true);
    expect(sectionClosed(reloaded, 'advanced', held)).toBe(false);
    expect(collapsedSections(reloaded)).toEqual(['text']);
    const odd = store(memory('{"locale":"en","theme":"dark","collapsedSections":["nope","paint",3],"expandedSections":["nope","advanced"]}'));
    expect(collapsedSections(odd.getState().ui)).toEqual(['paint']);
    expect(sectionClosed(odd.getState().ui, 'advanced', held)).toBe(false);
    expect(sectionClosed(odd.getState().ui, 'border', held)).toBe(true);
  });

  // a section the inspector does not have is refused with words before the handler runs, never thrown (AUD-09)
  it('takes only a section of the inspector', () => {
    const s = store();
    expect(s.dispatch('inspector.toggleSection', { section: 'nope' } as never).status).toBe('refused');
    expect(s.getState().message?.key).toBe('status.stale');
    expect(collapsedSections(s.getState().ui)).toEqual([]);
  });
});

describe('the summary of a collapsed section (inspector/sections.ts)', () => {
  // the values a section reads, by the longhands it names (properties.json sections[].summary)
  const values = (section: Parameters<typeof summaryProperties>[0], given: readonly string[]) => Object.fromEntries(summaryProperties(section).map((p, i) => [p, given[i] ?? '']));
  const summary = (section: Parameters<typeof summaryProperties>[0], given: readonly string[]) => summaryOf(section, values(section, given), words, 'en');

  it('reads the properties and the longhands of the composites its section names, in order', () => {
    expect(summaryProperties('space')).toEqual(['margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left']);
    expect(summaryProperties('size')).toEqual(['width', 'height']);
    expect(summaryProperties('content')).toEqual([]);
  });

  it('writes each section as its values say', () => {
    expect(summary('layout', ['block', 'row'])).toBe('block');
    expect(summary('layout', ['flex', 'column'])).toBe('flex · column');
    expect(summary('space', ['0px', '0px', '0px', '0px', '56px', '40px', '56px', '40px'])).toBe('P 56px 40px');
    expect(summary('space', ['16px', '0px', '16px', '0px', '0px', '0px', '0px', '0px'])).toBe('M 16px 0px');
    expect(summary('space', ['8px', '8px', '8px', '8px', '4px', '2px', '1px', '3px'])).toBe('M 8px · P 4px 2px 1px 3px');
    expect(summary('space', ['0px', '0px', '0px', '0px', '0px', '0px', '0px', '0px'])).toBe('None');
    expect(summary('size', ['auto', '120px'])).toBe('auto × 120px');
    expect(summary('position', ['static', 'auto'])).toBe('static · z auto');
    expect(summary('paint', ['rgba(0, 0, 0, 0)'])).toBe('None');
    expect(summary('paint', ['rgb(255, 0, 0)'])).toBe('rgb(255, 0, 0)');
    const noBorder = [...Array<string>(4).fill('0px'), ...Array<string>(4).fill('none'), ...Array<string>(4).fill('0px')];
    expect(summary('border', noBorder)).toBe('None');
    expect(summary('border', [...Array<string>(4).fill('1px'), ...Array<string>(4).fill('solid'), ...Array<string>(4).fill('4px')])).toBe('1px solid · R 4px');
    expect(summary('border', [...Array<string>(4).fill('0px'), ...Array<string>(4).fill('none'), ...Array<string>(4).fill('4px')])).toBe('R 4px');
    expect(summary('text', ['16px', '400'])).toBe('16px · 400');
    expect(summary('effects', ['1', 'none', 'none', 'none', 'none', 'none', 'none'])).toBe('None');
    expect(summary('effects', ['0.5', 'none', 'none', 'none', 'none', 'none', 'none'])).toBe('1 effect');
    expect(summary('effects', ['0.5', 'rgb(0, 0, 0) 1px 1px 2px 0px', 'none', 'none', 'none', 'none', 'none'])).toBe('2 effects');
  });

  it('has none for a section without a summary, or when the page draws no element', () => {
    expect(summaryOf('content', {}, words, 'en')).toBeNull();
    expect(summaryOf('size', null, words, 'en')).toBeNull();
  });

  it('reads authored border widths and class values without measuring the canvas', () => {
    const base = store().getState().document;
    const page = base.pages[0];
    if (page === undefined) throw new Error('the test project has no page');
    const declarations = Object.fromEntries(summaryProperties('border').map((property) => [property,
      property.endsWith('-width') ? '4px' : property.endsWith('-style') ? 'solid' : '0px',
    ])) as Declarations;
    const node: DocNode = { ...page.tree, classes: ['frame'], styles: {} };
    const document: DocumentJson = { ...base, pages: [{ ...page, tree: node }], classes: [{ name: 'frame', styles: { desktop: { base: declarations } } }] };
    expect(summaryOf('border', declaredBorderValues(document, node, MODEL_RULES), words, 'en')).toBe('4px solid');
    const withOwn: DocNode = { ...node, styles: { desktop: { base: { 'border-top-width': '6px' } } } };
    expect(summaryOf('border', declaredBorderValues(document, withOwn, MODEL_RULES), words, 'en')).toBe('6px 4px 4px solid');
  });
});

describe('property search', () => {
  const background = searchWords('property.backgroundColor', ['background-color']);
  const width = searchWords('property.width', ['width']);
  it('finds a colour field by its words in either language, fillers ignored', () => {
    for (const query of ['Fundo', 'fundo', 'background', 'cor de fundo', 'background color', 'cor', 'colour', 'Cor do fundo']) expect(searchMatches(query, background), query).toBe(true);
  });
  it('keeps a field that none of the words name out', () => {
    for (const query of ['cor', 'cor de fundo', 'de', 'colour']) expect(searchMatches(query, width), query).toBe(false);
    expect(searchMatches('cor de fundo', searchWords('property.backgroundClip', ['background-clip'])), 'a word begins a word').toBe(false);
    expect(searchMatches('largura', width)).toBe(true);
    expect(searchMatches('  ', width)).toBe(true);
  });
});
