// The space the interface's labels have (the investigation's C4, option D; DEF-0573): in each screen condition, the
// content width the box of each drawn door's label keeps for its text, with the label's font, letter spacing and
// transform, and the width of every region of manifest/layout.json the editor mounts; kept in
// manifest/generated/ui-widths.json beside the hash of the stylesheets it was taken with (cssHash of check.ts): a
// stylesheet that changes makes the measurement stale, which tools/ui-fit/check.ts says, and it runs again.
// Run: npm run ui-fit:measure, with the Windows condition E2E_SCROLLBARS=shown E2E_SCALE=1.25 npm run ui-fit:measure,
// and with the pt-BR condition UI_FIT_CONDITION=ptbr E2E_SCROLLBARS=shown E2E_SCALE=1.25 npm run ui-fit:measure.
import fs from 'node:fs';
import { test } from '@playwright/test';
import { openEditor } from '../../tests/support/editor.ts';
import { UI_WIDTHS, cssHash } from './check.ts';

const CONDITION = process.env.UI_FIT_CONDITION === 'ptbr' ? 'ptbr' : process.env.E2E_SCROLLBARS === 'shown' ? 'windows' : 'default';
const MENUS = ['file', 'edit', 'arrange', 'view', 'help', 'theme', 'language', 'element-actions', 'zoom', 'snap', 'style-state'];

interface Cell {
  width: number;
  fontSize: number;
  fontWeight: number;
}
// the space a door's label has and how the label is set: how wide a far longer text gets in the element that holds the
// label before it is cut or breaks its line, and the text's letter spacing and transform (DEF-0573: the column was the
// whole region's width)
interface LabelCell extends Cell {
  letterSpacing: number;
  textTransform: string;
  // the text the label draws in this condition's language: what the check holds against the space
  text: string;
  // the lines the label may take before it cuts (-webkit-line-clamp): absent for one
  lines?: number;
}
interface DoorRow {
  readonly ref: string;
  readonly drawn: boolean;
  readonly cell: LabelCell | null;
}

