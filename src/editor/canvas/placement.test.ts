// The label rules (src/editor/canvas/placement.ts). The selection's label has one place (the user's rule of 2026-10-05,
// DEC-70): above its element, touching the frame's line, at the frame's left edge, whatever lies there; over page text
// it says so, and then takes no press, so a press meant for the text under it reaches the text (journey03 J16: a
// button's label over a card's price selected the button). A drop label takes the first free place around its element,
// and where none is free it covers the least it can and says so.
import { describe, expect, it } from 'vitest';
import { clearedLabel, heldInStage, labelRoom, placeLabel, selectionLabelBox, turnedFrame, type Box } from './placement.ts';

const box = (x: number, y: number, width: number, height: number): Box => ({ x, y, width, height });
const CANVAS = box(0, 0, 1000, 1000);
const SIZE = { width: 80, height: 16 };
const BUTTON = box(100, 200, 60, 30);

describe("the selection's label", () => {
  it('stands above its element, its bottom on the frame line and its start at the frame line, covering nothing', () => {
    const placed = selectionLabelBox(BUTTON, SIZE, 2, []);
    expect(placed.placement).toBe('above');
    expect(placed.covers).toBe(false);
    expect(placed.box).toEqual(box(98, 182, 80, 16));
  });

  // the old rule moved it below, inside or a handle's room away when text or a control was in the way (QA 375); the
  // user's rule of 2026-10-05 keeps it in its one place and only says it covers the text
  it('keeps its place over the text above, and says it covers it', () => {
    const price = box(90, 170, 200, 26);
    const placed = selectionLabelBox(BUTTON, SIZE, 2, [price]);
    expect(placed.box).toEqual(box(98, 182, 80, 16));
    expect(placed.covers).toBe(true);
  });

  it('keeps its place for an element narrower than itself, at the top of the canvas or past its right edge', () => {
    expect(selectionLabelBox(box(10, 0, 12, 12), SIZE, 2, []).box).toEqual(box(8, -18, 80, 16));
    expect(selectionLabelBox(box(990, 300, 40, 20), SIZE, 1, []).box).toEqual(box(989, 283, 80, 16));
  });

  it('does not count text it meets by less than a pixel, the rounding of a fractional layout', () => {
    const above = box(0, 150, 400, 32.6);
    expect(selectionLabelBox(BUTTON, SIZE, 2, [above]).covers).toBe(false);
  });

  // the breakpoint tabs attached to the page's top (D-1) are where the one place of an element at the page's top falls:
  // the label and what stands with it (the chip beside it, the text toolbar above it) never lie over them (rule G5)
  describe("kept clear of the editor's own controls", () => {
    const TOP = box(0, 0, 600, 40);
    const TABS = [box(0, -30, 90, 26), box(92, -30, 90, 26), box(184, -30, 90, 26)];
    it('keeps its one place where no control lies there', () => {
      const one = selectionLabelBox(BUTTON, SIZE, 2, []);
      expect(clearedLabel(one, BUTTON, 2, { above: 0, width: SIZE.width }, TABS, [])).toEqual(one);
    });
    it('moves along the top just past the tabs, over a wide element, touching the frame line', () => {
      const one = selectionLabelBox(TOP, SIZE, 2, []);
      const cleared = clearedLabel(one, TOP, 2, { above: 0, width: SIZE.width }, TABS, []);
      expect(cleared.placement).toBe('above');
      expect(cleared.box).toEqual(box(276, -18, 80, 16));
      expect(TABS.some((tab) => cleared.box.x < tab.x + tab.width && tab.x < cleared.box.x + cleared.box.width)).toBe(false);
    });
    it('stands under a narrow element the tabs lie over, at the same left edge, touching the frame line', () => {
      const narrow = box(0, 0, 200, 40);
      const one = selectionLabelBox(narrow, SIZE, 2, []);
      const cleared = clearedLabel(one, narrow, 2, { above: 0, width: SIZE.width }, TABS, []);
      expect(cleared.placement).toBe('below');
      expect(cleared.box).toEqual(box(-2, 42, 80, 16));
    });
    it('goes under for the chip beside it and what rises above it too', () => {
      const element = box(100, 30, 300, 40);
      const one = selectionLabelBox(element, SIZE, 2, []);
      // alone the label clears the tabs (its top at 12); the chip beside it reaches a control, what rises above it
      // (the text toolbar, a chip taller than the label) the tabs
      expect(clearedLabel(one, element, 2, { above: 0, width: SIZE.width }, [box(184, -30, 90, 26)], [])).toEqual(one);
      expect(clearedLabel(one, element, 2, { above: 0, width: SIZE.width + 40 }, [box(170, 0, 90, 20)], []).box.x).toBe(262);
      expect(clearedLabel(one, element, 2, { above: 30, width: SIZE.width }, TABS, []).box.x).toBe(276);
    });
    it('says it covers page text where it lands on it', () => {
      const one = selectionLabelBox(TOP, SIZE, 2, []);
      expect(clearedLabel(one, TOP, 2, { above: 0, width: SIZE.width }, TABS, [box(270, -20, 100, 10)]).covers).toBe(true);
    });
  });
});

