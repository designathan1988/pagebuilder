// A Layers row whose name does not fit beside its details (its tag, id or classes), or an Explorer file's row beside
// its folder and size, gives the details' room to the name:
// they leave that row, and the name ends in an ellipsis only where it does not fit the row alone (the audit of
// 2026-10-05: "Cartão Assinatura título" read "Cartão Assi…" beside "article"). The details' width is kept when they
// leave, so a row is judged the same either way and nothing flickers: they come back once the name and they fit again.
// Before them, an instance's chip naming its component gives way: it keeps only its icon, the component's name in its
// tooltip and read out, and is drawn whole again only after the details are back (the last check's L11: "Site h…").
// a Layers row, and an Explorer file's main area, with the name and the details each holds
const ROWS = '.row--tree, .row__main';
const NAME = ':scope > .row__name';
// (an Explorer file's "generated" mark is one of its details: beside "contact.html" it left the name cut where the
// sidebar is 15 px narrower, DEF-0593)
const DETAILS = ':scope > .row__meta[data-region="layers-row-details"], .row__main > .row__meta, .row__main > .row__gen';
// the sub-pixel difference between the text's width and its box
const TOLERANCE = 0.5;
// an instance's chip naming its component (a Layers row): it gives the name its room before the details do
const CHIP = ':scope > .row__component';
const CHIP_NAME = ':scope > .row__component-name';

// The room a row leaves free beside what it draws: an Explorer file's name is as wide as it reads and does not grow,
// so the free room is where the details come back to (a Layers row's name takes the row, and leaves none)
function freeRoom(row: HTMLElement, gap: number): number {
  const style = getComputedStyle(row);
  const shown = [...row.children].filter((one): one is HTMLElement => one instanceof HTMLElement && one.offsetWidth > 0);
  const used = shown.reduce((sum, one) => sum + one.offsetWidth, 0) + gap * Math.max(0, shown.length - 1);
  return Math.max(0, row.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0) - used);
}

export function fitNames(list: HTMLElement): void {
  // measured at rest: a Layers row keeps its actions' room only while they show (hovered, focused or selected;
  // sidebar.css .row--tree, DCS-065), and judged there the selected row's tag and chip left as it was selected and came
  // back as it was left. The mark is taken off before the frame paints.
  list.dataset.atRest = '';
  for (const row of list.querySelectorAll<HTMLElement>(ROWS)) fitRow(row);
  delete list.dataset.atRest;
}

function fitRow(row: HTMLElement): void {
  const name = row.querySelector<HTMLElement>(NAME);
  const chip = row.querySelector<HTMLElement>(CHIP);
  // the name is cut, or the chip's own words are (asked only while the chip shows them)
  const chipName = chip?.querySelector<HTMLElement>(CHIP_NAME) ?? null;
  const cut = () =>
    (name !== null && name.scrollWidth > name.clientWidth + TOLERANCE) || (chipName !== null && chipName.scrollWidth > chipName.clientWidth + TOLERANCE);
  // an instance's component chip gives way first: it keeps only its icon while the name does not fit beside it
  if (chip === null || name === null) delete row.dataset.componentCompact;
  else if (!('componentCompact' in row.dataset) && cut()) row.dataset.componentCompact = '';
  fitDetails(row, name);
  // and comes back last, once the details are back: tried whole, and kept to its icon again if the name is then cut
  // (the same frame's layout, never painted)
  if (chip !== null && 'componentCompact' in row.dataset && !('nameFirst' in row.dataset)) {
    delete row.dataset.componentCompact;
    if (cut()) row.dataset.componentCompact = '';
  }
}

// The row's details (its tag, id or classes; a file's folder and size) leave where the name does not fit beside them,
// and come back once both fit
function fitDetails(row: HTMLElement, name: HTMLElement | null): void {
  const details = [...row.querySelectorAll<HTMLElement>(DETAILS)];
  if (name === null || details.length === 0) {
    delete row.dataset.nameFirst;
    return;
  }
  const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
  if (!('nameFirst' in row.dataset)) {
    // the room the details take from the name: their width, their margins and the gaps before them. A tag that took
    // none (a negative margin into the room of a row's actions) gave the name nothing by leaving: it stays (DEF-0599:
    // "Form…" lost its "form" beside an empty end); a Layers row at rest keeps no such room (DCS-065)
    const taken = details.filter((one) => one.offsetWidth > 0).reduce((sum, one) => {
      const style = getComputedStyle(one);
      return sum + one.offsetWidth + Math.max(0, parseFloat(style.marginLeft) || 0) + (parseFloat(style.marginRight) || 0) + gap;
    }, 0);
    if (name.scrollWidth > name.clientWidth + TOLERANCE && taken > TOLERANCE) {
      row.dataset.detailsWidth = String(taken);
      row.dataset.nameFirst = '';
    }
    return;
  }
  // the details come back once the name and they fit: the name's own box and the room the row leaves free (an
  // Explorer file whose name went first once, the sidebar narrower for a moment, kept its details away for good,
  // since its name never grows past what it reads, DEF-0593)
  const room = Number(row.dataset.detailsWidth ?? '0');
  if (name.scrollWidth + room <= name.clientWidth + freeRoom(row, gap) + TOLERANCE) delete row.dataset.nameFirst;
}
