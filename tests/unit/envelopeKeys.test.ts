import { describe, expect, test } from 'vitest';
import {
  insertEnvelopeInitial,
  insertEnvelopeNeighbor,
  nudgeEnvelopePoint,
} from '../../src/app/automationUi';

/**
 * X3 — envelope keyboard operability (docs/quality-plan.md): pure helpers
 * behind the canvas key handler. The engine kernels do the real clamping
 * (movePoint x-slots + domain, insertPoint sorted, removePoint by index);
 * these gates pin the keyboard semantics on top.
 */

const DOMAIN = { min: 0, max: 1 };

describe('X3 — nudgeEnvelopePoint', () => {
  test('g1: x clamps into the free slot between neighbours; y clamps to the domain', () => {
    const points = [
      { at: 100, value: 0.5 },
      { at: 500, value: 0.2 },
      { at: 900, value: 0.8 },
    ];
    // middle point shoved hard right lands just before its neighbour
    const right = nudgeEnvelopePoint(points, 1, DOMAIN, 1000, 10_000, 0);
    expect(right[1]!.at).toBe(899);
    // y overshoot clamps to the domain max
    const up = nudgeEnvelopePoint(points, 1, DOMAIN, 1000, 0, +5);
    expect(up[1]!.value).toBe(1);
    // first point shoved hard left clamps at 0
    const left = nudgeEnvelopePoint(points, 0, DOMAIN, 1000, -10_000, 0);
    expect(left[0]!.at).toBe(0);
  });

  test('g2: nudge rounds `at` to whole samples and keeps index-stable order', () => {
    const points = [{ at: 100, value: 0.5 }];
    const out = nudgeEnvelopePoint(points, 0, DOMAIN, 1000, 10.6, -0.1);
    expect(out[0]!.at).toBe(111);
    expect(out[0]!.value).toBeCloseTo(0.4, 10);
    expect(out).toHaveLength(1);
  });
});

describe('X3 — insertEnvelopeNeighbor (Enter)', () => {
  test('g3: midpoint + averaged value between the selection and its next neighbour', () => {
    const points = [
      { at: 100, value: 0.5 },
      { at: 500, value: 0.2 },
      { at: 900, value: 0.8 },
    ];
    const out = insertEnvelopeNeighbor(points, 0, DOMAIN, 1000);
    expect(out).toHaveLength(4);
    expect(out[1]).toEqual({ at: 300, value: 0.35 });
    // selecting the LAST point: the gap runs to the region edge
    const tail = insertEnvelopeNeighbor(points, 2, DOMAIN, 1000);
    expect(tail[3]).toEqual({ at: 950, value: 0.8 });
  });

  test('g4: a single point grows halfway to the region edge', () => {
    const out = insertEnvelopeNeighbor([{ at: 400, value: 0.6 }], 0, DOMAIN, 1000);
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({ at: 700, value: 0.6 });
  });
});

describe('X3 — insertEnvelopeInitial (Enter on empty)', () => {
  test('g5: one point at the region midpoint with the static value', () => {
    expect(insertEnvelopeInitial(1000, 0.7)).toEqual([{ at: 500, value: 0.7 }]);
    expect(insertEnvelopeInitial(1, 0.7)).toEqual([{ at: 1, value: 0.7 }]);
  });
});