test(`mede a largura das regiões e dos rótulos (${CONDITION})`, async ({ page: first, browser }) => {
  test.setTimeout(300_000);
  let page = first;
  const found = new Map<string, Cell>();
  const labels = new Map<string, LabelCell>();
  // the doors drawn without a text of their own (an icon, a gesture's row): their label has no column
  const textless = new Set<string>();
  const collect = async (): Promise<void> => {
    const doors: DoorRow[] = await page.evaluate(() =>
      [...document.querySelectorAll('[data-door]')].map((door) => {
        const ref = door.getAttribute('data-door') ?? '';
        if (door.getClientRects().length === 0) return { ref, drawn: false, cell: null };
        // the element holding the label's text: the one, inside this door and not inside a door nested in it, whose
        // own text is the longest
        let holder: Element | null = null;
        let longest = 0;
        for (const element of [door, ...door.querySelectorAll('*')]) {
          if (element !== door && element.closest('[data-door]') !== door) continue;
          const own = [...element.childNodes].filter((node) => node.nodeType === 3).map((node) => (node.textContent ?? '').trim()).join(' ').trim();
          if (own.length > longest) {
            holder = element;
            longest = own.length;
          }
        }
        if (holder === null) return { ref, drawn: true, cell: null };
        const text: Element = holder;
        const style = getComputedStyle(text);
        // The space the label can take, as the browser lays it out: its text swapped for a far longer one for a moment,
        // the width that text reaches before the label cuts it (the box, when the text overflows it) or breaks its line
        // (the first line, when it wraps), then the text put back. Whatever grows with the label (a menu, a row that
        // fits its content) grows with it; whatever holds it (a fixed column, a cell) holds it (rule G5: the element's
        // own space).
        const nodes = [...text.childNodes].filter((node): node is Text => node.nodeType === 3);
        const held = nodes.map((node) => node.data);
        const drawnText = held.join(' ').replace(/\s+/g, ' ').trim();
        const first = nodes[0];
        if (first === undefined) return { ref, drawn: true, cell: null };
        first.data = 'M'.repeat(240);
        for (const node of nodes.slice(1)) node.data = '';
        const range = document.createRange();
        range.selectNodeContents(first);
        const line = range.getClientRects()[0];
        // the first line of the long text, cut by every ancestor that clips it (an overflow other than visible): what
        // of it can be seen
        let right = line?.right ?? 0;
        // An ancestor clips the text only along its containing block chain (CSS 2, 11.1.1): above an element fixed to
        // the window none does, and the window's width bounds it, where the editor places the layer again; above an
        // absolute one, only from its nearest positioned ancestor up (measured: the zoom menu, fixed, lies inside the
        // canvas toolbar's overflow and is drawn whole).
        let escaped: 'none' | 'absolute' | 'fixed' = 'none';
        for (let at: Element | null = text; at !== null && at !== document.body; at = at.parentElement) {
          const clip = getComputedStyle(at);
          const clips = at === text || escaped === 'none' || (escaped === 'absolute' && clip.position !== 'static');
          if (escaped === 'absolute' && clip.position !== 'static') escaped = 'none';
          if (clips) {
            // a text kept for the screen readers only (clipped to nothing: clip-path inset(50%), clip rect(0 0 0 0))
            // shows nothing
            if (clip.clipPath.startsWith('inset(50%') || clip.clip === 'rect(0px, 0px, 0px, 0px)') right = line?.left ?? 0;
            if (clip.overflowX !== 'visible') right = Math.min(right, at.getBoundingClientRect().right - Number.parseFloat(clip.borderRightWidth) - Number.parseFloat(clip.paddingRight));
          }
          if (clip.position === 'fixed') escaped = 'fixed';
          else if (clip.position === 'absolute' && escaped !== 'fixed') escaped = 'absolute';
        }
        if (escaped === 'fixed') right = Math.min(right, (line?.left ?? 0) + window.innerWidth);
        const width = Math.max(0, right - (line?.left ?? 0));
        // the lines the label may take before it cuts (a tile's name: two)
        const clamp = Number.parseInt(style.webkitLineClamp, 10);
        nodes.forEach((node, index) => {
          node.data = held[index] ?? '';
        });
        return {
          ref,
          drawn: true,
          // a label no one can see (visually hidden: its space is nothing) draws no text of its own
          cell:
            width < 1
              ? null
              : {
                  width,
                  fontSize: Number.parseFloat(style.fontSize),
                  fontWeight: Number.parseInt(style.fontWeight, 10) || 400,
                  letterSpacing: Number.parseFloat(style.letterSpacing) || 0,
                  textTransform: style.textTransform,
                  text: drawnText,
                  ...(clamp > 1 ? { lines: clamp } : {}),
                },
        };
      }),
    );
    for (const row of doors) {
      if (!row.drawn) continue;
      if (row.cell === null) {
        if (!labels.has(row.ref)) textless.add(row.ref);
        continue;
      }
      textless.delete(row.ref);
      const held = labels.get(row.ref);
      // the narrowest the label appears, the space that can appear
      if (held === undefined || row.cell.width < held.width) labels.set(row.ref, row.cell);
    }
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('[data-region]')].map((element) => {
        const style = getComputedStyle(element);
        return {
          id: element.getAttribute('data-region') ?? '',
          width: (element as HTMLElement).clientWidth,
          fontSize: Number.parseFloat(style.fontSize),
          fontWeight: Number.parseInt(style.fontWeight, 10) || 400,
        };
      }),
    );
    for (const row of rows) {
      if (row.id === '' || row.width <= 0) continue;
      const held = found.get(row.id);
      // the narrowest the region appears, the column that can appear
      if (held === undefined || row.width < held.width) found.set(row.id, { width: row.width, fontSize: row.fontSize, fontWeight: row.fontWeight });
    }
  };

  // every section and row of the Style tab opened, then the Settings and the Interactions tabs: the fields of the
  // element selected (DEF-0573: only what the first screen drew was measured)
  const inspector = async (): Promise<void> => {
    await page.locator('[data-door="workspace.setActiveTab#inspector-tab-style"]').first().click();
    for (const closed of ['[data-door^="inspector.toggleSection"][aria-expanded="false"]', '[data-door^="inspector.toggleRow"][aria-expanded="false"]']) {
      for (let round = 0; round < 40 && (await page.locator(closed).count()) > 0; round++) await page.locator(closed).first().click();
    }
    await collect();
    for (const tab of ['settings', 'interactions']) {
      const door = page.locator(`[data-door="workspace.setActiveTab#inspector-tab-${tab}"]`).first();
      if ((await door.count()) === 0) continue;
      await door.click();
      await collect();
    }
    await page.locator('[data-door="workspace.setActiveTab#inspector-tab-style"]').first().click();
  };

  // an element selected: the inspector draws its fields and the quick panel its chip
  await openEditor(page, { project: 'aurora', commands: [{ command: 'selection.select', args: { target: 'n-title' } }] });
  await collect();
  await inspector();
  for (const menu of MENUS) {
    const button = page.locator(`[data-menu="${menu}"]`).first();
    if ((await button.count()) === 0) continue;
    await button.click();
    await collect();
    await page.keyboard.press('Escape');
  }
  // the command bar with a query that lists its entries
  await page.keyboard.press('Control+k');
  await page.keyboard.type('e');
  await collect();
  await page.keyboard.press('Escape');
  const chip = page.locator('[data-quick-panel-chip]').first();
  if ((await chip.count()) > 0) {
    await chip.click();
    await collect();
    await page.keyboard.press('Escape');
  }
  // the context menu of the element on the canvas
  const frame = page.locator('.frame__page');
  const point = await frame.evaluate((iframe, node) => {
    const element = (iframe as HTMLIFrameElement).contentDocument?.querySelector(`[data-node="${node}"]`);
    const box = iframe.getBoundingClientRect();
    const rect = element?.getBoundingClientRect();
    const zoom = (iframe as HTMLIFrameElement).currentCSSZoom;
    return rect === undefined ? null : { x: box.left + (rect.left + rect.width / 2) * zoom, y: box.top + (rect.top + rect.height / 2) * zoom };
  }, 'n-title');
  if (point !== null) {
    await page.mouse.click(point.x, point.y, { button: 'right' });
    await collect();
    await page.keyboard.press('Escape');
  }
  // the colour picker of a colour field
  const swatch = page.locator('[data-door="colorPicker.open#field-color-swatch"]').first();
  if ((await swatch.count()) > 0) {
    await swatch.click();
    await collect();
    await page.keyboard.press('Escape');
  }
  // the activity bar switches the sidebar's view; the dock strip its tab
  for (const selector of ['.activity-bar button[data-door]', '[data-region="dock-strip"] button[data-door]']) {
    const count = await page.locator(selector).count();
    for (let i = 0; i < count; i++) {
      await page.locator(selector).nth(i).click();
      await collect();
    }
  }
  // the fields of other elements: a form, a field, a video and a button (motion.json), links and an image
  // (canonical.json), each project in a context of its own (one editor per page; a fresh profile per editor)
  for (const [project, targets] of [['motion', ['n-signup', 'n-email', 'n-clip', 'n-modal-close']], ['canonical', ['c-nav-0', 'c-hero-image']]] as const) {
    for (const target of targets) {
      // a context made here takes none of the configuration's own: its address, its screen and its scale are handed
      // to it; the element is selected by the boot (a narrow window opens with the sidebar closed, Layers out of sight)
      const viewport = first.viewportSize();
      const baseURL = test.info().project.use.baseURL;
      const scale = process.env.E2E_SCALE;
      const context = await browser.newContext({
        locale: CONDITION === 'ptbr' ? 'pt-BR' : 'en-US',
        ...(viewport === null ? {} : { viewport }),
        ...(baseURL === undefined ? {} : { baseURL }),
        ...(scale === undefined || scale === '' ? {} : { deviceScaleFactor: Number(scale) }),
      });
      page = await context.newPage();
      await openEditor(page, { project, commands: [{ command: 'selection.select', args: { target } }] });
      await collect();
      await inspector();
      await context.close();
    }
  }

  const before = fs.existsSync(UI_WIDTHS) ? (JSON.parse(fs.readFileSync(UI_WIDTHS, 'utf8')) as { regions?: Record<string, Record<string, Cell>>; doors?: Record<string, Record<string, LabelCell>>; textless?: Record<string, readonly string[]> }) : {};
  const regions: Record<string, Record<string, Cell>> = { ...(before.regions ?? {}) };
  for (const [id, cell] of found) regions[id] = { ...(regions[id] ?? {}), [CONDITION]: cell };
  const doors: Record<string, Record<string, LabelCell>> = { ...(before.doors ?? {}) };
  for (const [ref, cell] of labels) doors[ref] = { ...(doors[ref] ?? {}), [CONDITION]: cell };
  const withoutText = { ...(before.textless ?? {}), [CONDITION]: [...textless].sort() };
  const sorted = <T>(record: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(UI_WIDTHS, `${JSON.stringify({ $generated: { by: 'tools/ui-fit/measure.spec.ts', css: cssHash() }, regions: sorted(regions), doors: sorted(doors), textless: sorted(withoutText) }, null, 2)}\n`);
  console.log(`ui-fit: ${String(found.size)} regiões e ${String(labels.size)} rótulos medidos, ${String(textless.size)} portas sem texto (${CONDITION})`);
});

