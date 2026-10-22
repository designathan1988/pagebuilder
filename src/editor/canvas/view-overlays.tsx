// What the view switches draw over the page (spec canvas-outlines-zones; the switches: src/editor/view/overlays.ts):
// with Outlines, a dashed box around every element; with Zones, the padding of every container, tinted, and the
// content area of every empty container, marked as a drop area. With both off, an empty container still shows its box
// (a region the Layout tool drew, a section not filled yet): nothing in it would show where it is. Measured from the
// page's elements (coordinates.ts) by the page clock while there is something to draw; drawn in the canvas chrome,
// never in the page.
import { memo, useEffect, useRef, useState } from 'react';
import { manifest } from '../../manifest/runtime.ts';
import { useEditorState } from '../store.ts';
import { canvasFrame, elementBoxes, pageAnimating, type ElementBox } from './coordinates.ts';
import { onPageChange } from './page-clock.ts';

// the elements that hold elements (elements.json: content "children")
const CONTAINERS = new Set(manifest.elements.elements.filter((e) => e.content === 'children').map((e) => e.id));

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// a container's padding as four bands inside its border box, and its content box
function paddingBands(b: ElementBox): Rect[] {
  const { box, padding } = b;
  return [
    { x: box.x, y: box.y, width: box.width, height: padding.top },
    { x: box.x, y: box.y + box.height - padding.bottom, width: box.width, height: padding.bottom },
    { x: box.x, y: box.y + padding.top, width: padding.left, height: box.height - padding.top - padding.bottom },
    { x: box.x + box.width - padding.right, y: box.y + padding.top, width: padding.right, height: box.height - padding.top - padding.bottom },
  ].filter((r) => r.width > 0 && r.height > 0);
}
const contentBox = (b: ElementBox): Rect => ({ x: b.box.x + b.padding.left, y: b.box.y + b.padding.top, width: b.box.width - b.padding.left - b.padding.right, height: b.box.height - b.padding.top - b.padding.bottom });

interface TreeNode {
  readonly type: string;
  readonly children: readonly TreeNode[];
  readonly text?: unknown;
}
// whether a tree holds a container with no element and no text in it
function holdsEmpty(node: TreeNode): boolean {
  if (CONTAINERS.has(node.type) && node.children.length === 0 && (node.text === undefined || node.text === null || node.text === '')) return true;
  return node.children.some(holdsEmpty);
}

export const ViewOverlays = memo(function ViewOverlays() {
  const outlines = useEditorState((s) => s.ui.preferences.outlines === true);
  const zones = useEditorState((s) => s.ui.preferences.zones === true);
  const types = useEditorState((s) => s.document);
  const layer = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<readonly ElementBox[]>([]);
  // a container with nothing in it, somewhere in the project: its box is drawn whatever the switches
  const placeholders = useEditorState((s) => s.document.pages.some((page) => holdsEmpty(page.tree)));

  // Measured by the page clock (page-clock.ts), as the selection's chrome is (chrome.tsx useChromeLayout): when the
  // page may have changed (a store change, the camera's included; a scroll, a load, a font, the frame resized), and
  // when the stage's own controls move (the frame placed anew by the camera, a band coming over the page), then at
  // every frame while the boxes still move or the page moves on its own, stopping once both are still. It measured
  // every element's box at every frame, for as long as an empty container stood anywhere in the project.
  useEffect(() => {
    if (!outlines && !zones && !placeholders) return;
    let request = 0;
    // the boxes last measured: a measure that changes them is followed by another
    let last: readonly ElementBox[] | null = null;
    const measure = (): boolean => {
      const iframe = canvasFrame();
      const origin = layer.current?.getBoundingClientRect();
      if (!iframe || !origin) return false;
      const next = elementBoxes(iframe).map((b) => ({ ...b, box: { ...b.box, x: b.box.x - origin.x, y: b.box.y - origin.y } }));
      const moved = last === null || !same(last, next);
      last = next;
      setBoxes((before) => (same(before, next) ? before : next));
      return moved;
    };
    let running = false;
    // frames measured with nothing moving: a box drawn from a measure is committed a frame later, so it stops after a
    // few still frames, as the chrome does
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
    // a control of the stage drawn, removed or moved (the frame's place, the bands over the page): the boxes are read
    // again; the boxes this layer draws itself are no cause
    const stage = layer.current?.closest('[data-canvas-stage]');
    const drawn = new MutationObserver((records) => {
      if (records.some((record) => !(layer.current?.contains(record.target) ?? false))) tick();
    });
    if (stage) drawn.observe(stage, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'] });
    return () => {
      cancelAnimationFrame(request);
      stop();
      drawn.disconnect();
    };
  }, [outlines, zones, placeholders]);

  // each element's type, to tell a container
  const typeOf = new Map<string, string>();
  for (const page of types.pages) {
    const visit = (node: { id: string; type: string; children: readonly { id: string; type: string; children: readonly unknown[] }[] }) => {
      typeOf.set(node.id, node.type);
      for (const child of node.children) visit(child as typeof node);
    };
    visit(page.tree);
  }
  const containers = boxes.filter((b) => CONTAINERS.has(typeOf.get(b.id) ?? ''));
  const zoneRects = containers.flatMap((b) => [
    ...paddingBands(b).map((r, j) => ({ key: `${b.id}-p${j}`, rect: r, empty: false })),
    ...(b.empty ? [{ key: `${b.id}-e`, rect: contentBox(b), empty: true }] : []),
  ]);
  const at = (r: Rect) => ({ left: r.x, top: r.y, width: r.width, height: r.height });
  return (
    <div className="chrome__view" ref={layer}>
      {outlines
        ? boxes.map((b, i) => <div key={b.id} className="chrome__outline" data-region={i === 0 ? 'canvas-outlines' : undefined} style={at(b.box)} />)
        : placeholders
          ? containers.filter((b) => b.empty).map((b) => <div key={b.id} className="chrome__outline chrome__outline--empty" data-empty-box={b.id} style={at(b.box)} />)
          : null}
      {zones
        ? zoneRects.map((z, i) => <div key={z.key} className={`chrome__zone${z.empty ? ' chrome__zone--empty' : ''}`} data-region={i === 0 ? 'canvas-zones' : undefined} style={at(z.rect)} />)
        : null}
    </div>
  );
});
