// What a person's use of the panels found cut or scrolled sideways (the use session of 2026-10-09, DEF-0590 to DEF-0594),
// each read where the flow that met it stands: a column's type menu in the data preview, a mapped part's name, the
// Explorer's file names, the Motion dock and a Layout Composer action. Every condition of the suite runs it.
import { expect, installClock, test, type Page } from '../support/test.ts';
import { openEditor } from '../support/editor.ts';
import { FLOWS } from '../../tools/ui/flows.ts';
import { playFlow } from '../../tools/ui/play.ts';
import fs from 'node:fs';
import { control, openMenu, runDoor } from './door.ts';

async function playUpTo(page: Page, name: string, steps: number): Promise<void> {
  const flow = FLOWS.find((one) => one.name === name);
  if (flow === undefined) throw new Error(`no flow ${name}`);
  await page.setViewportSize({ width: 1440, height: 900 });
  await installClock(page);
  await openEditor(page);
  expect(await playFlow(page, { ...flow, steps: flow.steps.slice(0, steps) })).toEqual([]);
}

test('a column type menu of the data preview shows its whole type (DEF-0590)', async ({ page }) => {
  test.setTimeout(120_000);
  await playUpTo(page, 'data-c4', 8);
  const menus = page.locator('[data-region="data-preview"] th select');
  await expect(menus.first()).toBeVisible();
  // the menu is at least as wide as its chosen type's words, measured in its own font
  const short = await menus.evaluateAll((all) => all.flatMap((one) => {
    const select = one as HTMLSelectElement;
    const style = getComputedStyle(select);
    const context = document.createElement('canvas').getContext('2d');
    if (context === null) return [];
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const words = context.measureText(select.selectedOptions[0]?.textContent ?? '').width;
    const inner = select.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
    return inner + 0.5 < words ? [`${select.selectedOptions[0]?.textContent ?? ''}: ${inner.toFixed(1)} < ${words.toFixed(1)}`] : [];
  }));
  expect(short).toEqual([]);
});

test('a mapped part’s name is never cut in the Connect fields list (DEF-0592)', async ({ page }) => {
  test.setTimeout(120_000);
  await playUpTo(page, 'data-c4', 16);
  const parts = page.locator('.data-target__name .data-column__type');
  await expect(parts.first()).toBeVisible();
  const cut = await parts.evaluateAll((all) => all.filter((one) => one.scrollWidth > one.clientWidth + 1).map((one) => one.textContent));
  expect(cut).toEqual([]);
});

test('an Explorer file’s name is never cut: its details leave first, and come back where they fit (DEF-0593)', async ({ page }) => {
  test.setTimeout(120_000);
  await playUpTo(page, 'data-c3', 99);
  const names = page.locator('.row__main > .row__name');
  await expect(names.first()).toBeVisible();
  const cut = await names.evaluateAll((all) => all.filter((one) => one.scrollWidth > one.clientWidth + 1).map((one) => one.textContent));
  expect(cut).toEqual([]);
  // a row whose name and details fit shows its details: "index.html" keeps its "generated" mark where the row has its
  // room, and only where it has not do the details leave (with a Windows scrollbar the row is 10 px narrower and the
  // mark 3 px short, DEF-0625: the premise held without a scrollbar only)
  const index = page.locator('.row__main', { hasText: 'index.html' }).filter({ has: page.locator('.row__gen') }).first();
  const fits = await index.evaluate((row) => {
    const style = getComputedStyle(row);
    const gap = parseFloat(style.columnGap) || 0;
    const shown = [...row.children].filter((one): one is HTMLElement => one instanceof HTMLElement && one.offsetWidth > 0 && !one.classList.contains('row__gen'));
    const used = shown.reduce((sum, one) => sum + one.offsetWidth, 0) + gap * Math.max(0, shown.length - 1);
    const free = row.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0) - used;
    const mark = row.querySelector<HTMLElement>('.row__gen');
    if (mark === null) return null;
    // the mark's own width, read with it drawn for a moment
    const hidden = getComputedStyle(mark).display === 'none';
    if (hidden) mark.style.display = 'block';
    const need = mark.offsetWidth + gap;
    if (hidden) mark.style.display = '';
    return need <= free + 0.5;
  });
  if (fits) await expect(index.locator('.row__gen')).toBeVisible();
  else await expect(index.locator('.row__gen')).toBeHidden();
  // and the name, its details away, is whole (above): never cut for a detail
});

test('the Motion dock never scrolls sideways: only its track does (DEF-0591)', async ({ page }) => {
  test.setTimeout(120_000);
  await playUpTo(page, 'easing-curve', 9);
  const sideways = await page.locator('.dock-body').evaluateAll((all) => all.filter((one) => one.scrollWidth > one.clientWidth + 1).map((one) => `${one.scrollWidth} in ${one.clientWidth}`));
  expect(sideways).toEqual([]);
});

