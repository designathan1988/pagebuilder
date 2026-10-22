// The preview (preview-bar; spec preview-mode): while the editor previews
// (view/preview.ts), the preview bar replaces the top bar (its doors: the breakpoints, Exit preview, Export) and the
// page is shown as it is exported (core/export/export.ts previewPage), at the active breakpoint's width and at 100 % —
// in a window narrower than that width, laid out at the breakpoint's width and scaled down to the window's, centred,
// the bar saying the scale (the owner's choice for V-11 of 2026-10-21: the page's right part was out of view) —
// in a frame of its own that runs it as a browser would (its scripts and embeds, its hover and details) and opens its
// links in a new tab:
// sandboxed, never the editing canvas. No selection, guides, handles, docks or rulers are drawn.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { message } from '../../core/commands/registry.ts';
import type { DocumentJson, Page } from '../../core/document/model.ts';
import { templatePaths } from '../../core/data/bindings.ts';
import { previewPage } from '../../core/export/export.ts';
import type { DispatchResult } from '../../core/store/store.ts';
import type { CommandId } from '../../generated/ids.ts';
import { siteScripts } from '../forms/script.ts';
import { openedPage } from '../../core/project/pages.ts';
import { viewportWidth } from '../view/breakpoints.ts';
import { doorOf } from '../data/controls.tsx';
import { MODEL_RULES, useEditorState, useStore } from '../store.ts';
import { useT } from '../text.ts';
import { Slots } from './slots.tsx';
import { breakpointTabSlot, PreviewBreakpointTab } from './breakpoint-tabs.tsx';

export function PreviewBar() {
  const t = useT();
  const scale = useShownScale();
  return (
    <header className="preview-bar" data-region="preview-bar" data-key-context="preview">
      <Slots region="preview-bar" render={(slot) => breakpointTabSlot('preview-bar', slot, (entry, breakpoint, args) => <PreviewBreakpointTab key={`${entry.ref}:${breakpoint.id}`} entry={entry} breakpoint={breakpoint} args={args} />)} />
      {scale < 1 ? <span className="preview-bar__scale" data-region="preview-scale">{t('preview.scaled', { zoom: Math.round(scale * 100) })}</span> : null}
    </header>
  );
}

// The scale the preview shows its page at, one per editor (its store): 1 while the preview's stage holds the
// breakpoint's width, below that the stage's width over the breakpoint's; PreviewPage measures it, the bar says it.
interface ShownScale {
  value: number;
  readonly listeners: Set<() => void>;
}
const SCALES = new WeakMap<object, ShownScale>();
function shownScaleOf(store: object): ShownScale {
  const held = SCALES.get(store);
  if (held !== undefined) return held;
  const made: ShownScale = { value: 1, listeners: new Set() };
  SCALES.set(store, made);
  return made;
}
function setShownScale(store: object, value: number): void {
  const shown = shownScaleOf(store);
  if (shown.value === value) return;
  shown.value = value;
  for (const listener of [...shown.listeners]) listener();
}
function useShownScale(): number {
  const shown = shownScaleOf(useStore());
  return useSyncExternalStore(
    (listener) => {
      shown.listeners.add(listener);
      return () => void shown.listeners.delete(listener);
    },
    () => shown.value
  );
}

