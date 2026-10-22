// A selection made away from the canvas brings its element into view (spec keyboard-tree-walk Problem 2: "walking to
// an element outside the canvas viewport scrolls it into view (nearest edge)"; palette-click-insert: "the inserted
// element is scrolled into view if it lands off screen"). The audit of 2026-10-05 found every way of selecting away
// from the canvas leaving it where it was: the arrows' walk, a Layers row, the command bar's find and an insertion
// at the page's end selected an element below the stage, and the inspector named an element the person could not see.
// One rule for all of them: when the selection's first element changes and no part of it is in the stage's view, the
// canvas moves by the least that shows it, its edge an inset inside the view's (an element taller than the view shows
// its top). An element any part of which is in view never moves the canvas: a press on the page always reaches one.
// A selection made with a press in the Layers leaves the canvas as it is: the contract's drag-autoscroll scenario
// chooses an element far below in the Layers, then drags one at the page's top, which must stay where it was. The press
// is the one that made the change, read as the selection changes: read later, it was at times the next press (the
// Inspector's field typed in after a Layers row was chosen), and the canvas moved away under the person. Such a
// selection out of the stage's view is said at the stage's edge instead, by a button that brings it in (the real-use
// pass of 2026-10-22: a card chosen in the Layers stayed out of sight, nothing on the canvas saying where it was).
// A part the canvas opens only while it or something inside it is selected (render.ts openedBySelection: the cart
// drawer, a phone menu, a closed dialog) is the exception: a Layers row inside it opens it where it lies, often far
// from the view (the drawer is fixed at the artboard's top), and nothing seen changed; the canvas brings it in.
import { useEffect, useState, type RefObject } from 'react';
import { locate, type NodeId } from '../../core/document/model.ts';
import type { CommandId } from '../../generated/ids.ts';
import { manifest } from '../../manifest/runtime.ts';
import { usePointerViews } from '../input/pointer/use-views.ts';
import { useEditorState, useStore } from '../store.ts';
import { useT } from '../text.ts';
import { Icon } from '../doors/door.tsx';
import { canvasFrame, nodeBox } from './coordinates.ts';
import { openedBySelection } from './render/render.ts';
import { travelInto, visiblePage } from './reveal.ts';

// the canvas's pan, the wheel's command: what moves the page under the stage (the quick panel's reveal uses it too)
const PAN = manifest.doors.find((d) => d.door.kind === 'canvas-wheel' && 'dx' in d.command.args);
const token = (element: Element, name: string) => parseFloat(getComputedStyle(element).getPropertyValue(name)) || 0;

// the least pan that shows an element in the stage's view, or null while a part of it is seen (or nothing measures it)
function travelTo(stage: HTMLElement | null, primary: NodeId): { readonly dx: number; readonly dy: number } | null {
  const frame = canvasFrame();
  const box = frame === null ? null : nodeBox(frame, primary);
  if (stage === null || box === null || (box.width <= 0 && box.height <= 0)) return null;
  // what the person sees of the page: the stage, under the frame's tabs pinned to its top (reveal.ts)
  const view = visiblePage();
  if (view === null) return null;
  const inset = token(stage, '--space-8');
  const dy = travelInto(box.y, box.y + box.height, view.top, view.bottom, inset);
  const dx = travelInto(box.x, box.x + box.width, view.left, view.right, inset);
  // a part in view overlaps the view along both axes; seen along one only, it moves along the other
  return dx === 0 && dy === 0 ? null : { dx: Math.round(dx), dy: Math.round(dy) };
}

export function RevealSelection({ stage }: { readonly stage: RefObject<HTMLDivElement | null> }) {
  const store = useStore();
  const t = useT();
  // where the person's last press went down (the pointer owner's view, pointer/views.ts)
  const views = usePointerViews();
  // the element chosen in the Layers that the stage does not show, and on which side it lies
  const [away, setAway] = useState<{ readonly id: NodeId; readonly below: boolean } | null>(null);
  const name = useEditorState((s) => (away === null ? '' : (locate(s.document, away.id)?.node.name ?? '')));
  useEffect(() => {
    if (PAN === undefined) return;
    const pan = PAN;
    let request = 0;
    // the element brought into view (or said, for a Layers row), two frames on: the renderer draws an element just
    // inserted, and the layout settles, before it is measured
    const reveal = (primary: NodeId, only: 'move' | 'say') => {
      cancelAnimationFrame(request);
      request = requestAnimationFrame(() => {
        request = requestAnimationFrame(() => {
          const travel = travelTo(stage.current, primary);
          if (travel === null) return;
          if (only === 'say') {
            setAway({ id: primary, below: travel.dy < 0 });
            return;
          }
          (store.dispatch as (command: CommandId, args: unknown) => unknown)(pan.command.id, travel);
        });
      });
    };
    // what the press was when the selection changed, read as it changes: a later press (the field the person types in
    // next) never stands for the one that chose the element. A selection changed during a drag is decided once the drag
    // ends, by the press that began it.
    let duringDrag = false;
    const decide = (primary: NodeId | null) => {
      setAway(null);
      if (views.drag.get() !== null) {
        duringDrag = true;
        return;
      }
      if (primary === null) return;
      if (views.pressRegion() === 'layers' && openedBySelection(store.getState().document, primary).length === 0) {
        reveal(primary, 'say');
        return;
      }
      reveal(primary, 'move');
    };
    let previous = store.getState().selection[0] ?? null;
    // the selection the editor starts with (restored, or a test's) is brought into view as well
    decide(previous);
    const unsubscribe = store.subscribe(() => {
      const primary = store.getState().selection[0] ?? null;
      if (primary === previous) return;
      previous = primary;
      decide(primary);
    });
    const unsubscribeDrag = views.drag.subscribe(() => {
      if (views.drag.get() !== null || !duringDrag) return;
      duringDrag = false;
      decide(store.getState().selection[0] ?? null);
    });
    return () => {
      unsubscribe();
      unsubscribeDrag();
      cancelAnimationFrame(request);
    };
  }, [stage, store, views]);
  // the button goes once the element comes into view by any way (a scroll, a zoom)
  useEffect(() => {
    if (away === null) return undefined;
    const check = window.setInterval(() => {
      if (travelTo(stage.current, away.id) === null) setAway(null);
    }, 300);
    return () => window.clearInterval(check);
  }, [away, stage]);
  if (away === null || PAN === undefined) return null;
  const pan = PAN;
  const bring = () => {
    const travel = travelTo(stage.current, away.id);
    setAway(null);
    if (travel !== null) (store.dispatch as (command: CommandId, args: unknown) => unknown)(pan.command.id, travel);
  };
  return (
    <button type="button" className={`reveal-away${away.below ? ' is-below' : ' is-above'}`} onClick={bring}>
      <Icon name={away.below ? 'arrow-down' : 'arrow-up'} size="sm" />
      <span>{t(away.below ? 'canvas.selectionBelow' : 'canvas.selectionAbove', { name })}</span>
    </button>
  );
}