test('a Layout Composer action as wide as the panel keeps its words inside (DEF-0594)', async ({ page }) => {
  test.setTimeout(120_000);
  await playUpTo(page, 'layout-10-desktop-to-mobile', 8);
  const actions = page.locator('.layout-panel__actions > .door');
  await expect(actions.first()).toBeVisible();
  const over = await actions.evaluateAll((all) => all.filter((one) => one.scrollWidth > one.clientWidth).map((one) => one.textContent));
  expect(over).toEqual([]);
});

// DEF-0598: with All properties open, a section header lay half under the top of the Inspector's scrolled list, under
// Find a property ("PINTURA" cut, after editing Font size). While a section's rows pass under the top, its header stays
// whole there; and a field brought into view by the focus stops below that header, never under it.
test('a section header of the Inspector stays whole at the top while its rows scroll under it (DEF-0598)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, 'project.open#menu-file');
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync('manifest/features/fixtures/aurora.json') });
  // at 1280 px the sidebar opens closed: the Layers come with it
  await runDoor(page, 'workspace.setPanelOpen#toolbar-activity-bar-insert');
  await control(page, 'selection.select#layers-row', { args: { target: 'n-intro' } }).click();
  await runDoor(page, 'inspector.setMode#inspector-mode-all');
  const list = page.locator('.inspector-scroll');
  // every place of the list, a row's height apart: the sections whose rows lie under its top, and their headers
  const wrong = await list.evaluate(async (scroller) => {
    const out: string[] = [];
    const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    for (let at = 0; at <= scroller.scrollHeight - scroller.clientHeight; at += 13) {
      scroller.scrollTop = at;
      await frame();
      const top = scroller.getBoundingClientRect().top;
      for (const section of scroller.querySelectorAll('.inspector-section')) {
        const header = section.querySelector<HTMLElement>('.inspector-section__header');
        if (header === null) continue;
        const box = section.getBoundingClientRect();
        const head = header.getBoundingClientRect();
        // its rows under the top, with room above its content's end for the whole header (the header leaves with the
        // section's last row, pushed by the next header, as a grouped list's header does)
        const own = getComputedStyle(section);
        const end = box.bottom - (parseFloat(own.paddingBottom) || 0) - (parseFloat(own.borderBottomWidth) || 0);
        if (box.top < top - 0.5 && end >= top + head.height + 0.5) {
          if (Math.abs(head.top - top) > 0.5) out.push(`${header.textContent ?? ''} at ${at}: ${(head.top - top).toFixed(1)} px from the top`);
        }
      }
    }
    return out;
  });
  expect(wrong).toEqual([]);
  // a field reached by the keyboard right below a header comes into view below it
  await list.evaluate((scroller) => { scroller.scrollTop = scroller.scrollHeight; });
  const field = page.locator('[data-door="style.set#inspector-background-color"] input').first();
  await field.focus();
  const covered = await field.evaluate((input) => {
    const r = input.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 2);
    return hit === null || !input.contains(hit) ? `${hit?.className ?? 'nothing'} over the field` : '';
  });
  expect(covered).toBe('');
});

// DEF-0599: a Layers row's tag stands in the room its actions keep, so it takes none from the name; a long name still
// sent it away ("Formulário c…" lost its "form", an empty end beside it). A row whose name is cut keeps its tag.
test('a Layers row whose name is cut keeps its tag beside it (DEF-0599)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, 'project.open#menu-file');
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync('manifest/features/fixtures/aurora.json') });
  await runDoor(page, 'workspace.setPanelOpen#toolbar-activity-bar-insert');
  await control(page, 'selection.select#layers-row', { args: { target: 'n-card-a-title' } }).click();
  // a deep element with a long name: the Form with fields, inserted in a card
  const tile = page.locator('.sidebar [data-door="element.insert#elements-tile"]').filter({ hasText: 'Form with fields' });
  await tile.scrollIntoViewIfNeeded();
  await tile.click();
  await page.mouse.move(1, 700);
  // renamed long, as a person names a part of the page
  const row = page.locator('.sidebar .row--tree.is-selected .row__name');
  await expect(row).toHaveText('Form with fields');
  await row.dblclick();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Sign-up form with every field');
  await page.keyboard.press('Enter');
  await expect(row).toHaveText('Sign-up form with every field');
  await page.mouse.move(1, 700);
  const bare = await page.locator('.sidebar .row--tree').evaluateAll((rows) => rows.flatMap((row) => {
    const name = row.querySelector<HTMLElement>('.row__name');
    const tag = row.querySelector<HTMLElement>('.row__meta');
    if (name === null || tag === null || name.scrollWidth <= name.clientWidth + 0.5) return [];
    return tag.offsetWidth > 0 ? [] : [`${name.textContent ?? ''} without its ${tag.textContent ?? ''}`];
  }));
  expect(bare).toEqual([]);
  expect(await page.locator('.sidebar .row--tree .row__name').evaluateAll((names) => names.some((n) => n.scrollWidth > n.clientWidth + 0.5)), 'a name cut, as the case needs').toBe(true);
});

