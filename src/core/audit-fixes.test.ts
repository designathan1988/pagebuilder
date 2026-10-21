// The functional bugs the 2026-09-30 code audit found (journey02/MASTER-PLAN and the resolution plan, items B-xx and
// M-xx), each proven on the handler that had it: every test here failed on the code before its fix.
import { describe, expect, it } from 'vitest';
import type { NodeId } from '../generated/commands.ts';
import { copyCommand, pasteCommand } from './clipboard/clipboard.ts';
import { createClassCommand } from './design/classes.ts';
import { deletePageCommand, duplicatePageCommand, renamePageCommand } from './project/pages.ts';
import { siteFiles } from './export/export.ts';
import { freshId } from './elements/inputs.ts';
import { deleteCommand } from './structure/remove.ts';
import { duplicateCommand } from './structure/duplicate.ts';
import { unwrapCommand, wrapRowCommand } from './structure/wrap.ts';
import { RULES, documentOf, node, runHandler } from './testing/handlers.ts';
import { slug } from './text/fold.ts';
import { setStyleCommand } from './style/set.ts';
import { editableSelection } from './nodes/flags.ts';
import { setGridItemCommand, storedPlace } from './style/grid-item.ts';
import { isIdentifier } from './text/identifier.ts';
import type { DocumentJson } from './document/model.ts';

const page = (id: string, name: string, file: string, children: ReturnType<typeof node>[] = []) => ({ id, name, file, tree: node(`${name}Root`, 'page', 'body', { children }) });

describe('names derived from a person’s words (B-15, B-16)', () => {
  it('drops accents instead of turning them into dashes', () => {
    expect(slug('Seção')).toBe('secao');
    expect(slug('Título do Card')).toBe('titulo-do-card');
    expect(slug('Ação! Única ç ã é í ô ü')).toBe('acao-unica-c-a-e-i-o-u');
  });

  // Class names are written in the project's code language (stage 6: English by default); this project chose
  // Portuguese, so the person's own words stay, folded without accents.
  it('exports the class of a pt-BR name without accents (se-o__t-tulo before)', () => {
    const document = { ...documentOf({ pages: [page('p', 'Início', 'index.html', [node('Seção', 'section', 'section', { styles: { desktop: { base: { 'padding-top': '8px' } } }, children: [node('Título', 'heading', 'h1', { styles: { desktop: { base: { color: 'red' } } } })] })])] }), codeLanguage: 'pt-BR' };
    const site = siteFiles(document, RULES);
    expect(site.pages[0]?.html).toContain('class="secao"');
    expect(site.pages[0]?.html).toContain('class="secao__titulo"');
    // the same document gives the same bytes
    expect(siteFiles(document, RULES)).toEqual(site);
  });

  it('makes a form id from an accented name', () => {
    expect(freshId(documentOf({ pages: [page('p', 'Home', 'index.html')] }), 'Endereço')).toBe('endereco');
  });

  it('takes a class or a variable named in any language', () => {
    expect(isIdentifier('botão')).toBe(true);
    expect(isIdentifier('cor-primária')).toBe(true);
    expect(isIdentifier('9lives')).toBe(false);
    const ran = runHandler(createClassCommand, documentOf({ pages: [page('p', 'Home', 'index.html', [node('Buy', 'button', 'button', { text: 'Buy' })])] }), { name: 'botão' }, { selection: ['Buy'] });
    expect(ran.outcome.kind).toBe('change');
    expect(ran.document.classes?.map((c) => c.name)).toEqual(['botão']);
    expect(ran.problems).toEqual([]);
  });
});

describe('the export (B-01)', () => {
  it('never gives two pages’ elements, or an element and a project class, the same class', () => {
    const styled = (name: string, css: Record<string, string>) => node(name, 'section', 'section', { styles: { desktop: { base: css } } });
    const document = documentOf({
      pages: [page('p', 'Home', 'index.html', [styled('Hero', { color: 'red' }), styled('Card', { 'padding-top': '4px' })]), page('q', 'About', 'about.html', [styled('Hero', { 'padding-top': '40px' })])],
      classes: [{ name: 'card', styles: { desktop: { base: { 'background-color': 'red' } } } }],
    });
    const site = siteFiles(document, RULES);
    const home = site.pages[0]?.html ?? '';
    const about = site.pages[1]?.html ?? '';
    const heroHome = /<section class="([^"]+)"/.exec(home)?.[1];
    const heroAbout = /<section class="([^"]+)"/.exec(about)?.[1];
    expect(heroHome).toBe('hero');
    expect(heroAbout).not.toBe('hero');
    expect(home).not.toMatch(/class="card"/);
  });
});

