// The canvas iframe: a same-origin iframe that only renders. It is sandboxed without scripts, has
// no event handler of its own and takes no pointer event: every pointer input arrives on the overlay above it
// (src/editor/input/pointer.ts). The renderer (src/editor/canvas/render/render.ts) builds the page into its document
// once and
// then applies each change of the document to it. One exception while a text is edited in place: the keymap listens
// for keys on the frame's window (the page itself still carries no event handler or event attribute), and the frame
// is not aria-hidden, as it holds the focus. The frame is scaled with the standard CSS zoom (Chrome 128+), so
// the page lays out at its breakpoint's width and the stage shows it at the canvas zoom. The frame is as tall as the
// whole page (the owner's request DCS-035: the canvas is an artboard), so the page never scrolls inside it: the camera
// moves the frame over the stage (view/camera.ts).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CommandId } from '../../generated/ids.ts';
import { reportCanvas } from '../../core/incidents.ts';
import { useCanvasMotion } from '../motion/use-canvas-motion.ts';
import { PageRenderer, renderModelFromManifest } from './render/render.ts';
import { travelWhole, visiblePage } from './reveal.ts';
import { applyInlineChange, plainText, type TextRange } from '../../core/text/inline.ts';
import { canvasValue } from '../../core/files/values.ts';
import { openedPage } from '../../core/project/pages.ts';
import { canvasDraft, registerDraftCapture, saveCanvasDraft } from '../persistence/drafts.ts';
import { installOsFileDrop } from '../input/pointer.ts';
import { manifest } from '../../manifest/runtime.ts';
import { activeState } from '../view/style-state.ts';
import { installPlayingLoop, timelinePreview } from '../timeline/preview.ts';
import { installKeymap } from '../input/keymap.ts';
import { useEditorState, useStore } from '../store.ts';
import { CanvasChrome } from './chrome.tsx';
import { Guides } from './guides.tsx';
import { SnapLines } from './snap-lines.tsx';
import { nodeBox, registerFrame } from './coordinates.ts';
import { TEXT_EDITING, openLinkPrompt, registerEditReader } from './text-edit.ts';
import { pageChanged } from './page-clock.ts';
import { wiring } from '../wiring.ts';

const MODEL = renderModelFromManifest(manifest.elements, manifest.properties, manifest.interactions);
// an empty page the renderer fills: no script, no style of the editor
const PAGE = '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>';

// the canvas's pan, the wheel's command: what brings the selection back into view after a breakpoint's new width
const PAN = manifest.doors.find((d) => d.door.kind === 'canvas-wheel' && 'dx' in d.command.args);
// probes in a row the page's height may grow with no change of the document before the canvas reports it (DEV)
const GROWTH_PROBES = 3;