// DEF-0610: a page with a long name drew its file name ("about-us-and-our…") over the page's name in the Explorer:
// the file name took half the row, wider than the room the name leaves it. It ends before the name's field.
test('a page row of the Explorer keeps its file name off the page name (DEF-0610)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await runDoor(page, 'workspace.setPanelOpen#toolbar-activity-bar-explorer');
  await runDoor(page, 'pages.add#explorer-add-page');
  const name = page.locator('input[data-door="pages.rename#explorer-page-name-field"]').nth(1);
  await expect(name).toBeFocused();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('About us and our long coffee roasting story');
  await page.keyboard.press('Enter');
  await page.mouse.click(900, 600);
  await expect(name).not.toBeFocused();
  const overlap = await name.evaluate((input) => {
    const row = input.closest('.row--page');
    const meta = row?.querySelector('.row__meta');
    if (!row || !meta) throw new Error('no page row or file name');
    return meta.getBoundingClientRect().left - input.getBoundingClientRect().right;
  });
  expect(overlap, 'the file name begins after the page name ends').toBeGreaterThanOrEqual(0);
  // a short file name reads whole beside it (the room's width took "index.html" to "index.htm…" for a moment)
  const home = page.locator('.row--page .row__meta').first();
  await expect(home).toHaveText('index.html');
  expect(await home.evaluate((meta) => meta.scrollWidth <= meta.clientWidth + 0.5), 'index.html whole').toBe(true);
});

// DEF-0611: the Components group of the Insert panel read "Components1": its header, which never collapses, was a
// plain block where the other groups' headers are a door's row, so its count sat against its name. Its name begins
// where theirs do and its count ends where theirs do.
test('the Components group header of the Insert panel lines up with the other groups (DEF-0611)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, 'project.open#menu-file');
  await (await chooser).setFiles({ name: 'aurora.json', mimeType: 'application/json', buffer: fs.readFileSync('manifest/features/fixtures/aurora.json') });
  await control(page, 'selection.select#layers-row', { args: { target: 'n-card-a-title' } }).click({ button: 'right' });
  await control(page, 'components.startCreate#context-menu').click();
  await page.keyboard.type('Card title');
  await page.keyboard.press('Enter');
  const statics = page.locator('.palette-group__header--static');
  await expect(statics).toHaveCount(1);
  const place = (header: Element) => {
    const label = header.querySelector('.door__label')?.getBoundingClientRect();
    const count = header.querySelector('.palette-group__count')?.getBoundingClientRect();
    return { label: Math.round(label?.left ?? -1), count: Math.round(count?.right ?? -1) };
  };
  const components = await statics.evaluate(place);
  const other = await page.locator('.palette-group__header:not(.palette-group__header--static)').first().evaluate(place);
  expect(components, 'the Components header against the first group').toEqual(other);
});

// DEF-0612: in the collection's fields, the type menu of a yes-or-no field read "Yes or": the menu took the width its
// row left beside the field's name, narrower than its choice and its arrow. Every type menu of those rows is at least
// as wide as its types drawn (its max-content width), and the panel does not scroll sideways (the screen guard).
test('a menu of a collection field shows its whole choice (DEF-0612)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await runDoor(page, 'workspace.setPanelOpen#toolbar-activity-bar-data');
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, 'data.preview#data-import');
  await (await chooser).setFiles({ name: 'coffees.csv', mimeType: 'text/csv', buffer: Buffer.from(['Coffee name,Price,Farm of origin,Available', 'Ethiopia Yirgacheffe,42.5,Konga farm,yes', 'Brazil Cerrado,35,Santa Ines farm,no', ''].join('\n')) });
  await runDoor(page, 'data.importNew#data-import-new');
  const menus = page.locator('.data-field--type select.input');
  await expect(menus.first()).toBeVisible();
  // the last field made a yes-or-no one, as a person chooses it in its menu
  await page.locator('.data-field--type select.input').last().selectOption('boolean');
  await expect(page.locator('.data-field--type select.input').last()).toHaveValue('boolean');
  const short = await menus.evaluateAll((all) => all.flatMap((menu) => {
    const select = menu as HTMLSelectElement;
    const drawn = select.getBoundingClientRect().width;
    // a copy on its own, out of the row's flex: the width the menu draws its types in
    const copy = select.cloneNode(true) as HTMLSelectElement;
    copy.style.position = 'absolute';
    copy.style.width = 'max-content';
    copy.style.minWidth = '0';
    select.parentElement?.appendChild(copy);
    const natural = copy.getBoundingClientRect().width;
    copy.remove();
    return drawn + 0.5 < natural ? [`${select.selectedOptions[0]?.textContent ?? ''}: ${drawn.toFixed(1)} < ${natural.toFixed(1)}`] : [];
  }));
  expect(short).toEqual([]);
  // and no control of a field's row runs under its neighbour (the menu grown under the field's Delete)
  const crossed = await page.locator('.data-fields__row').evaluateAll((rows) => rows.flatMap((row) => {
    const controls = [...row.querySelectorAll('input, select, button')].map((one) => one.getBoundingClientRect()).filter((r) => r.width > 0).sort((a, b) => a.left - b.left);
    return controls.slice(1).flatMap((now, i) => {
      const before = controls[i];
      return before !== undefined && now.top < before.bottom && before.top < now.bottom && now.left + 0.5 < before.right ? [`${before.right.toFixed(1)} > ${now.left.toFixed(1)}`] : [];
    });
  }));
  expect(crossed).toEqual([]);
});

