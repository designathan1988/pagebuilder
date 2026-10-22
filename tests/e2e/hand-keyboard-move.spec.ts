// hand-keyboard-move beyond its scenarios: what the canvas draws while the
// keyboard's hand holds an element (the drop indicator a mouse drag draws, at the aim: the insertion line across the
// receiver, the receiver's outline, the drop label, the held element dashed and unlabelled; nothing once the hand
// drops); what the status bar says after every key (the receiver, the position and the level) and Enter into a
// nested container, one undo step; an aim the move refuses (announced with its refusal, drawn refused, Enter there
// changes nothing and the hand still holds); Arrange › Move with the keyboard; a hidden element refused; and a new
// selection ends the hand, so the arrows walk the tree again. The document, the selection and the history are read
// through the read-only test port; the drawing is measured against the elements' boxes inside the frame, mapped to
// the screen through its CSS zoom.
import fs from 'node:fs';
import { expect, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { runDoor, runs } from './door.ts';

const FIXTURE = 'manifest/features/fixtures/aurora.json';
const FIXTURE_DOCUMENT = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as unknown;
const OPEN = 'project.open#menu-file';
const SELECT = 'selection.select#canvas-click-element-or-page';
const ROW = 'selection.select#layers-row';
const EYE = 'element.toggleHidden#layers-row-eye';
const TAKE = 'hand.take#key-m-in-canvas';
const TAKE_MENU = 'hand.take#menu-arrange';
const TAKE_CONTEXT = 'hand.take#context-menu';
const ROW_MENU = 'contextMenu.open#layers-row-secondary-click';
const NEXT = 'hand.aimNext#key-arrow-down-in-hand';
const PREVIOUS = 'hand.aimPrevious#key-shift-arrow-down-in-hand';
const CLIMB = 'hand.climb#key-arrow-up-in-hand';
const DESCEND = 'hand.descend#key-arrow-left-in-hand';
const PLACE = 'element.moveTo#key-enter-in-hand';
const DROP = 'hand.drop#key-escape-in-hand';
const WALK_NEXT = 'selection.walkNextSibling#key-arrow-right-in-canvas';
const UNDO = 'history.undo#key-ctrl-z-in-global';

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
interface Tree {
  readonly id: string;
  readonly children: readonly Tree[];
}
interface Port {
  readonly document: { pages: { tree: Tree }[] };
  readonly selection: string[];
  readonly undoSteps: number;
}

const port = (page: Page): Promise<Port> =>
  page.evaluate(() => {
    const p = (window as unknown as Record<string, { document: () => unknown; selection: () => string[]; history: () => { undoSteps: number } }>).__builderTestPort;
    if (!p) throw new Error('the test port is missing');
    return { document: p.document() as Port['document'], selection: p.selection(), undoSteps: p.history().undoSteps };
  });
// the ids of a node's children in the document the port reads
async function childrenOf(page: Page, id: string): Promise<string[]> {
  const find = (n: Tree): Tree | undefined => (n.id === id ? n : n.children.map(find).find((x) => x !== undefined));
  const tree = (await port(page)).document.pages[0]?.tree;
  return (tree === undefined ? undefined : find(tree))?.children.map((c) => c.id) ?? [];
}

// the screen box of a node's element, through the frame's CSS zoom
function screenBox(page: Page, id: string): Promise<Box> {
  return page.evaluate((node) => {
    const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
    const doc = iframe?.contentDocument;
    if (!iframe || !doc) throw new Error('the canvas has no page');
    const zoom = iframe.currentCSSZoom;
    const frame = iframe.getBoundingClientRect();
    const el = doc.querySelector(`[data-node="${node}"]`);
    if (!el) throw new Error(`the canvas does not draw ${node}`);
    const r = el.getBoundingClientRect();
    return { x: frame.left + r.left * zoom, y: frame.top + r.top * zoom, width: r.width * zoom, height: r.height * zoom };
  }, id);
}

// a click on the canvas at the centre of a node's element (a leaf: the click hits the node itself)
async function clickNode(page: Page, id: string) {
  const b = await screenBox(page, id);
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}

// the box of the one element a selector finds, or null when it finds none or several, read in one task of the page:
// counting first and then asking the box raced the chrome's next frame, whose removed element left the read waiting
async function boxOf(page: Page, selector: string): Promise<Box | null> {
  const boxes = await page.locator(selector).evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  );
  return boxes.length === 1 ? (boxes[0] ?? null) : null;
}
const close = (a: number, b: number) => Math.abs(a - b) <= 1;
const status = (page: Page) => page.getByRole('status');
const drop = (page: Page) => page.locator('[data-chrome="drop"]');
const dropLabel = (page: Page) => page.locator('[data-chrome="drop-label"]');