// screen is the breakpoint's screen (its height, from properties.json): the page inside the frame takes it as its
// viewport, so vh, svh and dvh measure it whatever the zoom (the user's real-use audit, item 2.3), its fixed elements
// stand in it (the renderer's artboardCss), and the frame itself is as tall as the page (`extent`, measured here and
// reported through onExtent): the page never scrolls inside it (DCS-035).
export function CanvasFrame({ width, screen, zoom, onExtent }: { readonly width: number; readonly screen: number; readonly zoom: number; readonly onExtent: (extent: number) => void }) {
  const store = useStore();
  // the overlay over the page, where the chrome and the guides are drawn
  const overlay = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  // The page's height in page px, the breakpoint's screen at least: a layout measure, not editor state, which the
  // renderer measures (PageRenderer.extent: the page never grows by being measured).
  const [extent, setExtent] = useState(screen);
  // the height last reported (none yet: the first probe always reports)
  const shownExtent = useRef(0);
  // while a text is edited in place the frame holds the focus, so assistive technology must reach it
  const editing = useEditorState((s) => s.ui.textEdit.node !== null);
  // the page the editor shows (pages.switch): the renderer is built for it and rebuilt when it changes
  const page = useEditorState((s) => openedPage(s));
  // the page's motion (spec motion-preview): run mode and the Timeline's preview, inside this frame's page; called
  // before the renderer's effect so its listener lets go of the page before every render
  const frameWindow = useCallback(() => iframe.current?.contentWindow ?? null, []);
  useCanvasMotion(frameWindow, page);

  useEffect(() => {
    const frame = iframe.current;
    if (!frame) return;
    let stop = () => {};
    let stopFileDrop = () => {};
    const start = () => {
      const target = frame.contentDocument;
      // (a page between two documents has no window yet: its load starts it again)
      const pageWindow = target?.defaultView ?? null;
      if (!target || pageWindow === null) return;
      // the breakpoint's screen: the canvas resolves vh, svh, dvh and lvh against it (item 2.3); a source that names a
      // file of the project draws as its object URL (spec explorer-assets-use)
      // the page drawn as an artboard: its root pinned to the breakpoint's screen (artboardCss)
      const renderer = new PageRenderer(target, MODEL, page, { height: screen, width, artboard: true }, (name, value) => canvasValue(store.getState().document, name, value));
      renderer.mount(store.getState().document);
      // an image file dragged in from the operating system lands on the frame too: its own window reports the drag
      // the previous start's listeners go first (a load after a ready start runs start twice), then this one's drop
      stop();
      stopFileDrop = installOsFileDrop(store, pageWindow, true);
      // The page's height (extent), probed once at the next frame after whatever may change it: a change of the
      // document, a resource or a font loaded, a transition or an animation ended, a text typed in place, a preview of
      // a state or of the timeline, a box of the page resized; never after a selection, a hover or the camera alone.
      let probing = 0;
      // whether something other than a box of the page resized asked for this probe, and the probes in a row that
      // grew the page with nothing else asking (a page that grows by being measured: DEV's incident)
      let caused = true;
      let grew = 0;
      const probe = () => {
        probing = 0;
        const inside = target.defaultView;
        const measured = inside === null || !frame.isConnected ? null : renderer.extent();
        if (inside === null || measured === null) return;
        if (import.meta.env.DEV) {
          // (by more than the pixel a new zoom's snapping of the layout moves it)
          grew = !caused && measured > shownExtent.current + 1 ? grew + 1 : 0;
          if (grew === GROWTH_PROBES) reportCanvas('the canvas page grew with no change of the document', `${String(GROWTH_PROBES)} probes in a row grew the page's height, now ${String(measured)} px: a stylesheet measures the frame's own height (a viewport unit or a height media feature the canvas did not resolve)`);
        }
        caused = false;
        if (measured !== shownExtent.current) {
          shownExtent.current = measured;
          setExtent(measured);
          reportExtent.current(measured);
        }
        // innerHeight is whole px of the zoomed frame: at a fractional zoom (51 %) a 900 px screen reads 899, which is
        // rounding, not a short frame; 1 px is allowed, as the growth check allows it
        if (import.meta.env.DEV && inside.innerHeight < screen - 1) reportCanvas('the canvas frame is shorter than the screen', `the frame shows ${String(inside.innerHeight)} px of a ${String(screen)} px screen`);
      };
      const probeSoon = () => {
        caused = true;
        if (probing === 0) probing = requestAnimationFrame(probe);
      };
      // a box of the page resized (an image sized, a text grown): the page's own observer, in its own window, so its
      // notices come with the page's own layout
      const resized = new pageWindow.ResizeObserver(() => {
        if (probing === 0) probing = requestAnimationFrame(probe);
      });
      resized.observe(target.body);
      const stopDocument = store.subscribeDocument((change) => {
        renderer.apply(change.before, change.after, change.patches);
        pageChanged();
        probeSoon();
      });
      // the page may have changed for its readers (canvas/page-clock.ts): the store changed (a selection, a breakpoint,
      // a zoom, the camera), a resource of the page loaded (an image, which sizes its box; load does not bubble, so it
      // is heard as it goes down), a font arrived; and it was just mounted
      const stopTicks = store.subscribe(pageChanged);
      const loaded = () => {
        pageChanged();
        probeSoon();
      };
      target.addEventListener('load', loaded, true);
      // The page never scrolls inside its frame (DCS-035): a scroll there (a focus, a scrollIntoView of the page's own)
      // would move every box away from where the camera shows it. Reported in development.
      const scrolled = () => {
        pageChanged();
        const inside = target.defaultView;
        if (import.meta.env.DEV && inside !== null && (inside.scrollX !== 0 || inside.scrollY !== 0)) reportCanvas('the canvas page scrolled inside its frame', `scrolled to ${String(inside.scrollX)}, ${String(inside.scrollY)}`);
      };
      target.addEventListener('scroll', scrolled, { passive: true });
      // so does the frame itself, resized (the fit zoom follows the stage, which no command changes)
      const framed = new ResizeObserver(pageChanged);
      framed.observe(frame);
      target.fonts.addEventListener('loadingdone', loaded);
      // a value read while the page's own transition ran is read again once it ends
      target.addEventListener('transitionend', loaded);
      target.addEventListener('animationend', loaded);
      // a text typed in place grows its element before the document holds it
      target.addEventListener('input', probeSoon);
      pageChanged();
      probeSoon();
      // A text edited in place (text-edit.ts): the renderer marks, focuses and reads the edited element, and while the
      // edit lasts the keymap reads the keys on the frame's window, where they arrive; once it ends, the focus leaves
      // the frame for the editor's page body (the canvas key context).
      let edited: string | null = null;
      let lineBreaks = store.getState().ui.textEdit.lineBreaks;
      let selectAlls = store.getState().ui.textEdit.selectAlls;
      let changes = store.getState().ui.textEdit.changes;
      // while the link prompt holds the focus, the text selection it acts on, as a range of the edited text's
      // characters
      let prompting = false;
      let kept: TextRange | null = null;
      let stopKeys = () => {};
      const captureDraft = () => {
        const node = store.getState().ui.textEdit.node;
        const content = renderer.editedContent();
        if (node && content) saveCanvasDraft(node, content.runs, content.range);
      };
      target.addEventListener('input', captureDraft);
      const stopDraftCapture = registerDraftCapture(captureDraft);
      target.addEventListener('selectionchange', captureDraft);
      const followEdit = () => {
        const ui = store.getState().ui;
        const edit = ui.textEdit;
        if (edit.node !== edited) {
          edited = edit.node;
          stopKeys();
          stopKeys = () => {};
          renderer.editText(store.getState().document, edit.node, TEXT_EDITING);
          const recovered = edit.node === null ? null : canvasDraft(edit.node);
          if (recovered) renderer.showEdited(recovered.runs, recovered.range ?? { start: 0, end: 0 });
          const view = frame.contentWindow;
          if (edit.node !== null && view) stopKeys = installKeymap(store, view);
          else if (frame.ownerDocument.activeElement === frame) frame.blur();
        }
        if (edit.lineBreaks !== lineBreaks) {
          lineBreaks = edit.lineBreaks;
          if (edit.node !== null) {
            renderer.insertLineBreak();
            captureDraft();
          }
        }
        if (edit.selectAlls !== selectAlls) {
          selectAlls = edit.selectAlls;
          if (edit.node !== null) renderer.selectEditedText();
        }
        // the link prompt opens: the selection it acts on is kept, as the prompt takes the focus
        const open = openLinkPrompt(ui) !== null;
        if (open && !prompting) kept = renderer.editedContent()?.range ?? null;
        // a change of the marks (spec text-inline-formatting): applied to the edited text's runs over its selection (or
        // the one the link prompt kept), and drawn with the range it leaves selected
        if (edit.changes !== changes) {
          changes = edit.changes;
          const content = edit.node !== null && edit.change !== null ? renderer.editedContent() : null;
          if (content !== null && edit.change !== null) {
            const end = plainText(content.runs).length;
            const after = applyInlineChange(content.runs, (prompting ? kept : null) ?? content.range ?? { start: end, end }, edit.change);
            renderer.showEdited(after.runs, after.range);
            captureDraft();
          }
        } else if (prompting && !open && edit.node !== null) renderer.focusEdited(kept);
        if (!open) kept = null;
        prompting = open;
      };
      const stopEdit = store.subscribe(followEdit);
      // a closed Details or Dialog is drawn open while it or something inside it is selected (editor-only)
      const reveal = () => renderer.reveal(store.getState().document, store.getState().selection);
      const stopReveal = store.subscribe(reveal);
      reveal();
      // the selected elements drawn as if the state the editor edits held (editor-only, spec state-styles), and the
      // animation the timeline previews drawn at its playhead (editor-only, spec timeline-preview)
      const preview = () => {
        const s = store.getState();
        const state = activeState(s.ui);
        renderer.previewState(s.document, s.selection, state.pseudo === null ? null : state.id);
        renderer.previewTimeline(s.document, timelinePreview(s));
      };
      const stopPreview = store.subscribe(preview);
      preview();
      const stopReader = registerEditReader(() => renderer.editedContent());
      followEdit();
      stop = () => {
        stopTicks();
        cancelAnimationFrame(probing);
        probing = 0;
        resized.disconnect();
        target.removeEventListener('load', loaded, true);
        target.removeEventListener('scroll', scrolled);
        framed.disconnect();
        target.fonts.removeEventListener('loadingdone', loaded);
        target.removeEventListener('transitionend', loaded);
        target.removeEventListener('animationend', loaded);
        target.removeEventListener('input', probeSoon);
        stopDraftCapture();
        target.removeEventListener('input', captureDraft);
        target.removeEventListener('selectionchange', captureDraft);
        stopDocument();
        stopReveal();
        stopPreview();
        stopEdit();
        stopReader();
        stopKeys();
        stopFileDrop();
      };
    };
    // the srcdoc page may be ready already (a fast load) or still loading
    if (frame.contentDocument?.readyState === 'complete' && frame.contentDocument.body) start();
    frame.addEventListener('load', start);
    return () => {
      frame.removeEventListener('load', start);
      stop();
    };
  }, [store, screen, width, page]);

  useEffect(() => registerFrame(iframe.current), []);

  // the playhead walks while the timeline plays (spec timeline-preview): the loop is the frame's own, so the marker
  // follows the running animation and Pause freezes where the eye left it
  useEffect(() => installPlayingLoop(store), [store]);

  // the parent's measure of the page's height (shell/canvas.tsx), read by the probe above
  const reportExtent = useRef(onExtent);
  useLayoutEffect(() => {
    reportExtent.current = onExtent;
  }, [onExtent]);

  // A new width (another breakpoint) lays the page out anew, so the page line the camera kept on top stands on other
  // content: with a selection, the selected element is what the view keeps, brought whole into what the person sees of
  // the page (under the frame's tabs pinned to the stage's top: reveal.ts visiblePage) by the least travel of the
  // camera, its top when it is taller than the view (DEF-0622: Desktop to Tablet left the selected heading's top and
  // its label away). The page settles over the next frames (its height probed anew, the breakpoint's band drawn): the
  // element is measured each frame and the camera moves once it stood still two frames. A move of the camera in the
  // meantime is the person's (a wheel right after the switch) and ends the wait, never pulled back.
  const shownWidth = useRef(width);
  useLayoutEffect(() => {
    const frame = iframe.current;
    if (shownWidth.current === width) return;
    shownWidth.current = width;
    const primary = store.getState().selection[0];
    if (!frame || primary === undefined || PAN === undefined) return;
    const pan = PAN;
    const camera = store.getState().ui.camera;
    const inset = parseFloat(getComputedStyle(frame).getPropertyValue('--space-8')) || 0;
    let left = 12;
    let still = 0;
    let last: number | null = null;
    let request = requestAnimationFrame(function again() {
      if (left <= 0 || store.getState().ui.camera !== camera) return;
      left -= 1;
      const box = nodeBox(frame, primary);
      const view = visiblePage();
      if (box !== null && view !== null) {
        still = last !== null && Math.abs(box.y - last) <= 0.5 ? still + 1 : 0;
        last = box.y;
        if (still >= 2) {
          const travel = travelWhole(box.y, box.y + box.height, view.top, view.bottom, inset);
          if (Math.abs(travel) > 0.5) (store.dispatch as (command: CommandId, args: unknown) => unknown)(pan.command.id, { dx: 0, dy: Math.round(travel) });
          return;
        }
      }
      request = requestAnimationFrame(again);
    });
    return () => cancelAnimationFrame(request);
  }, [width, store]);

  return (
    <div className="frame__view">
      <iframe ref={iframe} className="frame__page" srcDoc={PAGE} sandbox="allow-same-origin" tabIndex={-1} aria-hidden={editing ? undefined : true} style={{ width, height: extent, zoom }} />
      <div className="frame__overlay" data-canvas-overlay ref={overlay}>
        <CanvasChrome />
        <Guides overlay={overlay} />
        <SnapLines overlay={overlay} />
        {/* the layers the installed modules draw over the page (app/modules-view.ts) */}
        {wiring().canvasLayers.map((Layer, i) => (
          <Layer key={i} />
        ))}
      </div>
    </div>
  );
}
