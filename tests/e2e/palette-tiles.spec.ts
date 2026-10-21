// The Insert tiles follow the feature of their palette entry (elements.json palette[].entries[].feature): a tile is
// usable exactly when its entry's feature is registered as built, and every entry's feature is built now, so every tile
// is usable; the tiles of palette-click-insert (Container, Section, Heading, Paragraph) insert, by a click, Enter or
// Space. A door of a feature still to come is proven unusable by the census and by waiting-panels (View › Timeline).
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { isFeatureBuilt } from '../../src/app/features.ts';
import type { FeatureId } from '../../src/generated/ids.ts';
import { control, runDoor, runs } from './door.ts';

const INSERT_PANEL = 'workspace.setPanelOpen#toolbar-activity-bar-insert';
const TILE = 'element.insert#elements-tile';
const ENTER = 'element.insert#key-enter-in-palette';
const SPACE = 'element.insert#key-space-in-palette';
interface Entry {
  readonly id: string;
  readonly feature: string;
}
const ENTRIES = (JSON.parse(fs.readFileSync('manifest/elements.json', 'utf8')) as { palette: { entries: Entry[] }[] }).palette.flatMap((g) => g.entries);
const OWN = ENTRIES.filter((e) => e.feature === 'palette-click-insert').map((e) => e.id);
// the entries of a feature not built yet: none, since every palette entry's feature is built
const LATER = ENTRIES.filter((e) => !isFeatureBuilt(e.feature as FeatureId)).map((e) => e.id);

const documentOf = (page: Page) =>
  page.evaluate(() => {
    const p = (window as unknown as Record<string, { document: () => unknown; history: () => unknown }>).__builderTestPort;
    if (!p) throw new Error('the test port is missing');
    return { document: p.document(), history: p.history() };
  });

// the keyboard focus on a tile, as a person moves it: Tab to the tile's group (its tiles are one Tab stop), then the
// arrows within it
async function tabTo(page: Page, entry: string) {
  const tile = control(page, TILE, { args: { entry } });
  const focused = () => tile.evaluate((el) => el === document.activeElement);
  const inGroup = () => tile.evaluate((el) => el.parentElement?.contains(document.activeElement) === true);
  for (let i = 0; i < 200 && !(await inGroup()); i += 1) await page.keyboard.press('Tab');
  for (let i = 0; i < 200 && (await inGroup()) && !(await focused()); i += 1) await page.keyboard.press('ArrowRight');
  expect(await focused(), `Tab reaches the tile of ${entry}`).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await expect(page.locator('.workbench')).toBeVisible();
});

test('every tile is usable, and the tiles of palette-click-insert insert by a click, Enter and Space', runs(INSERT_PANEL, TILE, ENTER, SPACE), async ({ page }) => {
  expect(OWN.sort()).toEqual(['container', 'heading', 'paragraph', 'section']);
  expect(LATER).toEqual([]);
  await runDoor(page, INSERT_PANEL);
  // the Insert panel's tiles (the start card of the empty page draws some of the same entries)
  for (const entry of ENTRIES.map((e) => e.id)) await expect(page.locator('[data-region="insert"]').locator(control(page, TILE, { args: { entry } })), entry).not.toHaveAttribute('aria-disabled', 'true');

  // Enter and Space on an available tile insert its entry, once each (Tab from the panel's search field, above every
  // tile)
  await page.locator('[data-region="insert"] [data-local="search"]').click();
  await tabTo(page, 'paragraph');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  const after = (await documentOf(page)) as { document: { pages: { tree: { children: { name: string; type: string }[] } }[] }; history: unknown };
  expect(after.document.pages[0]?.tree.children.map((c) => `${c.type} ${c.name}`)).toEqual(['paragraph Paragraph', 'paragraph Paragraph 2']);
  expect(after.history).toEqual({ undoSteps: 2, redoSteps: 0 });

  // a click on an available tile inserts its entry after the selected element
  await control(page, TILE, { args: { entry: 'heading' } }).click();
  const clicked = (await documentOf(page)) as typeof after;
  expect(clicked.document.pages[0]?.tree.children.map((c) => `${c.type} ${c.name}`)).toEqual(['paragraph Paragraph', 'paragraph Paragraph 2', 'heading Heading']);
  expect(clicked.history).toEqual({ undoSteps: 3, redoSteps: 0 });
});

// The feature table (src/app/features.ts) decides every tile: a tile is enabled exactly when its entry's feature is
// registered as built, and each says so: no tile says "not available yet".
test('every tile is enabled exactly when its entry\'s feature is registered as built', runs(INSERT_PANEL, TILE), async ({ page }) => {
  await runDoor(page, INSERT_PANEL);
  const drawn = await page.locator(`[data-region="insert"] [data-door="${TILE}"]`).evaluateAll((els) => els.map((el) => [JSON.parse(el.getAttribute('data-args') ?? '{}').entry as string, el.getAttribute('aria-disabled') !== 'true'] as const));
  expect(drawn.map(([entry]) => entry).sort()).toEqual(ENTRIES.map((e) => e.id).sort());
  const expected = ENTRIES.map((e) => [e.id, isFeatureBuilt(e.feature as FeatureId)] as const);
  expect(new Map(drawn)).toEqual(new Map(expected));
  const titles = await page.locator(`[data-region="insert"] [data-door="${TILE}"]`).evaluateAll((els) => els.map((el) => el.getAttribute('title') ?? ''));
  expect(titles.filter((title) => title.includes('not available yet'))).toEqual([]);
});
