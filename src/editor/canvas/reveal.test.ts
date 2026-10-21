import { describe, expect, it } from 'vitest';
import { travelInto, travelWhole } from './reveal.ts';

describe('travelInto', () => {
  it('leaves a box any part of which is in view where it is', () => {
    expect(travelInto(100, 200, 0, 500, 16)).toBe(0);
    expect(travelInto(-50, 10, 0, 500, 16)).toBe(0);
    expect(travelInto(490, 900, 0, 500, 16)).toBe(0);
  });
  it('brings a box below the view up to the view\'s end, an inset inside', () => {
    expect(travelInto(700, 800, 0, 500, 16)).toBe(500 - 16 - 800);
  });
  it('brings a box above the view down to its start, an inset inside', () => {
    expect(travelInto(-300, -200, 0, 500, 16)).toBe(16 + 300);
  });
  it('shows the start of a box taller than the view', () => {
    expect(travelInto(700, 1500, 0, 500, 16)).toBe(16 - 700);
  });
});

describe('travelWhole', () => {
  it('leaves a box whole in view where it is', () => {
    expect(travelWhole(100, 200, 0, 500, 16)).toBe(0);
  });
  it('brings a box whose top is above the view down to its start (DEF-0622)', () => {
    expect(travelWhole(-50, 300, 0, 500, 16)).toBe(16 + 50);
  });
  it('brings a box whose bottom is below the view up to its end', () => {
    expect(travelWhole(400, 600, 0, 500, 16)).toBe(500 - 16 - 600);
  });
  it('shows the start of a box taller than the view', () => {
    expect(travelWhole(-53, 581, 0, 600, 16)).toBe(16 + 53);
    expect(travelWhole(100, 900, 0, 500, 16)).toBe(16 - 100);
  });
});