describe('pages (B-03, B-09, B-13, M-01)', () => {
  const link = (href: string) => node('Link', 'link', 'a', { attributes: { href }, text: 'About' });

  it('renaming a page takes the links to its file with it', () => {
    const document = documentOf({ pages: [page('p', 'Home', 'index.html', [link('about.html')]), page('q', 'About', 'about.html')] });
    const ran = runHandler(renamePageCommand, document, { page: 'q', name: 'Sobre nós' });
    expect(ran.document.pages[1]?.file).toBe('sobre-nos.html');
    expect(ran.document.pages[0]?.tree.children[0]?.attributes.href).toBe('sobre-nos.html');
    expect(ran.problems).toEqual([]);
  });

  it('duplicating "About 2" makes "About 3", never "About 2 2"', () => {
    const document = documentOf({ pages: [page('p', 'Home', 'index.html'), page('q', 'About', 'about.html'), page('r', 'About 2', 'about-2.html')] });
    const ran = runHandler(duplicatePageCommand, document, { page: 'r' });
    expect(ran.document.pages.map((p) => p.name)).toContain('About 3');
  });

  it('deleting a page asks first, with its name, then releases what other pages pointed at in it', () => {
    const target = node('Target', 'section', 'section', { attributes: { id: 'target' } });
    const document = documentOf({ pages: [page('p', 'Home', 'index.html', [node('Jump', 'link', 'a', { attributes: { href: '#Target' }, text: 'Go' })]), page('q', 'About', 'about.html', [target])] });
    const asked = runHandler(deletePageCommand, document, { page: 'q' });
    expect(asked.outcome).toEqual({ kind: 'confirm', params: { name: 'About' } });
    const ran = runHandler(deletePageCommand, document, { page: 'q' }, { confirmed: true });
    expect(ran.document.pages.map((p) => p.name)).toEqual(['Home']);
    expect(ran.document.pages[0]?.tree.children[0]?.attributes.href).toBeUndefined();
    expect(ran.problems).toEqual([]);
  });
});

describe('structure (B-06, B-07, B-17)', () => {
  it('deleting an element takes away the interactions that acted on it', () => {
    const button = node('Button', 'button', 'button', { text: 'Open', interactions: [{ trigger: 'click', action: 'show', target: 'Modal' as NodeId }] });
    const document = documentOf({ pages: [page('p', 'Home', 'index.html', [button, node('Modal', 'section', 'section')])] });
    const ran = runHandler(deleteCommand, document, {}, { selection: ['Modal'] });
    expect(ran.document.pages[0]?.tree.children[0]?.interactions).toBeUndefined();
    expect(ran.problems).toEqual([]);
    // the export no longer writes querySelector(".") for it
    expect(siteFiles(ran.document, RULES).interactions ?? '').not.toContain('querySelector(".")');
  });

  it('duplicating a positioned element moves the copy, not the positioned elements inside it', () => {
    const badge = node('Badge', 'div', 'div', { styles: { desktop: { base: { position: 'absolute', top: '0px', left: '0px' } } } });
    const card = node('Card', 'section', 'section', { styles: { desktop: { base: { position: 'absolute', top: '10px', left: '10px' } } }, children: [badge] });
    const document = documentOf({ pages: [page('p', 'Home', 'index.html', [card])] });
    const ran = runHandler(duplicateCommand, document, {}, { selection: ['Card'] });
    const copy = ran.document.pages[0]?.tree.children[1];
    expect(copy?.styles.desktop?.base?.top).not.toBe('10px');
    expect(copy?.children[0]?.styles.desktop?.base?.top).toBe('0px');
    expect(copy?.children[0]?.styles.desktop?.base?.left).toBe('0px');
  });

  it('unwrap takes away what wrap in a Row gave the children', () => {
    const document: DocumentJson = documentOf({ pages: [page('p', 'Home', 'index.html', [node('A', 'paragraph', 'p', { text: 'a' }), node('B', 'paragraph', 'p', { text: 'b' })])] });
    const wrapped = runHandler(wrapRowCommand, document, {}, { selection: ['A', 'B'] });
    expect(wrapped.outcome.kind).toBe('change');
    const row = wrapped.document.pages[0]?.tree.children[0];
    expect(Object.keys(row?.children[0]?.styles.desktop?.base ?? {})).not.toEqual([]);
    const unwrapped = runHandler(unwrapCommand, documentOf(wrapped.document), {}, { selection: [row?.id ?? ''] });
    const children = unwrapped.document.pages[0]?.tree.children ?? [];
    expect(children.map((c) => c.name)).toEqual(['A', 'B']);
    expect(children.map((c) => c.styles)).toEqual([{}, {}]);
  });
});

