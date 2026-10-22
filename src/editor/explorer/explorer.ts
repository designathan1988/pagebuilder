// The Explorer's files (the manifest's explorer-file-system and code-panel-view):
// the rows the Files section lists — what the document generates (one .html per page, the stylesheet
// css/styles.css, and each script the export writes for what the project holds: js/interactions.js once it has
// interactions, js/forms.js, js/motion.js,
// js/lottie.min.js, js/widgets.js, js/lists.js while a list is paged, and the application's files under
// js/app-layer/) and the files the project holds
// (document.files) — and the door that opens one in the code pane. One owner: the row list, the row's kind, and
// files.open. Folders, renaming, moving and deleting are explorer-file-system's own work (not built yet).
import { message, registerHandler } from '../../core/commands/registry.ts';
import type { DocumentJson, Page, ProjectFile } from '../../core/document/model.ts';
import { byteCount, fileAt, folderOf } from '../../core/files/files.ts';
import { filesOf } from '../../core/document/model.ts';
import { FORMS_SCRIPT, INTERACTIONS_SCRIPT, LISTS_SCRIPT, LOTTIE_SCRIPT, MOTION_SCRIPT, STYLESHEET, WIDGETS_SCRIPT, capturedSnapshotText, siteDocument, siteFiles, siteFilesWritten, type WrittenFile } from '../../core/export/export.ts';
import { APP_MAIN_SCRIPT, APP_RUNTIME_SCRIPT, APP_START_SCRIPT } from '../../core/export/paths.ts';
import { siteScripts } from '../forms/script.ts';
import type { ModelRules } from '../../core/document/validate.ts';
import type { EditorUi } from '../state.ts';
import type { useT } from '../text.ts';
import { editorView } from '../view/editor-view.ts';
import { isFileShown, openedFile } from './file-tabs.ts';

// what a row is, by its path: the badge a row shows and the syntax the pane colours it with
export type FileKind = 'html' | 'css' | 'js' | 'image' | 'font' | 'other';

export interface FileRow {
  readonly path: string;
  readonly kind: FileKind;
  // generated from the document (a page's html, the stylesheet, the interactions): its text is never stored, and its
  // path is fixed — the export writes it there
  readonly generated: boolean;
  // the file's size in bytes, or null for a generated one (its size is what it renders to now)
  readonly size: number | null;
}

const EXTENSIONS: Readonly<Record<string, FileKind>> = {
  html: 'html', htm: 'html', css: 'css', js: 'js', mjs: 'js',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', avif: 'image', svg: 'image', ico: 'image',
  woff: 'font', woff2: 'font', ttf: 'font', otf: 'font', eot: 'font',
};

export function kindOf(path: string, type = ''): FileKind {
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('font/') || /font/.test(type)) return 'font';
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return EXTENSIONS[ext] ?? 'other';
}

// The scripts the export writes beside the pages and the stylesheet, by what the project holds now: the export's own
// answer (siteFiles, the one writer of the site), each with the text it writes, so the Explorer lists the file, the
// code pane shows that text and the archive holds it, never one without the others.
const SCRIPTS = [
  [INTERACTIONS_SCRIPT, 'interactions'],
  [FORMS_SCRIPT, 'forms'],
  [MOTION_SCRIPT, 'motion'],
  [LOTTIE_SCRIPT, 'lottie'],
  [WIDGETS_SCRIPT, 'widgets'],
  [LISTS_SCRIPT, 'lists'],
] as const;
// the paths the export may write a script at
const SCRIPT_PATHS: readonly string[] = SCRIPTS.map(([path]) => path);