export function PreviewPage() {
  const t = useT();
  const document = useEditorState((s) => s.document);
  const width = useEditorState((s) => viewportWidth(s));
  // the page the editor has open, never the project's first: previewing a second page must show that page (the
  // interface audit F03), and the memo re-runs when the open page changes
  const page = useEditorState((s) => openedPage(s));
  const html = useMemo(() => withPreviewStore(withKeyRelay(previewPage(document, MODEL_RULES, page, siteScripts)), PREVIEW_KEPT), [document, page]);
  const frame = useRef<HTMLIFrameElement>(null);
  const store = useStore();
  useEffect(() => forgetPreviewValuesOnLoad(store), [store]);
  // the stage's size, measured before the first paint and on every resize: the page is laid out at the breakpoint's
  // width and, where the stage is narrower, zoomed down to the stage's width (the frame's height grows by as much, so
  // the zoomed frame still fills the stage's height)
  const stage = useRef<HTMLElement>(null);
  const [room, setRoom] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = stage.current;
    if (element === null) return;
    const measure = () => setRoom({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const scale = room.width > 0 && width > room.width ? room.width / width : 1;
  useLayoutEffect(() => setShownScale(store, scale), [store, scale]);
  useEffect(() => () => setShownScale(store, 1), [store]);
  // a key the page relays (KEY_RELAY) is pressed again on the preview bar, in the preview's key context, so the keymap
  // runs its door as if the editor had the focus; a page of the site the page's application goes to (app.go, the
  // audit's LOGIC-22) is opened as the Explorer's page row opens it, and the preview follows the open page
  useEffect(() => {
    const relay = (event: MessageEvent) => {
      // only the preview frame's own window is heard (the audit's AUD-10: every sandboxed frame reads the opaque origin
      // "null", an embed sandboxed inside the page as well, so the origin alone named no one; MDN, postMessage: check
      // the sender), and only the two keys it relays and the page it asks for
      // eslint-disable-next-line builder/frame-owner -- the preview's own frame: its window is compared, never read
      if (event.source === null || event.source !== frame.current?.contentWindow) return;
      const stored = keptValue((event.data as { builderPreviewStore?: unknown } | null)?.builderPreviewStore);
      if (stored !== null) {
        if (stored.value === null) PREVIEW_KEPT.delete(stored.key);
        else PREVIEW_KEPT.set(stored.key, stored.value);
        return;
      }
      // a link of the page asks whether the preview goes (builderPreviewGoes: the page's transition plays only then) or
      // asks to go (builderPreviewPage, from a link or the page's application); every ask the preview does not follow
      // (the open page, a page the project does not have) is answered, so the page that asked shows itself again
      // (core/motion/page-transition.ts)
      const sent = event.data as { builderPreviewGoes?: unknown; builderPreviewPage?: unknown } | null;
      const goes = sent?.builderPreviewGoes;
      const asked = typeof goes === 'string' ? goes : sent?.builderPreviewPage;
      if (typeof asked === 'string') {
        const state = store.getState();
        const go = previewGo(state.document, openedPage(state), asked);
        const answer = (value: { readonly goes: boolean; readonly fragment?: string }): void => (event.source as WindowProxy).postMessage({ builderPreviewAnswer: value }, '*');
        if (!go.goes) {
          if (go.missing) store.notice(message('status.preview.noPage', { address: asked }));
          answer({ goes: false, fragment: go.fragment });
          return;
        }
        if (typeof goes === 'string') {
          answer({ goes: true });
          return;
        }
        const dispatch = store.dispatch as (id: CommandId, args: unknown) => DispatchResult;
        dispatch(OPEN_PAGE.command.id as CommandId, { ...OPEN_PAGE.door.args, page: go.page.tree.id });
        // an item page opens as the editor opens it: its template, showing that item (pages.previewItem)
        if (go.item !== undefined && go.page.tree.dataItem?.item !== go.item) dispatch(PREVIEW_ITEM.command.id as CommandId, { ...PREVIEW_ITEM.door.args, item: go.item });
        return;
      }
      const key = relayedKey((event.data as { builderPreviewKey?: unknown } | null)?.builderPreviewKey);
      const bar = window.document.querySelector('[data-region="preview-bar"]');
      if (key === null || bar === null) return;
      bar.dispatchEvent(new KeyboardEvent('keydown', { ...key, bubbles: true, cancelable: true }));
    };
    window.addEventListener('message', relay);
    return () => window.removeEventListener('message', relay);
  }, [store]);
  return (
    <main ref={stage} className={`preview-stage${scale < 1 ? ' is-scaled' : ''}`}>
      <iframe ref={frame} className="preview__page" data-region="preview-page" title={t('preview.pageLabel')} srcDoc={html} sandbox="allow-scripts allow-popups allow-forms allow-popups-to-escape-sandbox" style={scale < 1 ? { width, height: room.height / scale, zoom: scale } : { width }} />
    </main>
  );
}

// The page runs sandboxed in its own origin, so the editor hears none of its keys: once a visitor clicked in it, Escape
// (and Ctrl+Enter) no longer left the preview (the dogfooding pass). The preview's page alone — never the export —
// relays those two to the editor, unless the page uses Escape itself (a modal dialog open in it closes first).
const KEY_RELAY = `<script>addEventListener('keydown', function (e) {
  var leave = e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey));
  if (!leave || (e.key === 'Escape' && document.querySelector('dialog:modal'))) return;
  parent.postMessage({ builderPreviewKey: { key: e.key, code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey } }, '*');
}, true);</script>`;
// the key a message relays, read field by field: Escape, or Enter with Ctrl or Cmd, as KEY_RELAY sends them
function relayedKey(sent: unknown): KeyboardEventInit | null {
  if (sent === null || typeof sent !== 'object') return null;
  const { key, code, ctrlKey, metaKey, shiftKey, altKey } = sent as Record<string, unknown>;
  if (key !== 'Escape' && key !== 'Enter') return null;
  const flag = (value: unknown): boolean => value === true;
  return { key, code: typeof code === 'string' ? code : '', ctrlKey: flag(ctrlKey), metaKey: flag(metaKey), shiftKey: flag(shiftKey), altKey: flag(altKey) };
}

// the door that opens a page (the Explorer's page row, pages.switch): the preview asks it for the page app.go names
const OPEN_PAGE = doorOf('explorer-pages', 'page-row');
// the door that shows an item on its template page (the Data panel's Pages section, pages.previewItem)
const PREVIEW_ITEM = doorOf('data-pages', 'preview-item');

// Where a link of the previewed page leads: a page of the project, or an item page the export writes from a template
// (the template, with the item), which the preview goes to; or nowhere new — the open page itself (the item it shows,
// for a template), scrolled to the link's fragment, or a page the project does not have (`missing`).
export type PreviewGo =
  | { readonly goes: true; readonly page: Page; readonly item?: string }
  | { readonly goes: false; readonly missing: boolean; readonly fragment: string };
export function previewGo(document: DocumentJson, opened: number, address: string): PreviewGo {
  const from = document.pages[opened];
  if (from === undefined) return { goes: false, missing: true, fragment: '' };
  const root = new URL('https://site.invalid/');
  const resolved = new URL(address, new URL(from.file, root));
  const fragment = fragmentOf(resolved.hash);
  let page = pageAt(document.pages, from.file, address);
  let item: string | undefined;
  if (page === undefined && resolved.origin === root.origin) {
    for (const [collection, paths] of templatePaths(document)) {
      for (const [id, path] of paths) {
        if (new URL(path, root).pathname !== resolved.pathname) continue;
        page = document.pages.find((one) => one.tree.dataItem?.template === true && one.tree.dataItem.collection === collection);
        item = id;
      }
    }
  }
  if (page === undefined) return { goes: false, missing: true, fragment };
  if (page === from && (item === undefined || from.tree.dataItem?.item === item)) return { goes: false, missing: false, fragment };
  return item === undefined ? { goes: true, page } : { goes: true, page, item };
}
// a URL's fragment as the page's ids are written (percent-decoded), without its "#"
function fragmentOf(hash: string): string {
  const text = hash.slice(1);
  try {
    return decodeURIComponent(text);
  } catch {
    // a malformed escape: the fragment as written, which an id can hold too
    return text;
  }
}

// The page of the project an address of the open page names: read against the open page's folder ("../", "./"),
// without its query and its fragment, as the exported site's browser reads the link.
export function pageAt(pages: readonly Page[], from: string, address: string): Page | undefined {
  // both sides are read as the browser writes a path (percent-encoded), so a name with spaces or accents matches
  const root = new URL('https://site.invalid/');
  const resolved = new URL(address, new URL(from, root));
  if (resolved.origin !== root.origin) return undefined;
  return pages.find((page) => new URL(page.file, root).pathname === resolved.pathname);
}

const withKeyRelay = (html: string): string => (html.includes('</body>') ? html.replace('</body>', `${KEY_RELAY}</body>`) : html + KEY_RELAY);

// The store the preview lends its page (the user's final-use audit, USE-8): the page runs sandboxed in an opaque
// origin, where localStorage throws, so the site's runtimes (js/widgets.js, js/app-layer/runtime.js) logged that this
// browser keeps no values, and a kept variable started over at every preview. They keep their values in this store
// instead (globalThis.__builderPreviewStore), which starts with the values the editor holds and sends every write to
// the editor, which keeps them (PREVIEW_KEPT) while the editor is open: the next page the preview opens, and the next
// preview, start with them, as a site's next page and next visit start with what the visitor's browser keeps. Written
// first in the head, before any script of the page; the preview's page alone has it, never the export.
const PREVIEW_KEPT = new Map<string, string>();
// The values belong to the open project: a project opened, started or restored (a load replaces the pages whole,
// src/core/store/store.ts) starts its previews with none, as a visitor of another site starts with nothing kept.
const WATCHED = new WeakSet<object>();
function forgetPreviewValuesOnLoad(store: ReturnType<typeof useStore>): void {
  if (WATCHED.has(store)) return;
  WATCHED.add(store);
  store.subscribeDocument((change) => {
    const [only] = change.patches;
    if (change.patches.length === 1 && only !== undefined && only.op === 'replace' && only.path.length === 1 && only.path[0] === 'pages') PREVIEW_KEPT.clear();
  });
}
const previewStoreScript = (kept: ReadonlyMap<string, string>): string => `<script>(function () {
  var held = ${JSON.stringify(Object.fromEntries(kept)).replace(/</g, '\\u003c')};
  var send = function (key, value) { parent.postMessage({ builderPreviewStore: { key: key, value: value } }, '*'); };
  window.__builderPreviewStore = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(held, key) ? held[key] : null; },
    setItem: function (key, value) { held[key] = String(value); send(key, held[key]); },
    removeItem: function (key) { delete held[key]; send(key, null); }
  };
})();</script>`;
const withPreviewStore = (html: string, kept: ReadonlyMap<string, string>): string => html.replace('<head>', () => `<head>\n${previewStoreScript(kept)}`);
// a write the page's store sends: a key and its text, or null when the key is removed
function keptValue(sent: unknown): { readonly key: string; readonly value: string | null } | null {
  if (sent === null || typeof sent !== 'object') return null;
  const { key, value } = sent as Record<string, unknown>;
  if (typeof key !== 'string' || (typeof value !== 'string' && value !== null)) return null;
  return { key, value };
}
