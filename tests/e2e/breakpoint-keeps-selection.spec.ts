// A breakpoint's new width lays the page out anew, so the page point the view held in px stands on other content: the
// selected element is what the view keeps across the switch, whole in view and under the page's bar held at the top
// (DEF-0622: Desktop to Tablet left the selected heading's top and its label away, and back to Desktop the heading's
// first line lay under the site's sticky header). An element wholly away draws no rotation zone alone at the canvas's
// edge (DEF-0623).
import { expect, nextFrames, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { control, runs } from './door.ts';

const ROW = 'selection.select#layers-row';
const TABLET = 'view.setBreakpoint#toolbar-breakpoint-tabs-tablet';
const DESKTOP = 'view.setBreakpoint#toolbar-breakpoint-tabs-desktop';

// a sticky header, a spacer whose height the breakpoint changes, the heading, and a long page after it
function project(): string {
  const node = (id: string, type: string, name: string, tag: string, styles: unknown, children: unknown[] = [], text: string | null = null) => ({ id, type, name, tag, attributes: {}, classes: [], styles, text, children });
  const tree = node('k-page', 'page', 'Page', 'body', {}, [
    node('k-header', 'header', 'Header', 'header', { desktop: { base: { position: 'sticky', top: '0', height: '80px', 'background-color': '#ffffff', 'z-index': '10' } } }, [node('k-brand', 'paragraph', 'Brand', 'p', {}, [], 'Brand')]),
    node('k-spacer', 'div', 'Spacer', 'div', { desktop: { base: { height: '100px' } }, tablet: { base: { height: '1500px' } } }),
    node('k-title', 'heading', 'Title', 'h1', { desktop: { base: { 'font-size': '48px', 'margin-top': '0', 'margin-bottom': '0' } } }, [], 'The selected heading'),
    node('k-rest', 'div', 'Rest', 'div', { desktop: { base: { height: '4000px' } } }),
  ]);
  return JSON.stringify({ version: 4, pages: [{ id: 'p-home', name: 'Home', file: 'index.html', tree }] });
}

// the heading in the page's view: its top under the header's bottom, its bottom inside the view, its label in view;
// and the rotation zones drawn
async function seen(page: Page): Promise<{ readonly underHeader: boolean; readonly inside: boolean; readonly labelAway: boolean | null; readonly zones: number }> {
  return page.evaluate(() => {
    const iframe = document.querySelector<HTMLIFrameElement>('.frame__page');
    const doc = iframe?.contentDocument;
    const title = doc?.querySelector('[data-node="k-title"]')?.getBoundingClientRect();
    const header = doc?.querySelector('[data-node="k-header"]')?.getBoundingClientRect();
    if (!iframe || !title || !header) throw new Error('the canvas does not draw the page');
    const view = iframe.getBoundingClientRect().height / iframe.currentCSSZoom;
    const label = document.querySelector('[data-chrome="label"].is-target');
    return { underHeader: title.top >= header.bottom - 0.5, inside: title.bottom <= view + 0.5, labelAway: label === null ? null : label.classList.contains('is-away'), zones: document.querySelectorAll('[data-rotate-zone]').length };
  });
}

const scrollPageTo = (page: Page, y: number) => page.evaluate((to) => document.querySelector<HTMLIFrameElement>('.frame__page')?.contentWindow?.scrollTo(0, to), y);

test('the selected element stays in view, under the sticky header, across breakpoint switches (DEF-0622, DEF-0623)', runs(ROW, TABLET, DESKTOP), async ({ page }) => {
  await openEditor(page, { project: { text: project() } });
  await control(page, ROW, { args: { target: 'k-title' } }).click();
  await scrollPageTo(page, 0);
  await nextFrames(page);
  await expect.poll(() => seen(page), { message: 'desktop' }).toEqual({ underHeader: true, inside: true, labelAway: false, zones: 4 });
  // on Tablet the heading lies 1400 px lower: the page point the view held stood far above it
  await control(page, TABLET).click();
  await expect.poll(() => seen(page), { message: 'tablet' }).toEqual({ underHeader: true, inside: true, labelAway: false, zones: 4 });
  // scrolled away, the heading wholly above the view draws no rotation zone (DEF-0623)
  await scrollPageTo(page, 3500);
  await expect.poll(() => seen(page).then((s) => s.zones), { message: 'away' }).toBe(0);
  // back on Desktop the heading is 1400 px higher, above the view
  await control(page, DESKTOP).click();
  await expect.poll(() => seen(page), { message: 'desktop again' }).toEqual({ underHeader: true, inside: true, labelAway: false, zones: 4 });
});