// near the stage's right edge a long label moves left to stay in view, above its element still (the real-use audit,
// USE-4: the label of a long-named button near the canvas's right edge was hidden)
describe("the selection's label kept in the stage", () => {
  const STAGE = box(0, 0, 800, 600);
  const LONG = { width: 358, height: 16 };
  it('keeps its one place where it fits', () => {
    const one = selectionLabelBox(BUTTON, SIZE, 2, []);
    expect(heldInStage(one, BUTTON, SIZE.width + 24, STAGE, [])).toEqual(one);
  });
  it('moves left just enough that it and the chip end at the stage edge, still above its element', () => {
    const near = box(640, 300, 120, 30);
    const one = selectionLabelBox(near, LONG, 2, []);
    const held = heldInStage(one, near, LONG.width + 24, STAGE, []);
    expect(held.placement).toBe('above');
    expect(held.box).toEqual(box(800 - 358 - 24, 282, 358, 16));
  });
  it('starts at the stage edge when the group is wider than the stage, and the name gives way to the room', () => {
    const near = box(640, 300, 120, 30);
    const one = selectionLabelBox(near, { width: 900, height: 16 }, 2, []);
    expect(heldInStage(one, near, 924, STAGE, []).box.x).toBe(0);
    expect(labelRoom(STAGE, 24)).toBe(776);
  });
  it('leaves the label of an element out of the stage across where it was', () => {
    const away = box(900, 300, 100, 30);
    const one = selectionLabelBox(away, LONG, 2, []);
    expect(heldInStage(one, away, LONG.width, STAGE, [])).toEqual(one);
  });
  it('says it covers page text where it lands on it', () => {
    const near = box(640, 300, 120, 30);
    const one = selectionLabelBox(near, LONG, 2, []);
    expect(heldInStage(one, near, LONG.width, STAGE, [box(450, 270, 40, 20)]).covers).toBe(true);
  });
});

describe('a drop label', () => {
  it('sits above the element where that space is free, and covers nothing', () => {
    const placed = placeLabel(BUTTON, SIZE, 4, [], CANVAS);
    expect(placed.placement).toBe('above');
    expect(placed.covers).toBe(false);
    expect(placed.box).toEqual(box(100, 180, 80, 16));
  });

  it('goes below when the text above takes the space, still covering nothing', () => {
    const price = box(90, 170, 200, 26);
    const placed = placeLabel(BUTTON, SIZE, 4, [price], CANVAS);
    expect(placed.placement).toBe('below');
    expect(placed.covers).toBe(false);
  });

  it('says it covers content when text surrounds the element on every side', () => {
    const above = box(0, 150, 400, 48);
    const below = box(0, 232, 400, 48);
    const placed = placeLabel(BUTTON, SIZE, 4, [above, below], CANVAS);
    expect(placed.covers).toBe(true);
  });
});

describe('a turned frame', () => {
  it('gives the box whose line drawn outside it is the turned frame line upright bounding box', () => {
    expect(turnedFrame(box(0, 0, 100, 20), 0, 2)).toEqual(box(0, 0, 100, 20));
    // a quarter turn about its centre (50, 10): the line 104 x 24 turned is 24 x 104, from (38, -42)
    const turned = turnedFrame(box(0, 0, 100, 20), 90, 2);
    expect(turned.x).toBeCloseTo(40);
    expect(turned.y).toBeCloseTo(-40);
    expect(turned.width).toBeCloseTo(20);
    expect(turned.height).toBeCloseTo(100);
    expect(selectionLabelBox(turned, SIZE, 2, []).box.y).toBeCloseTo(-58);
  });
});
