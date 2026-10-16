// UX-4.2 — vertical scale (linear + dB) with the master-prompt analytic
// anchors: amplitude 1.0 → 0 dB, 0.5 → −6.02 dB, 0.1 → −20 dB, and the dB
// floor → lane CENTER (the quiet end collapses toward the center line, the
// reference dB-scale convention).
import { describe, expect, test } from 'vitest';
import {
  FLOOR_DB,
  ampToDb,
  dbAnchors,
  dbFraction,
  yForAmp,
} from '../../src/app/frame2/scale';

describe('frame2 dB scale — analytic anchors', () => {
  test('ampToDb matches 20·log10 exactly at the anchor points', () => {
    expect(ampToDb(1)).toBeCloseTo(0, 9);
    expect(ampToDb(0.5)).toBeCloseTo(-6.0206, 3);
    expect(ampToDb(0.1)).toBeCloseTo(-20, 6);
    expect(ampToDb(0)).toBe(Number.NEGATIVE_INFINITY);
  });

  test('dbFraction: 0 dB at the edge → floor at the center bound', () => {
    expect(dbFraction(1)).toBe(0); // 0 dB → edge
    expect(dbFraction(0.5)).toBeCloseTo(6.0206 / 60, 4);
    expect(dbFraction(0.1)).toBeCloseTo(20 / 60, 4);
    expect(dbFraction(0.001)).toBe(1); // floor (−60 dB) → 1
    expect(dbFraction(0)).toBe(1); // −Inf clamps to the floor bound
    expect(dbFraction(2)).toBe(0); // >1 clamps to the edge
  });

  test('FLOOR_DB is 60 (matches the app −Inf..0 dB strip with −60 floor)', () => {
    expect(FLOOR_DB).toBe(60);
  });

  test('yForAmp: 1.0 → lane edge, floor → center; sign-mirrored', () => {
    const top = 100;
    const mid = 200; // halfLane = 100
    expect(yForAmp(1, top, mid)).toBeCloseTo(top, 9); // 0 dB → edge
    expect(yForAmp(0.001, top, mid)).toBeCloseTo(mid, 9); // floor → center
    expect(yForAmp(0.5, top, mid)).toBeCloseTo(mid - (1 - 6.0206 / 60) * 100, 3);
    expect(yForAmp(-1, top, mid)).toBeCloseTo(300, 9); // mirrored bottom edge
    expect(yForAmp(-0.5, top, mid)).toBeCloseTo(mid + (1 - 6.0206 / 60) * 100, 3);
  });

  test('dbAnchors gives the label set for the vertical scale panel', () => {
    const anchors = dbAnchors();
    expect(anchors.map((a) => a.label)).toEqual(['0', '-6', '-20', '-60']);
    const ys = anchors.map((a) => a.yFor(100, 200) as number);
    expect(ys[0]).toBeCloseTo(100, 6); // 0 dB at edge
    expect(ys[3]).toBeCloseTo(200, 6); // floor at center
    expect(ys[1] as number).toBeGreaterThan(ys[0] as number);
    expect(ys[1] as number).toBeLessThan(ys[3] as number);
  });
});
