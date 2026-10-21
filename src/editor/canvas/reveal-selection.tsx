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
// Inspector's field typed in after a Layers row was chosen), and the canvas moved away under the person.
// A part the canvas opens only while it or something inside it is selected (render.ts openedBySelection: the cart
// drawer, a phone menu, a closed dialog) is the exception: a Layers row inside it opens it where it lies, often far
// from the view (the drawer is fixed at the artboard's top), and nothing seen changed; the canvas brings it in.
import { useEffect, type RefObject } from 'react';
import type { NodeId } from '../../core/document/model.ts';
import type { CommandId } from '../../generated/ids.ts';
import { manifest } from '../../manifest/runtime.ts';
import { usePointerViews } from '../input/pointer/use-views.ts';
import { useStore } from '../store.ts';
import { canvasFrame, nodeBox } from './coordinates.ts';
import { openedBySelection } from './render/render.ts';
import { travelInto, visiblePage } from './reveal.ts';

// the canvas's pan, the wheel's command: what moves the page under the stage (the quick panel's reveal uses it too)
const PAN = manifest.doors.find((d) => d.door.kind === 'canvas-wheel' && 'dx' in d.command.args);
const token = (element: Element, name: string) => parseFloat(getComputedStyle(element).getPropertyValue(name)) || 0;

export function RevealSelection({ stage }: { readonly stage: RefObject<HTMLDivElement | null> }) {
  const store = useStore();
  // where the person's last press went down (the pointer owner's view, pointer/views.ts)
  const views = usePointerViews();
  useEffect(() => {
    if (PAN === undefined) return;
    const pan = PAN;
    let request = 0;
    // the element brought into view, two frames on: the renderer draws an element just inserted, and the layout
    // settles, before it is measured
    const reveal = (primary: NodeId) => {
      cancelAnimationFrame(request);
      request = requestAnimationFrame(() => {
        request = requestAnimationFrame(() => {
          const area = stage.current;
          const frame = canvasFrame();
          const box = frame === null ? null : nodeBox(frame, primary);
          if (area === null || box === null || (box.width <= 0 && box.height <= 0)) return;
          // what the person sees of the page: the stage, under the frame's tabs pinned to its top (reveal.ts)
          const view = visiblePage();
          if (view === null) return;
          const inset = token(area, '--space-8');
          const dy = travelInto(box.y, box.y + box.height, view.top, view.bottom, inset);
          const dx = travelInto(box.x, box.x + box.width, view.left, view.right, inset);
          // a part in view overlaps the view along both axes; seen along one only, it moves along the other
          if (dx === 0 && dy === 0) return;
          (store.dispatch as (command: CommandId, args: unknown) => unknown)(pan.command.id, { dx: Math.round(dx), dy: Math.round(dy) });
        });
      });
    };
    // what the press was when the selection changed, read as it changes: a later press (the field the person types in
    // next) never stands for the one that chose the element. A selection changed during a drag is decided once the drag
    // ends, by the press that began it.
    let duringDrag = false;
    const decide = (primary: NodeId | null) => {
      if (views.drag.get() !== null) {
        duringDrag = true;
        return;
      }
      if (primary === null) return;
      if (views.pressRegion() === 'layers' && openedBySelection(store.getState().document, primary).length === 0) return;
      reveal(primary);
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
  return null;
}
