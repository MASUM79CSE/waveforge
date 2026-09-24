import { describe, expect, test } from 'vitest';
import {
  evalCurve,
  insertPoint,
  movePoint,
  mulTable,
  panWeights,
  removePoint,
  type AutomationPoint,
} from '../../src/engine/automation';

const line: AutomationPoint[] = [
  { at: 0, value: 0 },
  { at: 128, value: 1 },
];

describe('A1 evalCurve — exact linear interpolation', () => {
  test('quarter/midpoint anchors; endpoint clamps; on-point exactness', () => {
    expect(evalCurve(line, 64)).toBe(0.5); // 64/128
    expect(evalCurve(line, 32)).toBe(0.25);
    expect(evalCurve(line, -5)).toBe(0); // before first → first value
    expect(evalCurve(line, 200)).toBe(1); // after last → last value
    expect(evalCurve(line, 0)).toBe(0); // on a point → its exact value
    expect(evalCurve(line, 128)).toBe(1);
  });

  test('single point = constant; empty curve throws (callers guard)', () => {
    expect(evalCurve([{ at: 10, value: 0.75 }], 555)).toBe(0.75);
    expect(() => evalCurve([], 0)).toThrow(/empty/);
  });
});

describe('A1 insertPoint / movePoint / removePoint — immutable editing', () => {
  test('insert: sorted, same-at replaces, input untouched', () => {
    const base: AutomationPoint[] = [
      { at: 0, value: 0 },
      { at: 100, value: 1 },
    ];
    const out = insertPoint(base, 50, 0.5);
    expect(out.map((p) => p.at)).toEqual([0, 50, 100]);
    expect(out[1]).toEqual({ at: 50, value: 0.5 });
    const replaced = insertPoint(base, 100, 0.9);
    expect(replaced).toHaveLength(2);
    expect(replaced[1]).toEqual({ at: 100, value: 0.9 });
    expect(insertPoint(base, 200, 0.3)[2]).toEqual({ at: 200, value: 0.3 });
    expect(base).toHaveLength(2);
  });

  test('move: x clamped to (prevAt, nextAt), y to [min,max]; endpoints bound by 0/next', () => {
    const base: AutomationPoint[] = [
      { at: 0, value: 0 },
      { at: 100, value: 0.5 },
      { at: 200, value: 1 },
    ];
    const bounds = { min: 0, max: 1 };
    expect(movePoint(base, 1, 150, 0.8, bounds)[1]).toEqual({ at: 150, value: 0.8 });
    expect(movePoint(base, 1, -50, 0.5, bounds)[1]!.at).toBe(1); // clamped to prev.at + 1
    expect(movePoint(base, 1, 500, 0.5, bounds)[1]!.at).toBe(199); // clamped to next.at − 1
    expect(movePoint(base, 1, 120, 5, bounds)[1]!.value).toBe(1);
    expect(movePoint(base, 1, 120, -3, bounds)[1]!.value).toBe(0);
    expect(movePoint(base, 0, 50, 0.1, bounds)[0]).toEqual({ at: 50, value: 0.1 });
    expect(movePoint(base, 0, 300, 0.1, bounds)[0]!.at).toBe(99); // clamped to next (100) − 1
    expect(base[1]).toEqual({ at: 100, value: 0.5 }); // input untouched
  });

  test('remove: drops the index; emptying is allowed (curve disabled)', () => {
    const base: AutomationPoint[] = [
      { at: 0, value: 0.5 },
      { at: 10, value: 1 },
    ];
    expect(removePoint(base, 0)).toEqual([{ at: 10, value: 1 }]);
    expect(removePoint(base, 1)).toEqual([{ at: 0, value: 0.5 }]);
    expect(removePoint([{ at: 0, value: 1 }], 0)).toEqual([]);
    expect(base).toHaveLength(2);
  });
});

describe('A1 mulTable — segment-wise per-sample multipliers (Float64)', () => {
  test('anchors across a fade segment; after-last clamps to the last value', () => {
    const t = mulTable(line, 200);
    expect(t).toHaveLength(200);
    expect(t[0]).toBe(0);
    expect(t[64]).toBe(0.5); // 64/128 — exact in binary
    expect(t[127]).toBe(127 / 128); // exact
    expect(t[128]).toBe(1); // last point owns its sample
    expect(t[199]).toBe(1);
  });

  test('single point = constant table; mid-lane curve start clamps to it', () => {
    const half = mulTable([{ at: 0, value: 0.5 }], 8);
    expect(Array.from(half)).toEqual([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
    const t = mulTable(
      [
        { at: 100, value: 0.5 },
        { at: 200, value: 1 },
      ],
      300,
    );
    expect(t[0]).toBe(0.5);
    expect(t[99]).toBe(0.5);
    expect(t[150]).toBe(0.75);
    expect(t[299]).toBe(1);
  });

  test('CONSTANT-1 curves produce ALL EXACT ONES (bit-identity guard)', () => {
    const ones = mulTable([{ at: 0, value: 1 }], 1000);
    for (let i = 0; i < 1000; ++i) expect(ones[i]).toBe(1);
    const ones2 = mulTable(
      [
        { at: 0, value: 1 },
        { at: 500, value: 1 },
      ],
      1000,
    );
    for (let i = 0; i < 1000; ++i) expect(ones2[i]).toBe(1);
  });

  test('empty curve throws', () => {
    expect(() => mulTable([], 10)).toThrow(/empty/);
  });
});

describe('A1 panWeights — balance law applied to interpolated pan', () => {
  test('hard L/R produce exact zeros; center is unity passthrough', () => {
    const hardL = panWeights([{ at: 0, value: -1 }], 100);
    for (let i = 0; i < 100; ++i) {
      expect(hardL.gl[i]).toBe(1);
      expect(hardL.gr[i]).toBe(0); // exactly zero
    }
    const center = panWeights([{ at: 0, value: 0 }], 100);
    for (let i = 0; i < 100; ++i) {
      expect(center.gl[i]).toBe(1);
      expect(center.gr[i]).toBe(1);
    }
    const hardR = panWeights([{ at: 0, value: 1 }], 100);
    for (let i = 0; i < 100; ++i) {
      expect(hardR.gl[i]).toBe(0); // exactly zero
      expect(hardR.gr[i]).toBe(1);
    }
  });

  test('sweep interpolates in the PAN domain, then the balance law per sample', () => {
    const sweep = panWeights(
      [
        { at: 0, value: -1 },
        { at: 100, value: 1 },
      ],
      100,
    );
    expect(sweep.gl[50]).toBe(1); // pan 0 → (1, 1)
    expect(sweep.gr[50]).toBe(1);
    expect(sweep.gl[25]).toBe(1); // pan −0.5 → (1, 0.5)
    expect(sweep.gr[25]).toBe(0.5);
    expect(sweep.gl[75]).toBe(0.5); // pan 0.5 → (0.5, 1)
    expect(sweep.gr[75]).toBe(1);
  });
});
