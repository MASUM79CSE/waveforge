import { describe, expect, test } from 'vitest';
import { clampPanelPos } from '../../src/app/panelPos';

/**
 * PF-08: dockable detached panels — the pure clamp kernel that keeps a
 * floating panel inside the viewport (8 px margin) while it is dragged or
 * moved with the keyboard. Degenerate cases: panel larger than the viewport
 * pins to the top-left margin; zero/negative sizes are rejected by callers,
 * clamped defensively here.
 */
describe('clampPanelPos', () => {
  test('keeps a position that is already inside the viewport', () => {
    expect(clampPanelPos(100, 80, 400, 200, 1280, 800)).toEqual({ x: 100, y: 80 });
  });

  test('clamps drags past the right/bottom edge back inside', () => {
    // viewport 1280x800, panel 400x200, margin 8 → x ≤ 1280-400-8 = 872
    expect(clampPanelPos(1200, 80, 400, 200, 1280, 800)).toEqual({ x: 872, y: 80 });
    expect(clampPanelPos(100, 900, 400, 200, 1280, 800)).toEqual({ x: 100, y: 592 });
  });

  test('clamps negative drags to the top/left margin', () => {
    expect(clampPanelPos(-50, -10, 400, 200, 1280, 800)).toEqual({ x: 8, y: 8 });
  });

  test('panel larger than the viewport pins to the top-left margin', () => {
    expect(clampPanelPos(300, 300, 2000, 1200, 1280, 800)).toEqual({ x: 8, y: 8 });
  });

  test('degenerate panel sizes clamp like zero-size points', () => {
    expect(clampPanelPos(500, 500, 0, -20, 1280, 800)).toEqual({ x: 500, y: 500 });
  });
});
