// The measured size of an element, in page pixels (the status bar's readout, the box model's centre): the layout
// port's own box for it, re-measured by the page clock while it is selected (page-clock.ts followPage: when the page
// may have changed, then while the size still changes or the page moves on its own; it read the box at every frame,
// OTM-007), and the same at any zoom — the number a person compares against the Width and Height fields (spec
// canvas-page-iframe, the box model).
import { useEffect, useState } from 'react';
import type { NodeId } from '../../generated/commands.ts';
import { pageAnimating, pageLayout } from '../canvas/coordinates.ts';
import { followPage } from '../canvas/page-clock.ts';

export interface ElementSize {
  readonly width: number;
  readonly height: number;
}

const sameSize = (a: ElementSize | null | undefined, b: ElementSize | null): boolean => a !== undefined && a?.width === b?.width && a?.height === b?.height;

// A reader of a size by the page clock: each measure is shown when it differs from the one shown, and says whether it
// differs from the last one read (the clock follows a size that still moves).
function sizeReader(set: (next: (was: ElementSize | null) => ElementSize | null) => void, read: () => ElementSize | null): () => boolean {
  let last: ElementSize | null | undefined;
  return () => {
    const next = read();
    const moved = !sameSize(last, next);
    last = next;
    set((was) => (sameSize(was, next) ? was : next));
    return moved;
  };
}

export function usePrimarySize(id: NodeId | null): ElementSize | null {
  const [size, setSize] = useState<ElementSize | null>(null);
  useEffect(() => {
    if (id === null) return;
    const measure = sizeReader(setSize, () => {
      const box = pageLayout.box(id);
      return box === null ? null : { width: Math.round(box.width), height: Math.round(box.height) };
    });
    return followPage(measure, pageAnimating).stop;
  }, [id]);
  return id === null ? null : size;
}

// The size of what is selected, in page pixels: the one element's, or with several the box that holds them all (the
// status bar's readout; the canonical "1248 × 390" for three cards), re-measured by the page clock. The ids are given
// as one text (joined by spaces) so the hook's input is stable while the selection is.
export function useSelectionSize(ids: string): ElementSize | null {
  const [size, setSize] = useState<ElementSize | null>(null);
  useEffect(() => {
    const list = ids.split(' ').filter((id) => id !== '') as NodeId[];
    if (list.length === 0) return;
    const measure = sizeReader(setSize, () => {
      const boxes = list.map((id) => pageLayout.box(id)).filter((box) => box !== null);
      const left = Math.min(...boxes.map((box) => box.x));
      const top = Math.min(...boxes.map((box) => box.y));
      const right = Math.max(...boxes.map((box) => box.x + box.width));
      const bottom = Math.max(...boxes.map((box) => box.y + box.height));
      return boxes.length === 0 ? null : { width: Math.round(right - left), height: Math.round(bottom - top) };
    });
    return followPage(measure, pageAnimating).stop;
  }, [ids]);
  return ids.trim() === '' ? null : size;
}
