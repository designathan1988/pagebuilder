// The rulers (spec rulers): the top and left bands of the canvas, drawing the marks rulers.ts places.
// They follow the zoom, the pan and the page's scroll, highlight the extent of the primary selected element on both
// bands and mark the pointer while it is over the canvas; they are measured from the frame's geometry
// (coordinates.ts), which is what the page shows, by the page clock and the stage's changes, and they change nothing.
import { useEffect, useRef, useState } from 'react';
import { useT } from '../text.ts';
import { useEditorState } from '../store.ts';
import { canvasFrame, geometryOf, nodeBox, pageAnimating } from './coordinates.ts';
import { onPageChange } from './page-clock.ts';
import { rulerMarks, type Band, type RulerMeasure } from './rulers.ts';
import { usePointerValue } from '../input/pointer/use-views.ts';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function BandMarks({ band, axis }: { readonly band: Band | undefined; readonly axis: 'x' | 'y' }) {
  if (!band) return null;
  const place = (at: number) => (axis === 'x' ? { left: at } : { top: at });
  return (
    <>
      {band.ticks.map((t) => (
        <span key={`t${t.value}`} className={`ruler__tick${t.major ? ' is-major' : ''}`} style={place(t.at)} />
      ))}
      {band.labels.map((l) => (
        <span key={`l${l.value}`} className="ruler__mark" style={place(l.at)}>
          {l.value}
        </span>
      ))}
      {band.selection ? (
        <span
          className="ruler__selection"
          data-region={axis === 'x' ? 'ruler-selection' : undefined}
          style={axis === 'x' ? { left: band.selection.at, width: band.selection.length } : { top: band.selection.at, height: band.selection.length }}
        />
      ) : null}
      {band.pointer !== null ? <span className="ruler__pointer" style={place(band.pointer)} /> : null}
    </>
  );
}

export function Rulers() {
  const top = useRef<HTMLDivElement>(null);
  const left = useRef<HTMLDivElement>(null);
  const [measure, setMeasure] = useState<Omit<RulerMeasure, 'pointer'> | null>(null);
  const primary = useEditorState((s) => s.selection[0] ?? null);
  // hidden by View › Guides & Grids (view.toggleRulers, a preference)
  const hidden = useEditorState((s) => s.ui.preferences.rulersHidden === true);
  const pointer = usePointerValue('canvasPointer');
  // a guide dragged over its own ruler: the ruler says a release deletes it (spec guides-manual, Problems in Pager 1)
  const dropping = usePointerValue('guideOverRuler');
  const t = useT();
  const hint = <span className="ruler__hint">{t('canvas.guide.deleteHint')}</span>;

  // Measured by the page clock (page-clock.ts), as the outlines are (view-overlays.tsx, OTM-005): when the page may
  // have changed (a store change: the camera's pan and zoom, the breakpoint, the selection; a scroll, a load, a font,
  // the frame resized), when a control of the stage moves (the frame placed anew by the camera), when the bands or
  // their column are resized, then at every frame while the measure still changes or the page moves on its own,
  // stopping once both are still. It read the frame's box at every frame, always (OTM-006).
  useEffect(() => {
    let request = 0;
    // the measure last read: one that changes it is followed by another
    let last: Omit<RulerMeasure, 'pointer'> | null = null;
    const measure = (): boolean => {
      const iframe = canvasFrame();
      const g = iframe ? geometryOf(iframe) : null;
      const x = top.current?.getBoundingClientRect();
      const y = left.current?.getBoundingClientRect();
      if (!iframe || !g || !x || !y) return false;
      const next = {
        x: { start: x.left, length: x.width },
        y: { start: y.top, length: y.height },
        origin: { x: g.left - g.scrollX * g.zoom, y: g.top - g.scrollY * g.zoom },
        zoom: g.zoom,
        selected: primary === null ? null : nodeBox(iframe, primary),
      };
      const moved = last === null || !same(last, next);
      last = next;
      setMeasure((before) => (same(before, next) ? before : next));
      return moved;
    };
    let running = false;
    // frames measured with nothing moving: a camera's glide moves the frame over several frames, so it stops after a
    // few still ones, as the outlines do
    let still = 0;
    const STILL_FRAMES = 4;
    const follow = () => {
      still = measure() ? 0 : still + 1;
      if (still < STILL_FRAMES || pageAnimating()) request = requestAnimationFrame(follow);
      else running = false;
    };
    const tick = () => {
      still = 0;
      if (running) return;
      running = true;
      request = requestAnimationFrame(follow);
    };
    tick();
    const stop = onPageChange(tick);
    // the stage's controls drawn, removed or moved (the frame's place set by the camera): the stage is the bands'
    // sibling (shell/canvas.tsx)
    const stage = top.current?.parentElement?.querySelector('[data-canvas-stage]');
    const drawn = new MutationObserver(tick);
    if (stage) drawn.observe(stage, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'] });
    // the bands' own size and their column's (a sidebar opened or closed, the window resized, a bar above the canvas
    // grown or gone): every move of a band changes one of them
    const resized = new ResizeObserver(tick);
    for (const band of [top.current, left.current, top.current?.parentElement]) if (band) resized.observe(band);
    return () => {
      cancelAnimationFrame(request);
      stop();
      drawn.disconnect();
      resized.disconnect();
    };
  }, [primary]);

  const marks = measure ? rulerMarks({ ...measure, pointer }) : null;
  return (
    <>
      <div className="ruler ruler--corner" hidden={hidden} />
      <div className="ruler ruler--x" ref={top} data-region="rulers" data-ruler="horizontal" hidden={hidden}>
        <BandMarks band={marks?.x} axis="x" />
        {dropping === 'horizontal' ? hint : null}
      </div>
      <div className="ruler ruler--y" ref={left} data-ruler="vertical" hidden={hidden}>
        <BandMarks band={marks?.y} axis="y" />
        {dropping === 'vertical' ? hint : null}
      </div>
    </>
  );
}