// Whether the path is one the document generates (a page's file, the stylesheet, a script the export may write and no
// stored file holds, any file the export writes now — an item's page, a captured page's snapshot): its text is
// rendered now, and its path is fixed — the export writes it there.
export function isGenerated(path: string, document: DocumentJson, rules: ModelRules): boolean {
  return document.pages.some((page) => page.file === path) || path === STYLESHEET || (SCRIPT_PATHS.includes(path) && fileAt(document, path) === null) || siteFilesWritten(document, rules).some((one) => one.path === path);
}
// The text of a file the export writes from a page of the document at a path no page holds: an item's page (the site
// as the archive writes it, lists.ts siteDocument) and a captured page's snapshot. Null for any other path.
export function writtenPageText(path: string, document: DocumentJson, rules: ModelRules): string | null {
  const written = siteFilesWritten(document, rules).find((one) => one.path === path);
  if (written === undefined) return null;
  if (written.part === 'page' && written.item) return siteFiles(siteDocument(document, rules, true), rules, true, siteScripts).pages.find((one) => one.file === path)?.html ?? null;
  const page = written.part === 'snapshot' ? document.pages.find((one) => one.id === written.page) : undefined;
  return page === undefined ? null : capturedSnapshotText(document, page);
}
export function generatedScripts(document: DocumentJson, rules: ModelRules): readonly { readonly path: string; readonly text: string }[] {
  // the site as the archive writes it (export.ts siteEntries): its paged lists are only paged there
  const site = siteFiles(siteDocument(document, rules, true), rules, true, siteScripts);
  const scripts = SCRIPTS.flatMap(([path, part]) => {
    const text = site[part];
    return text === null ? [] : [{ path, text }];
  });
  // the application: its start script, its main script, the runtime and each module, as the archive holds them
  const app = site.app === null ? [] : [
    { path: APP_START_SCRIPT, text: site.app.start },
    { path: APP_MAIN_SCRIPT, text: site.app.main },
    { path: APP_RUNTIME_SCRIPT, text: site.app.runtime },
    ...site.app.modules.map((one) => ({ path: one.path, text: one.code })),
  ];
  return [...scripts, ...app];
}

// The Files section's rows, in the order it lists them: the files the export writes from the document (export.ts
// siteFilesWritten, its one list: each page's file in the pages' order, a template's items' pages in its place, the
// stylesheet, a captured page's snapshot, the scripts) and then the project's own files, each as it was uploaded.
export function fileRows(document: DocumentJson, rules: ModelRules): readonly FileRow[] {
  const generated: FileRow[] = siteFilesWritten(document, rules).map((one) => ({ path: one.path, kind: kindOf(one.path), generated: true, size: null }));
  const owned: FileRow[] = filesOf(document).map((file: ProjectFile) => ({ path: file.path, kind: kindOf(file.path, file.type), generated: false, size: byteCount(file.bytes) }));
  return [...generated, ...owned];
}

// The Explorer's tree, in the order it lists it: every folder at its path (a stored empty one too), and under it the
// files, the pages' files and the generated stylesheet and scripts that stand in it, one level deeper (spec
// explorer-file-system: css/styles.css and js/interactions.js are listed; the stylesheet's folder showed empty). A
// page's file is a row like any other (clicking it opens the page's markup in the code pane), and it says which page
// it is.
export interface TreeRow {
  readonly path: string;
  // the folder's own row, or a file's
  readonly folder: boolean;
  readonly depth: number;
  readonly kind: FileKind;
  readonly generated: boolean;
  readonly page: string | null;
  readonly size: number | null;
}

// a path's folders, the root apart; with `withSelf`, the path itself is one too (a stored folder)
function ancestors(path: string, withSelf: boolean): readonly string[] {
  const parts = path.split('/').filter((one) => one !== '');
  return parts.slice(0, withSelf ? parts.length : parts.length - 1).map((_, i) => parts.slice(0, i + 1).join('/'));
}

