// UX-4.1 — minor ruler ticks under the existing major nice-tick generator.
// Contract: minors subdivide each major interval (major/5), are strictly
// inside the requested window, and never duplicate a major position.
import { describe, expect, test } from 'vitest';
import { minorTickStep, minorTicks } from '../../src/core/zoom';

describe('frame2 minor ruler ticks', () => {
  test('minorTickStep is major/5 across the 1-2-5 series', () => {
    expect(minorTickStep(1)).toBeCloseTo(0.2, 9);
    expect(minorTickStep(2)).toBeCloseTo(0.4, 9);
    expect(minorTickStep(5)).toBeCloseTo(1, 9);
    expect(minorTickStep(0.5)).toBeCloseTo(0.1, 9);
  });

  test('minorTicks fills between majors, excluding the major positions', () => {
    const minors = minorTicks(0, 10, 5);
    expect(minors).toEqual([1, 2, 3, 4, 6, 7, 8, 9]);
  });

  test('minorTicks respects the window bounds strictly', () => {
    const minors = minorTicks(2.5, 7.5, 5);
    expect(minors.every((t) => t > 2.5 && t < 7.5)).toBe(true);
    expect(minors).toContain(3);
    expect(minors).toContain(7);
    expect(minors).not.toContain(5); // 5 < 2.5? no — 5 is a MAJOR; excluded
  });

  test('offset windows align ticks to absolute time (not window-local)', () => {
    const minors = minorTicks(10.9, 14.1, 5);
    expect(minors).toEqual([11, 12, 13, 14]);
  });

  test('empty when the window is shorter than one minor step', () => {
    expect(minorTicks(0, 0.15, 1)).toEqual([]);
  });
});
