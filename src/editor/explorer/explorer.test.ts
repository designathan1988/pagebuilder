import { describe, expect, it } from 'vitest';
import { createEditorStore, MODEL_RULES } from '../store.ts';
import { manualClock } from '../../core/ports/clock.ts';
import { sequentialIds } from '../../core/ports/ids.ts';
import fs from 'node:fs';
import { siteDocument, siteEntries, siteFiles, siteScriptsWritten } from '../../core/export/export.ts';
import { filesOf, type DocumentJson } from '../../core/document/model.ts';
import { siteScripts } from '../forms/script.ts';
import { paneText } from '../code-panel/code-panel.ts';
import { fileRows, treeRows } from './explorer.ts';

const store = () => createEditorStore({ ids: sequentialIds('explorer'), clock: manualClock(Date.UTC(2026, 9, 2)), ports: { readOnly: () => false } });

// spec explorer-file-system: the tree lists css/styles.css, and js/interactions.js when the project has interactions
describe('the Explorer tree lists what the export writes', () => {
  it('lists the generated stylesheet in its folder, and no script while the project has nothing for one', () => {
    const rows = treeRows(store().getState().document, MODEL_RULES);
    const css = rows.findIndex((row) => row.path === 'css' && row.folder);
    const sheet = rows.find((row) => row.path === 'css/styles.css');
    expect(sheet).toMatchObject({ folder: false, depth: 1, kind: 'css', generated: true, page: null });
    expect(rows.indexOf(sheet as NonNullable<typeof sheet>)).toBe(css + 1);
    expect(rows.some((row) => row.path.startsWith('js/') && !row.folder)).toBe(false);
  });

  it('lists the interactions script once the project has interactions, with the text the export writes', () => {
    const one = store();
    expect(one.dispatch('element.insert', { entry: 'button' }).status).toBe('done');
    expect(one.dispatch('interactions.add', { trigger: 'click', action: 'open-link', options: { address: 'https://example.com' } }).status).toBe('done');
    const document = one.getState().document;
    const script = treeRows(document, MODEL_RULES).find((row) => row.path === 'js/interactions.js');
    expect(script).toMatchObject({ folder: false, depth: 1, kind: 'js', generated: true });
    expect(fileRows(document, MODEL_RULES).some((row) => row.path === 'js/interactions.js' && row.generated)).toBe(true);
    const written = siteFiles(document, MODEL_RULES, true, siteScripts).interactions;
    expect(written).not.toBeNull();
    expect(paneText('js/interactions.js', document, MODEL_RULES)).toBe(written);
  });
});

// The rows learn which scripts the site writes without writing the site (the audit's AUD-36: every undo wrote the whole
// export just to list them): on every fixture the scripts listed are exactly those siteFiles writes.
describe('the generated scripts listed', () => {
  const fixtures = fs.readdirSync('manifest/features/fixtures').filter((name) => name.endsWith('.json'));
  it.each(fixtures)('are the scripts the export writes, on %s', (name) => {
    const document = JSON.parse(fs.readFileSync(`manifest/features/fixtures/${name}`, 'utf8')) as DocumentJson;
    const site = siteFiles(siteDocument(document, MODEL_RULES, true), MODEL_RULES, true, siteScripts);
    const written = (['interactions', 'forms', 'motion', 'lottie', 'widgets', 'lists', 'app'] as const).filter((part) => site[part] !== null);
    expect([...siteScriptsWritten(document, MODEL_RULES)].sort()).toEqual([...written].sort());
  });

  // the generated rows are the archive's files, the project's stored files apart, in its order (siteFilesWritten)
  it.each(fixtures)('are exactly the files the archive writes, on %s', (name) => {
    const document = JSON.parse(fs.readFileSync(`manifest/features/fixtures/${name}`, 'utf8')) as DocumentJson;
    const stored = new Set(filesOf(document).map((file) => file.path));
    const archive = siteEntries(document, MODEL_RULES, siteScripts).map((entry) => entry.path).filter((path) => !stored.has(path));
    expect(fileRows(document, MODEL_RULES).filter((row) => row.generated).map((row) => row.path)).toEqual(archive);
    const tree = treeRows(document, MODEL_RULES);
    expect(tree.filter((row) => !row.folder && row.generated).map((row) => row.path).sort()).toEqual([...archive].sort());
    // every folder row holds a row (a stored empty folder apart)
    const storedFolders = new Set(document.folders ?? []);
    for (const folder of tree.filter((row) => row.folder)) expect(storedFolders.has(folder.path) || tree.some((row) => !row.folder && row.path.startsWith(`${folder.path}/`))).toBe(true);
  });
});

describe('a template page in the Explorer', () => {
  const blog = (): DocumentJson => JSON.parse(fs.readFileSync('manifest/features/fixtures/content-blog.json', 'utf8')) as DocumentJson;
  it('lists each item page under the collection folder, never the template file, and no empty application folder', () => {
    const document = blog();
    const tree = treeRows(document, MODEL_RULES);
    expect(tree.some((row) => row.path === 'post.html')).toBe(false);
    const posts = tree.filter((row) => !row.folder && row.path.startsWith('posts/'));
    expect(posts.length).toBeGreaterThan(0);
    for (const row of posts) expect(row).toMatchObject({ kind: 'html', generated: true, page: null, depth: 1 });
    expect(tree.some((row) => row.folder && row.path === 'posts')).toBe(true);
    expect(tree.some((row) => row.path === 'js/app-layer' || row.path.startsWith('js/app-layer/'))).toBe(false);
  });

  it('opens an item page with the html the archive writes for it', () => {
    const document = blog();
    const path = fileRows(document, MODEL_RULES).find((row) => row.path.startsWith('posts/'))?.path ?? '';
    const written = new TextDecoder().decode(siteEntries(document, MODEL_RULES, siteScripts).find((entry) => entry.path === path)?.bytes);
    expect(paneText(path, document, MODEL_RULES)).toBe(written);
  });
});