export function treeRows(document: DocumentJson, rules: ModelRules): readonly TreeRow[] {
  const rows: TreeRow[] = [];
  // what the export writes (export.ts siteFilesWritten): a page's own file is that page's row; an item's page, the
  // stylesheet, a snapshot and a script are rows of no stored file and no page. A template page writes no file of its
  // own, so its address is no row.
  const pageOf = (one: WrittenFile): Page | null => (one.part === 'page' && !one.item ? document.pages.find((page) => page.id === one.page && page.file === one.path) ?? null : null);
  const made = siteFilesWritten(document, rules).map((one) => ({ path: one.path, file: null as ProjectFile | null, page: pageOf(one) }));
  const entries = [...filesOf(document).map((file) => ({ path: file.path, file, page: null as Page | null })), ...made];
  // the folders: every stored one (an empty one too) and every folder a listed file stands in — never a folder the
  // export would write into while it writes nothing there (js/app-layer with no application)
  const folders = [...new Set([...(document.folders ?? []).flatMap((folder) => ancestors(folder, true)), ...entries.flatMap((one) => ancestors(one.path, false))])];
  const under = (folder: string): readonly string[] => folders.filter((one) => folderOf(one) === folder).sort();
  const filesIn = (folder: string): readonly { readonly path: string; readonly file: ProjectFile | null; readonly page: Page | null }[] =>
    entries
      .filter((one) => folderOf(one.path) === folder)
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const fileRow = (one: ReturnType<typeof filesIn>[number], depth: number): void => {
    rows.push({
      path: one.path,
      folder: false,
      depth,
      kind: kindOf(one.path, one.file?.type ?? ''),
      // a row of no stored file is one the export writes; a stored file at a page's address is one too
      generated: one.file === null || document.pages.some((page) => page.file === one.path),
      page: one.page?.id ?? null,
      size: one.file === null ? null : byteCount(one.file.bytes),
    });
  };
  // in each folder the site's pages first, in the project's order (design/final's Explorer: index.html, planos.html,
  // sobre.html above css/, img/, js/), then its folders, then its other files
  const walk = (folder: string, depth: number): void => {
    const files = filesIn(folder);
    for (const page of document.pages) {
      const one = files.find((candidate) => candidate.page === page);
      if (one !== undefined) fileRow(one, depth);
    }
    for (const child of under(folder)) {
      rows.push({ path: child, folder: true, depth, kind: 'other', generated: false, page: null, size: null });
      walk(child, depth + 1);
    }
    for (const one of files) if (one.page === null) fileRow(one, depth);
  };
  walk('', 0);
  return rows;
}

// files.open (the Explorer's file rows and the code files' tabs): the file shows in the code pane, and the centre
// column shows it — the canvas when the column shows both (split), the code pane otherwise (: a code
// file tab shows the file in the Code view).
export const openFile = registerHandler<'files.open', EditorUi>(
  'files.open',
  ({ state, rules }, { path }) => {
    if (typeof path !== 'string' || path === '') throw new Error('files.open: a door hands the path of the file it opens');
    if (fileRows(state.document, rules).every((row) => row.path !== path)) return { kind: 'refused', message: message('status.files.missing', { path }) };
    const ui = openedFile(state.ui, path);
    return { kind: 'change', ui: editorView(state.ui) === 'split' ? ui : { ...ui, editorView: 'code' }, message: message('status.files.opened', { path }) };
  },
  (state, { path }) => typeof path === 'string' && isFileShown(state.ui, path),
);

// files.startRename (the Explorer's row, a double-click on its name — the Layers row's own pattern): which row is
// renamed, in the editor's state, never in the document. The field that takes the name is files.rename's
// (shell/sidebar/explorer.tsx draws it in the name's place while this names the row).
export const startRenameFile = registerHandler<'files.startRename', EditorUi>(
  'files.startRename',
  ({ state }, { path }) => {
    if (typeof path !== 'string') throw new Error('files.startRename: a door hands the path of the row it renames');
    // an empty path is the end of a rename (the field kept its name): no row is renamed any more
    return { kind: 'change', ui: { ...state.ui, renamingFile: path === '' ? undefined : path } };
  },
  (state, { path }) => state.ui.renamingFile === path,
);

// What stands for a page's file beside its name (the page menu, the page tabs, the Explorer): its file, or, for a
// collection's template, "template" with the collection in its tooltip. The export never writes a template at its
// own file (about.html): the menu and the tabs named a file the site never had, while the Explorer said "template".
export function pageFileLabel(page: Page, t: ReturnType<typeof useT>): { readonly text: string; readonly title: string } {
  const item = page.tree.dataItem;
  if (item?.template !== true) return { text: page.file, title: page.file };
  return { text: t('explorer.pageTemplate'), title: t('explorer.pageTemplateOf', { collection: item.collection }) };
}
