// The status bar (spec status-bar): the last message in an aria-live region,
// the breadcrumb of the selection (each ancestor a button that selects it), the size of the selection in page pixels,
// the breakpoint and the state, the element count, the zoom controls and the language, in the order of region
// status-bar, then the save state (autosave-restore). During a palette tile's creation drag the message is the drag's
// words (palette-drag-insert).
import { activeBreakpoint } from '../view/breakpoints.ts';
import { useSelectionSize } from '../view/selection-size.ts';
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { MessageId } from '../../generated/ids.ts';
import { saveState, type SaveState } from '../persistence/autosave.ts';
import { CLOUD_SAVE_TEXT, cloudState } from '../cloud/cloud.ts';
import { incidents, onIncident } from '../../core/incidents.ts';
import { locate, walk, type DocNode } from '../../core/document/model.ts';
import { openedPage } from '../../core/project/pages.ts';
import type { Message } from '../../core/commands/registry.ts';
import { pluralForm } from '../../i18n/index.ts';
import { dragMessages } from '../canvas/chrome.tsx';
import { DoorControl, Icon, useDoor } from '../doors/door.tsx';
import { elementIcon, type DoorEntry } from '../../manifest/runtime.ts';
import { MenuButton, useMenuLayer } from '../doors/menu.tsx';
import { floatBelow, type Placed } from './float.ts';
import { crumbsAfterFold } from './crumb-fold.ts';
import { drawnAsOf } from '../doors/placement.ts';
import { useEditorState } from '../store.ts';
import { activeState } from '../view/style-state.ts';
import { panelName } from '../workspace/panel-catalogue.ts';
import { messageText, useLocale, useT } from '../text.ts';
import { ZoomValue } from './canvas.tsx';
import { Slots } from './slots.tsx';
import { previewing } from '../view/preview.ts';
import { breakpointName } from '../../core/document/breakpoints.ts';
import { useDuplicating, usePointerValue } from '../input/pointer/use-views.ts';


export function StatusBar() {
  const t = useT();
  const locale = useLocale();
  const message = useEditorState((s) => s.message);
  const document = useEditorState((s) => s.document);
  // the elements of the page on the canvas, never the whole project's (the dogfooding pass: a new empty page read
  // "20 elements", the count of every page)
  const shownPage = useEditorState((s) => openedPage(s));
  const tree = document.pages[shownPage]?.tree;
  const count = tree === undefined ? 0 : [...walk(tree)].length;
  // the breakpoint the canvas shows and its width (spec breakpoints-switch), and the state being edited
  // (view/setStyleState)
  const breakpoint = useEditorState((s) => activeBreakpoint(s));
  const state = useEditorState((s) => activeState(s.ui));
  // while a drag goes on (pointer.ts), an element's or a palette tile's, the message is the drop's own words, as its
  // label reads them on the canvas, or, off the page, that releasing cancels (spec palette-drag-insert, Problems in
  // Pager 1 and 2; the user's real-use audit, item 3.3)
  const dragging = usePointerValue('drag');
  const copying = useDuplicating();
  const words = dragging !== null ? dragMessages(document, dragging, copying) : [];
  // a message given during the drag that did not move where it lands (a level key refused: "Already at the top level")
  // stays until the place changes; a key that moved it is read in the drop's words
  const said = dragging === null ? '' : JSON.stringify(words);
  const [held, setHeld] = useState<{ words: string; message: Message | null; pinned: Message | null }>({ words: said, message, pinned: null });
  const next = dragging === null ? { words: '', message, pinned: null } : said !== held.words ? { words: said, message, pinned: null } : message !== held.message ? { words: said, message, pinned: message } : held;
  if (next !== held && (next.words !== held.words || next.message !== held.message || next.pinned !== held.pinned)) setHeld(next);
  const shown = dragging === null ? [message] : next.pinned !== null ? [next.pinned] : words.length > 0 ? words : [message];
  // the whole message, also its tooltip: a long one is cut on the bar
  // while the page is previewed, the bar says only its message: the editing controls (the breadcrumb, the size, the
  // zoom…) act on a canvas that is not shown (the audit's U-039, met again in the dogfooding pass)
  const preview = useEditorState((s) => previewing(s.ui));
  const text = shown.every((m) => m === null) ? null : shown.flatMap((m) => (m === null ? [] : [messageText(locale, m)])).join(' · ');
  return (
    <footer className="status-bar" data-region="status-bar">
      <span className="status-bar__message" role="status" aria-live="polite" title={text ?? undefined}>
        {text}
      </span>
      {preview ? null : (
        <Slots
          region="status-bar"
          render={(slot) => {
            // the region's item is the breadcrumb of the selection (1 the breadcrumb)
            if (slot.kind === 'door' && drawnAsOf(slot.entry) === 'item') {
              // the breadcrumb of the selection, then its size, the breakpoint and the state, and the element count
              return [
                <Breadcrumb key="breadcrumb" entry={slot.entry} />,
                <SelectionSize key="size" />,
                <span key="context" className="status-bar__item status-bar__context">
                  {t('statusBar.context', { breakpoint: breakpointName(breakpoint, t), state: t(state.labelKey as MessageId) })}
                </span>,
                <span key="count" className="status-bar__item">
                  {t(`status.elementCount.${pluralForm(locale, count)}`, { count })}
                </span>,
                <IncidentCount key="incidents" />,
              ];
            }
            if (slot.kind === 'menu' && slot.menu === 'zoom') {
              return (
                <MenuButton key={slot.menu} menu={slot.menu} anchor={slot.anchor}>
                  <ZoomValue />
                </MenuButton>
              );
            }
            if (slot.kind === 'menu' && slot.menu === 'language') {
              return (
                <MenuButton key={slot.menu} menu={slot.menu} anchor={slot.anchor}>
                  <span className="status-bar__language">{locale.toUpperCase()}</span>
                </MenuButton>
              );
            }
            return undefined;
          }}
        />
      )}
      <SaveStateLabel />
    </footer>
  );
}