// the insertion line lies at y, across the box given
async function lineAt(page: Page, y: number, across: Box, what: string) {
  await expect
    .poll(
      async () => {
        const line = await boxOf(page, '[data-chrome="drop-line"]');
        return line !== null && close(line.y + line.height / 2, y) && close(line.x, across.x) && close(line.width, across.width);
      },
      { message: `the line lies ${what}` },
    )
    .toBe(true);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await expect(page.locator('.workbench')).toBeVisible();
  // File › Open with the browser's file chooser, as a person opens a project
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, OPEN);
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync(FIXTURE) });
  await expect(page.frameLocator('.frame__page').locator('[data-node="n-card-a-title"]')).toHaveCount(1);
});

test('the canvas draws the aim as a mouse drag draws its drop: the line where the element would land, the receiver outlined, the label naming it, the held element dashed and unlabelled; nothing once the hand drops', runs(OPEN, SELECT, TAKE, NEXT, CLIMB, DROP), async ({ page }) => {
  const hero = await screenBox(page, 'n-hero');
  const intro = await screenBox(page, 'n-intro');
  const actions = await screenBox(page, 'n-actions');
  const plans = await screenBox(page, 'n-plans');
  await clickNode(page, 'n-title');

  // M: aimed at its own place, before Intro (no sibling but itself before it), so at the top of Intro
  await runDoor(page, TAKE);
  await lineAt(page, intro.y, hero, 'at the top of Intro, across Hero');
  await expect(dropLabel(page)).toHaveText('Before Intro · Page › Hero');
  await expect.poll(async () => {
    const receiver = await boxOf(page, '[data-chrome="drop-receiver"]');
    return receiver !== null && [receiver.x - hero.x, receiver.y - hero.y, receiver.width - hero.width, receiver.height - hero.height].every((d) => Math.abs(d) <= 1);
  }, { message: 'Hero is outlined as the receiver' }).toBe(true);
  await expect(page.locator('[data-chrome="drop-receiver"]')).toHaveAttribute('data-state', 'between');
  // the held element: no outline, and its name label hidden
  expect(await page.locator('[data-chrome="selection"]').evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
  expect(await page.locator('[data-chrome="label"]').evaluate((el) => getComputedStyle(el).visibility)).toBe('hidden');

  // ArrowDown: the next slot, in the gap between Intro and Actions
  await runDoor(page, NEXT);
  await lineAt(page, (intro.y + intro.height + actions.y) / 2, hero, 'between Intro and Actions, across Hero');
  await expect(dropLabel(page)).toHaveText('Between Intro and Actions · Page › Hero');

  // ArrowUp: one level out, right after Hero in the page, so in the gap between Hero and Plans
  await runDoor(page, CLIMB);
  await expect(dropLabel(page)).toHaveText('Between Hero and Plans · Page');
  await expect.poll(async () => {
    const line = await boxOf(page, '[data-chrome="drop-line"]');
    return line !== null && close(line.y + line.height / 2, (hero.y + hero.height + plans.y) / 2);
  }, { message: 'the line lies between Hero and Plans' }).toBe(true);

  // Escape: the indicator is gone, the outline is solid again, and nothing changed
  await runDoor(page, DROP);
  await expect(drop(page)).toHaveCount(0);
  await expect(status(page)).toHaveText('Move cancelled. Nothing changed.');
  expect(await page.locator('[data-chrome="selection"]').evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
  expect(await port(page)).toEqual({ document: FIXTURE_DOCUMENT, selection: ['n-title'], undoSteps: 0 });
});

test('the status bar names the receiver, the position and the level after every key; Enter places the element inside a nested container, one undo step', runs(OPEN, SELECT, TAKE, NEXT, PREVIOUS, CLIMB, DESCEND, PLACE, UNDO), async ({ page }) => {
  await clickNode(page, 'n-title');
  await runDoor(page, TAKE);
  await expect(status(page)).toHaveText('Moving Title. Arrows aim, Enter places, Esc cancels.');
  await runDoor(page, NEXT);
  await expect(status(page)).toHaveText('Hero will receive. Position 2 of 3. Level 1 of 2.');
  await runDoor(page, CLIMB);
  await expect(status(page)).toHaveText('Page will receive. Position 2 of 4. Level 2 of 2.');
  await runDoor(page, DESCEND);
  await expect(status(page)).toHaveText('Hero will receive. Position 2 of 3. Level 1 of 2.');
  await runDoor(page, PREVIOUS);
  await expect(status(page)).toHaveText('Hero will receive. Position 1 of 3. Level 1 of 2.');
  // down past Intro's gap, into Actions, the empty container after it
  await runDoor(page, NEXT);
  await runDoor(page, NEXT);
  await expect(status(page)).toHaveText('Actions will receive. Position 1 of 1. Level 1 of 3.');
  // no key but Enter changed the document or the history
  expect(await port(page)).toEqual({ document: FIXTURE_DOCUMENT, selection: ['n-title'], undoSteps: 0 });

  await runDoor(page, PLACE);
  await expect.poll(() => childrenOf(page, 'n-actions')).toEqual(['n-title']);
  expect(await childrenOf(page, 'n-hero')).toEqual(['n-intro', 'n-actions']);
  expect(await port(page)).toMatchObject({ selection: ['n-title'], undoSteps: 1 });
  await expect(status(page)).toHaveText('Moved Title into Actions, position 1 of 1.');
  // the page draws it inside Actions
  const [title, actions] = [await screenBox(page, 'n-title'), await screenBox(page, 'n-actions')];
  expect(title.y >= actions.y && title.y + title.height <= actions.y + actions.height + 1, 'Title is drawn inside Actions').toBe(true);
  // the hand let go: nothing is aimed any more
  await expect(drop(page)).toHaveCount(0);

  await runDoor(page, UNDO);
  await expect.poll(async () => (await port(page)).document).toEqual(FIXTURE_DOCUMENT);
  expect(await port(page)).toMatchObject({ selection: ['n-title'], undoSteps: 0 });
});

test('an aim the move refuses is announced with its refusal and drawn refused; Enter there changes nothing and the hand still holds', runs(OPEN, SELECT, TAKE, PREVIOUS, NEXT, PLACE), async ({ page }) => {
  // the Note, in the Footer: three slots back, the end of Perks, a list that accepts only its items
  await clickNode(page, 'n-note');
  await runDoor(page, TAKE);
  for (let i = 0; i < 3; i += 1) await runDoor(page, PREVIOUS);
  await expect(status(page)).toHaveText(/^Refused\. <ul> only accepts <li>/);
  await expect(page.locator('[data-chrome="drop-receiver"]')).toHaveAttribute('data-state', 'refused');
  await expect(dropLabel(page)).toHaveText(/^Refused\. <ul> only accepts <li>/);
  await expect(page.locator('[data-chrome="drop-line"]')).toHaveCount(0);

  await runDoor(page, PLACE);
  await expect(status(page)).toHaveText(/^Refused\. <ul> only accepts <li>/);
  expect(await port(page)).toEqual({ document: FIXTURE_DOCUMENT, selection: ['n-note'], undoSteps: 0 });

  // still held: the next slot is the end of Plans, where Enter places it
  await runDoor(page, NEXT);
  await expect(status(page)).toHaveText('Plans will receive. Position 3 of 3. Level 1 of 2.');
  await runDoor(page, PLACE);
  await expect.poll(() => childrenOf(page, 'n-plans')).toEqual(['n-grid', 'n-perks', 'n-note']);
  expect(await childrenOf(page, 'n-footer')).toEqual([]);
  expect(await port(page)).toMatchObject({ selection: ['n-note'], undoSteps: 1 });
});

test('Arrange › Move with the keyboard takes the selected element; the keys then aim and place it', runs(OPEN, SELECT, TAKE_MENU, NEXT, PLACE), async ({ page }) => {
  await clickNode(page, 'n-title');
  await runDoor(page, TAKE_MENU);
  await expect(status(page)).toHaveText('Moving Title. Arrows aim, Enter places, Esc cancels.');
  await expect(dropLabel(page)).toHaveText('Before Intro · Page › Hero');
  await runDoor(page, NEXT);
  await runDoor(page, PLACE);
  await expect.poll(() => childrenOf(page, 'n-hero')).toEqual(['n-intro', 'n-title', 'n-actions']);
  expect(await port(page)).toMatchObject({ selection: ['n-title'], undoSteps: 1 });
});

// The context menu of a Layers row gives the focus back to its row when it closes: the hand's keys act there too, as
// the status bar tells the person.
test('taken from a Layers row\'s context menu, the hand\'s keys act with the focus back in Layers: they aim and place it', runs(OPEN, ROW_MENU, TAKE_CONTEXT, NEXT, PLACE), async ({ page }) => {
  await runDoor(page, ROW_MENU, { args: { target: 'n-title' } });
  await runDoor(page, TAKE_CONTEXT);
  await expect(status(page)).toHaveText('Moving Title. Arrows aim, Enter places, Esc cancels.');
  expect(await page.evaluate(() => document.activeElement?.closest('[data-key-context="layers-tree"]') !== null), 'the focus is back in the Layers tree').toBe(true);
  await runDoor(page, NEXT);
  await expect(status(page)).toHaveText('Hero will receive. Position 2 of 3. Level 1 of 2.');
  await runDoor(page, PLACE);
  await expect.poll(() => childrenOf(page, 'n-hero')).toEqual(['n-intro', 'n-title', 'n-actions']);
  expect(await port(page)).toMatchObject({ selection: ['n-title'], undoSteps: 1 });
});

test('a hidden element is refused: the status bar says to show it, nothing is held and nothing changes', runs(OPEN, EYE, ROW, TAKE_MENU), async ({ page }) => {
  // the eye acts while something is selected (element.toggleHidden's availability, hasSelection): Intro's row first
  await runDoor(page, ROW, { args: { target: 'n-intro' } });
  await expect.poll(async () => (await port(page)).selection).toEqual(['n-intro']);
  await runDoor(page, EYE, { args: { target: 'n-intro' } });
  await expect(status(page)).toHaveText('Hidden: Intro');
  await expect.poll(async () => (await port(page)).selection).toEqual(['n-intro']);
  const before = await port(page);

  await runDoor(page, TAKE_MENU);
  await expect(status(page)).toHaveText('Show Intro before moving it.');
  await expect(drop(page)).toHaveCount(0);
  expect(await port(page)).toEqual(before);
});

test('a new selection ends the hand: the aim is no longer drawn and the arrows walk the tree again', runs(OPEN, SELECT, TAKE, NEXT, WALK_NEXT), async ({ page }) => {
  await clickNode(page, 'n-title');
  await runDoor(page, TAKE);
  await runDoor(page, NEXT);
  await expect(dropLabel(page)).toHaveText('Between Intro and Actions · Page › Hero');

  await clickNode(page, 'n-intro');
  await expect.poll(async () => (await port(page)).selection).toEqual(['n-intro']);
  await expect(drop(page)).toHaveCount(0);
  // ArrowRight on the canvas: the next sibling, not the next slot of a hand
  await runDoor(page, WALK_NEXT);
  await expect.poll(async () => (await port(page)).selection).toEqual(['n-actions']);
  expect((await port(page)).document).toEqual(FIXTURE_DOCUMENT);
});