describe('the clipboard (B-05)', () => {
  const clipboardOf = (document: DocumentJson, selection: string[]) => {
    const copied = runHandler(copyCommand, document, {}, { selection });
    if (copied.outcome.kind !== 'change' || copied.outcome.clipboard === undefined) throw new Error('nothing copied');
    return { status: 'read' as const, html: null, text: copied.outcome.clipboard.text ?? null };
  };

  it('a pasted label points at the pasted control, and a pasted HTML id is not a second one', () => {
    const form = node('Form', 'section', 'section', { children: [node('Email', 'input', 'input', { attributes: { id: 'email' } }), node('Label', 'label', 'label', { attributes: { labelFor: 'Email' } })] });
    const document = documentOf({ pages: [page('p', 'Home', 'index.html', [form])] });
    const clipboard = clipboardOf(document, ['Form']);
    const ran = runHandler(pasteCommand, document, { clipboard }, { selection: ['Form'] });
    expect(ran.problems).toEqual([]);
    const pasted = ran.document.pages[0]?.tree.children[0]?.children[2];
    expect(pasted?.children[1]?.attributes.labelFor).toBe(pasted?.children[0]?.id);
    expect(pasted?.children[0]?.attributes.id).toBe('email-copy');
  });

  it('a cut and pasted label whose control stayed behind still points at it; one whose control went is released', () => {
    const control = node('Email', 'input', 'input', { attributes: { id: 'email' } });
    const label = node('Label', 'label', 'label', { attributes: { labelFor: 'Email' } });
    const document = documentOf({ pages: [page('p', 'Home', 'index.html', [control, label, node('Box', 'section', 'section')])] });
    const clipboard = clipboardOf(document, ['Label']);
    const cutAway = documentOf({ pages: [page('p', 'Home', 'index.html', [node('Box', 'section', 'section')])] });
    const released = runHandler(pasteCommand, cutAway, { clipboard }, { selection: ['Box'] });
    expect(released.problems).toEqual([]);
    expect(released.document.pages[0]?.tree.children[0]?.children[0]?.attributes.labelFor).toBeUndefined();
    const kept = runHandler(pasteCommand, document, { clipboard }, { selection: ['Box'] });
    expect(kept.problems).toEqual([]);
    expect(kept.document.pages[0]?.tree.children[2]?.children[0]?.attributes.labelFor).toBe('Email');
  });
});

describe('a field left by a press on another element (E-02)', () => {
  it('writes the value to the elements it was typed for, not to what the press selected', () => {
    const document = documentOf({ pages: [page('p', 'Home', 'index.html', [node('A', 'section', 'section'), node('B', 'section', 'section')])] });
    const ran = runHandler(setStyleCommand, document, { property: 'width', value: '200px', targets: ['A'] }, { selection: ['B'] });
    expect(ran.document.pages[0]?.tree.children[0]?.styles.desktop?.base?.width).toBe('200px');
    expect(ran.document.pages[0]?.tree.children[1]?.styles).toEqual({});
    // elements that left the document take nothing, and nothing else is written
    const gone = runHandler(setStyleCommand, document, { property: 'width', value: '200px', targets: ['Z'] }, { selection: ['B'] });
    expect(gone.document).toBe(document);
  });
});

describe('a grid item’s start and span (S-012)', () => {
  it('writing one half keeps the other', () => {
    const item = node('Item', 'section', 'section', { styles: { desktop: { base: { 'grid-column-start': '1', 'grid-column-end': 'span 2' } } } });
    const document = documentOf({ pages: [page('p', 'Home', 'index.html', [item])] });
    const moved = runHandler(setGridItemCommand, document, { property: 'grid-column', start: 2 }, { selection: ['Item'] });
    expect(storedPlace(moved.document.pages[0]?.tree.children[0] as ReturnType<typeof node>, 'grid-column', RULES)).toEqual({ start: 2, span: 2 });
    const widened = runHandler(setGridItemCommand, document, { property: 'grid-column', span: 3 }, { selection: ['Item'] });
    expect(storedPlace(widened.document.pages[0]?.tree.children[0] as ReturnType<typeof node>, 'grid-column', RULES)).toEqual({ start: 1, span: 3 });
  });
});

describe('the opacity field (S-020)', () => {
  // STYLE-11: a bare number is a percentage on every scale, as the field's face reads it ("1" is 1%, never 100%)
  it('takes the percentage it shows, a bare number included', () => {
    const document = documentOf({ pages: [page('p', 'Home', 'index.html', [node('Box', 'section', 'section')])] });
    for (const [typed, stored] of [['40', '0.4'], ['40%', '0.4'], ['1', '0.01'], ['2', '0.02'], ['0.5', '0.005'], ['100', '1']] as const) {
      const ran = runHandler(setStyleCommand, document, { property: 'opacity', value: typed }, { selection: ['Box'] });
      expect(ran.document.pages[0]?.tree.children[0]?.styles.desktop?.base?.opacity, typed).toBe(stored);
    }
    expect(runHandler(setStyleCommand, document, { property: 'opacity', value: '140' }, { selection: ['Box'] }).outcome.kind).toBe('refused');
  });
});


describe('a door that names its element reads that element’s lock (M-02)', () => {
  it('custom declarations of a locked element are not available, whatever is selected', () => {
    const document = documentOf({ pages: [page('p', 'Home', 'index.html', [node('Locked', 'section', 'section', { locked: true }), node('Free', 'section', 'section')])] });
    const state = { document, selection: ['Free'], history: { past: [], future: [] }, message: null, ui: undefined } as never;
    expect(editableSelection.test(state, RULES, { target: 'Locked' })).toBe(false);
    expect(editableSelection.test(state, RULES, { target: 'Free' })).toBe(true);
    expect(editableSelection.test(state, RULES)).toBe(true);
  });
});