// What the incident feed holds (the plan's T2: nothing hidden): a badge with the count and, in its title, what each
// incident says — an invariant a command broke, an error the page threw. It draws nothing at all while the feed is
// empty, which is the normal state; the browser checks and the development tools read the same feed through the test
// port, so an incident that no person notices still fails a check.
function IncidentCount() {
  const t = useT();
  const locale = useLocale();
  const feed = useSyncExternalStore(onIncident, incidents, incidents);
  if (feed.length === 0) return null;
  const detail = feed.map((one) => `${one.what}\n${one.detail}`).join('\n\n');
  return (
    <span className="status-bar__item status-bar__incidents" data-local="incident-count" role="status" title={detail}>
      <Icon name="triangle-alert" size="sm" />
      {t(`status.incidents.${pluralForm(locale, feed.length)}`, { count: feed.length })}
    </span>
  );
}

// The breadcrumb of the selection (spec status-bar; the audit's A3.20): every ancestor of the primary selected node,
// from the page root down to it, each a button that selects it (selection.select's status-bar door), with the
// element's icon and name; the primary itself wears the current mark. With several selected, the path to the
// nearest element that holds them all, which wears the mark (the canonical "Page › Main › Planos › Grade de cartões").
// Empty without a selection. It fits the room the bar's other items leave it (CLAUDE.md, rule G5): the page root and as
// many of the last levels as the room holds, the levels between folded into "…" (crumb-fold.ts), measured on an unseen
// copy of every crumb as the bar draws it, again whenever the room or the crumbs change.
function Breadcrumb({ entry }: { readonly entry: DoorEntry }) {
  const t = useT();
  const document = useEditorState((s) => s.document);
  const selection = useEditorState((s) => s.selection);
  const pathOf = (id: string): DocNode[] => {
    const path: DocNode[] = [];
    for (let at = locate(document, id); at !== null; at = at.parent === null ? null : locate(document, at.parent.id)) path.unshift(at.node);
    return path;
  };
  const paths = selection.map(pathOf);
  // the one node's own path; with several, their shared ancestors (each path less the node itself)
  const crumbs: DocNode[] = paths.length < 2 ? (paths[0] ?? []) : (paths[0] ?? []).slice(0, -1).filter((node, i) => paths.every((path) => path.length - 1 > i && path[i]?.id === node.id));
  const primary = paths.length < 2 ? (selection[0] ?? null) : (crumbs[crumbs.length - 1]?.id ?? null);
  const nav = useRef<HTMLElement>(null);
  const copy = useRef<HTMLSpanElement>(null);
  // how many of the last crumbs stand after the fold; null while all of them fit
  const [after, setAfter] = useState<number | null>(null);
  const drawn = [...crumbs.map((node) => `${node.id} ${node.type} ${node.name}`), primary ?? ''].join('\n');
  useLayoutEffect(() => {
    const own = nav.current;
    const measured = copy.current;
    if (own === null || measured === null) return undefined;
    const fit = () => {
      const widths = [...measured.querySelectorAll<HTMLElement>('[data-crumb]')].map((crumb) => crumb.getBoundingClientRect().width);
      const more = measured.querySelector<HTMLElement>('[data-crumb-more]')?.getBoundingClientRect().width ?? 0;
      setAfter(crumbsAfterFold(widths, more, own.clientWidth));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(own);
    return () => observer.disconnect();
  }, [drawn]);
  // each crumb named by its element, the name it shows (WCAG 2.5.3, label in name; every crumb was named "Select"),
  // which a name cut at the crumb's width is read whole in
  const crumb = (node: DocNode, i: number) => (
    <DoorControl key={node.id} entry={entry} args={{ target: node.id }} label={node.name} title={node.name} current={node.id === primary} className={i === 0 ? 'status-bar__crumb status-bar__crumb--first' : 'status-bar__crumb'}>
      <Icon name={elementIcon(node.type) ?? 'box'} size="xs" />
      <span className="door__label">{node.name}</span>
    </DoorControl>
  );
  const kept = after === null ? 0 : crumbs.length - after;
  return (
    <nav ref={nav} className="status-bar__breadcrumb" aria-label={t(panelName('layers'))}>
      {/* every crumb as the bar draws it, unseen, measured, in a box of no size that clips it (status-bar.css) */}
      <span className="status-bar__crumbs-measure-box" aria-hidden="true" inert>
        <span ref={copy} className="status-bar__crumbs-measure">
          {crumbs.map((node, i) => (
            <button key={node.id} type="button" tabIndex={-1} data-crumb="" className={`door door--item status-bar__crumb${i === 0 ? ' status-bar__crumb--first' : ''}${node.id === primary ? ' is-current' : ''}`}>
              <Icon name={elementIcon(node.type) ?? 'box'} size="xs" />
              <span className="door__label">{node.name}</span>
            </button>
          ))}
          <button type="button" tabIndex={-1} data-crumb-more="" className="door door--item status-bar__crumb status-bar__crumb--more">
            …
          </button>
        </span>
      </span>
      {after === null
        ? crumbs.map(crumb)
        : [...crumbs.slice(0, 1).map(crumb), <FoldedLevels key="folded" entry={entry} levels={crumbs.slice(1, kept)} />, ...crumbs.slice(kept).map((node, i) => crumb(node, kept + i))]}
    </nav>
  );
}

// The levels the breadcrumb folds (crumb-fold.ts): "…", a button whose menu holds them, each its level's door, as the
// crumbs are; the menu floats from the button, above it at the window's foot (float.ts).
function FoldedLevels({ entry, levels }: { readonly entry: DoorEntry; readonly levels: readonly DocNode[] }) {
  const t = useT();
  const locale = useLocale();
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const layer = useMenuLayer(button, list);
  const [at, setAt] = useState<Placed | null>(null);
  useLayoutEffect(() => {
    const from = button.current;
    const own = list.current;
    if (!layer.open || from === null || own === null) return;
    const edge = parseFloat(getComputedStyle(own).getPropertyValue('--space-4')) || 0;
    const { width, height } = own.getBoundingClientRect();
    setAt(floatBelow(from.getBoundingClientRect(), { width, height }, { width: window.innerWidth, height: window.innerHeight }, edge));
  }, [layer.open]);
  const name = t(`statusBar.foldedLevels.${pluralForm(locale, levels.length)}` as MessageId, { count: levels.length });
  const placed = at === null
    ? { position: 'fixed' as const, visibility: 'hidden' as const }
    : { position: 'fixed' as const, left: at.left, top: at.top, ...(at.maxHeight === undefined ? {} : { maxHeight: at.maxHeight, overflowY: 'auto' as const }) };
  return (
    <>
      <button ref={button} type="button" className="door door--item status-bar__crumb status-bar__crumb--more" aria-haspopup="menu" aria-expanded={layer.open} aria-label={name} title={name} onClick={layer.toggle}>
        …
      </button>
      {layer.open ? (
        <div ref={list} className="menu" role="menu" tabIndex={-1} aria-label={name} data-key-context="menu" style={placed}>
          {levels.map((node) => (
            <FoldedLevel key={node.id} entry={entry} node={node} close={layer.close} />
          ))}
        </div>
      ) : null}
    </>
  );
}

// One folded level in the menu: its crumb's door (selection.select), its element's icon and name.
function FoldedLevel({ entry, node, close }: { readonly entry: DoorEntry; readonly node: DocNode; readonly close: () => void }) {
  const door = useDoor(entry, { target: node.id });
  return (
    <button
      type="button"
      role="menuitem"
      className="menu__item"
      data-door={entry.ref}
      data-args={JSON.stringify({ target: node.id })}
      aria-disabled={door.available ? undefined : true}
      onClick={() => {
        close();
        if (door.available) door.run();
      }}
    >
      <span className="menu__icon">
        <Icon name={elementIcon(node.type) ?? 'box'} size="sm" />
      </span>
      <span className="menu__label">{node.name}</span>
    </button>
  );
}

// The size of the selection in page pixels (one element's, or the box holding several), re-measured on every frame
// while one is selected: the page's layout follows styles, the zoom and scrolling, so a measurement taken once goes
// stale.
function SelectionSize() {
  const t = useT();
  // every selected element (one text, a stable input): with several, the box that holds them all
  const ids = useEditorState((s) => s.selection.join(' '));
  const size = useSelectionSize(ids);
  if (size === null) return null;
  return (
    <span className="status-bar__item status-bar__size" data-size={`${size.width}x${size.height}`}>
      {t('statusBar.size', { width: size.width, height: size.height })}
    </span>
  );
}

// The save state, last in the bar (autosave: Not saved, Saving…, Saved, Save failed). A read-only display.
const SAVE_STATE_KEYS: Readonly<Record<SaveState, MessageId>> = { notSaved: 'status.save.notSaved', saving: 'status.save.saving', saved: 'status.save.saved', recoveryRequired: 'status.save.recoveryRequired' };
function SaveStateLabel() {
  const t = useT();
  const current = useSyncExternalStore(saveState.subscribe, saveState.get);
  // a write IndexedDB refused says why (spec unsaved-work-guard)
  const reason = useSyncExternalStore(saveState.subscribe, saveState.reason);
  // in cloud mode the project is saved to the cloud, not to this browser (src/editor/cloud/cloud.ts)
  const cloud = useSyncExternalStore(cloudState.subscribe, cloudState.get);
  if (cloud.project !== null) {
    return (
      <span className={`status-bar__item status-bar__save is-cloud-${cloud.save}`} data-save-state={`cloud-${cloud.save}`}>
        {t(CLOUD_SAVE_TEXT[cloud.save])}
      </span>
    );
  }
  return (
    <span className={`status-bar__item status-bar__save is-${current}`} data-save-state={current}>
      {reason !== null && current === 'notSaved' ? t('status.save.notSavedBecause', { reason }) : t(SAVE_STATE_KEYS[current])}
    </span>
  );
}

// The same state in the top bar, left of Preview (design/final: "● Saved" after Undo and Redo): a dot in the state's
// colour and its words; the status bar's label stays the one the tests and the unsaved-work guard read
export function TopBarSaveState() {
  const t = useT();
  const current = useSyncExternalStore(saveState.subscribe, saveState.get);
  // in cloud mode the cloud bar says it (src/editor/cloud/cloud-bar.tsx)
  const cloud = useSyncExternalStore(cloudState.subscribe, cloudState.get);
  if (cloud.project !== null) return null;
  return (
    <span className={`top-bar__saved is-${current}`} data-top-save-state={current}>
      {t(SAVE_STATE_KEYS[current])}
    </span>
  );
}