// DEF-0613: a page with a long name made the page switcher of the top bar 640 px wide at 1280, and the bar's actions
// shrank under one another (Preview's words under Export's, Commands under Undo). The switcher gives the room away; no
// control of the bar crosses its neighbour and Preview and Export ZIP read whole.
test('the top bar keeps its actions whole beside a page with a long name (DEF-0613)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openEditor(page);
  await runDoor(page, 'workspace.setPanelOpen#toolbar-activity-bar-explorer');
  await runDoor(page, 'pages.add#explorer-add-page');
  await expect(page.locator('input[data-door="pages.rename#explorer-page-name-field"]').nth(1)).toBeFocused();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('About us and our long coffee roasting story');
  await page.keyboard.press('Enter');
  await expect(page.locator('.top-bar__page > b')).toHaveText('About us and our long coffee roasting story');
  const wrong = await page.locator('[data-region="top-bar"]').evaluate((bar) => {
    const out: string[] = [];
    const kids = [...bar.children].filter((one) => one.getBoundingClientRect().width > 0);
    for (let i = 1; i < kids.length; i += 1) {
      const before = kids[i - 1]?.getBoundingClientRect();
      const now = kids[i]?.getBoundingClientRect();
      if (before && now && now.left + 0.5 < before.right) out.push(`${kids[i]?.className ?? ''} over ${kids[i - 1]?.className ?? ''}`);
    }
    // what each control draws stays inside it (a shrunk button's words ran over its neighbour)
    for (const control of bar.querySelectorAll<HTMLElement>(':scope > button, :scope > .menu-anchor > button')) {
      if (control.scrollWidth > control.clientWidth + 0.5) out.push(`cut: ${control.textContent ?? ''}`);
    }
    if (bar.scrollWidth > bar.clientWidth + 0.5) out.push('the bar runs past the window');
    return out;
  });
  expect(wrong).toEqual([]);
});

// DEF-0614: in pt-BR the new field's form put its name, its type and "Adicionar campo" on one row: the type menu read
// "T" and the name's field "Nome". The type menu draws its whole choice and the name's field keeps a width that reads.
test('the new field form of a collection reads whole in Portuguese (DEF-0614)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openEditor(page);
  await openMenu(page, 'view');
  await page.getByRole('menuitem', { name: /^(Idioma|Language)$/ }).hover();
  await page.locator('[data-door="preferences.setLanguage#menu-language-pt-br"]').click();
  await expect(page.locator('[data-menu="file"]')).toHaveText('Arquivo');
  await runDoor(page, 'workspace.setPanelOpen#toolbar-activity-bar-data');
  const chooser = page.waitForEvent('filechooser');
  await runDoor(page, 'data.preview#data-import');
  await (await chooser).setFiles({ name: 'cafes.csv', mimeType: 'text/csv', buffer: Buffer.from(['Nome,Preço', 'Etiópia,42', ''].join('\n')) });
  await runDoor(page, 'data.importNew#data-import-new');
  const form = page.locator('.data-fields__add');
  await expect(form).toBeVisible();
  const read = await form.evaluate((row) => {
    const select = row.querySelector('select');
    const name = row.querySelector('input');
    if (select === null || name === null) throw new Error('no type menu or name field');
    const copy = select.cloneNode(true) as HTMLSelectElement;
    copy.style.position = 'absolute';
    copy.style.width = 'max-content';
    copy.style.minWidth = '0';
    row.appendChild(copy);
    const natural = copy.getBoundingClientRect().width;
    copy.remove();
    return { menu: select.getBoundingClientRect().width + 0.5 >= natural, name: name.getBoundingClientRect().width };
  });
  expect(read.menu, 'the type menu draws its whole choice').toBe(true);
  expect(read.name, 'the name field keeps a width that reads').toBeGreaterThanOrEqual(76);
});
