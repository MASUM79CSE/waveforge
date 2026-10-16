// UX-4.3 — batched lane geometry (pure): column points for one Path2D fill
// per lane, plus missing-run merging for the progressive tile loads.
import { describe, expect, test } from 'vitest';
import { lanePathPoints, type LaneSample } from '../../src/core/wavePath';

describe('frame2 batched lane geometry', () => {
  const mid = 100;
  const amp = 40;

  const sample: LaneSample = (x) => {
    if (x === 2 || x === 5) return null; // tiles missing at 2 and 5
    if (x === 3) return { min: -0.5, max: 1 };
    return { min: -0.25, max: 0.25 };
  };

  test('column y values clamp into the lane and mirror amplitude', () => {
    const pts = lanePathPoints(8, sample, 60, mid, amp);
    expect(pts.cols.length).toBe(6); // 8 columns minus 2 missing
    const [x0, yMin0, yMax0] = pts.cols[0] ?? [];
    expect(x0).toBe(0);
    expect(yMin0).toBeCloseTo(mid - 0.25 * amp, 6); // max up
    expect(yMax0).toBeCloseTo(mid - -0.25 * amp, 6); // min down
    const [x3, yMin3, yMax3] = pts.cols[2] ?? []; // x=3 special case
    expect(x3).toBe(3);
    expect(yMin3).toBeCloseTo(61, 6); // max clamps to y0+1 (1px lane padding)
    expect(yMax3).toBeCloseTo(mid + 0.5 * amp, 6);
  });

  test('consecutive missing columns merge into runs', () => {
    const runs = lanePathPoints(8, () => null, 60, mid, amp);
    expect(runs.cols).toEqual([]);
    expect(runs.missing).toEqual([[0, 7]]); // whole lane missing: one run x0..x1
  });

  test('isolated missing columns produce single-column runs', () => {
    const pts = lanePathPoints(8, sample, 60, mid, amp);
    expect(pts.missing).toEqual([
      [2, 2],
      [5, 5],
    ]);
  });

  test('zero-width lane yields empty geometry', () => {
    expect(lanePathPoints(0, sample, 60, mid, amp)).toEqual({ cols: [], missing: [] });
  });
});
