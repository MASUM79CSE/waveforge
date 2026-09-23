import { describe, expect, test } from 'vitest';
import {
  applyOps,
  fadeInRange,
  fadeOutRange,
  findZeroCross,
  gainRange,
  insertRegion,
  invertRange,
  makeCut,
  makeOverwritePaste,
  makeRemoveSilence,
  makeTrim,
  type EditOutcome,
  makeInsert,
  makeRangeWrite,
  normalizeRange,
  peakOf,
  removeRange,
  removeSilenceRanges,
  reverseRange,
  silenceRanges,
  sliceRegion,
  writeRange,
  type SliceOp,
} from '../../src/engine/editOps';

function ch(values: number[]): Float32Array[] {
  return [new Float32Array(values)];
}

function arr(a: Float32Array[]): number[] {
  return Array.from(a[0] ?? []);
}

describe('sliceRegion / removeRange / insertRegion / writeRange', () => {
  const src = ch([0, 1, 2, 3, 4, 5]);

  test('sliceRegion copies the requested region', () => {
    expect(arr(sliceRegion(src, 2, 3))).toEqual([2, 3, 4]);
  });

  test('sliceRegion clamps overlong requests', () => {
    expect(arr(sliceRegion(src, 4, 10))).toEqual([4, 5]);
  });

  test('removeRange deletes the region and keeps the rest in order', () => {
    expect(arr(removeRange(src, 1, 3))).toEqual([0, 4, 5]);
  });

  test('insertRegion inserts without overwriting', () => {
    expect(arr(insertRegion(src, 2, ch([9, 9])))).toEqual([0, 1, 9, 9, 2, 3, 4, 5]);
  });

  test('insertRegion can append at the end', () => {
    expect(arr(insertRegion(src, 6, ch([9])))).toEqual([0, 1, 2, 3, 4, 5, 9]);
  });

  test('writeRange replaces a same-length region', () => {
    expect(arr(writeRange(src, 2, ch([8, 8])))).toEqual([0, 1, 8, 8, 4, 5]);
  });
});

describe('range transforms (constant length)', () => {
  test('gainRange scales the region only', () => {
    const out = gainRange(ch([1, 1, 1, 1]), 1, 2, 0.5);
    expect(arr(out)).toEqual([1, 0.5, 0.5, 1]);
  });

  test('fadeIn ramps 0→1 across the region', () => {
    const out = fadeInRange(ch([1, 1, 1, 1]), 0, 4);
    const v = arr(out);
    expect(v[0]).toBe(0);
    expect(v[3]).toBe(1);
    expect(v[1]).toBeCloseTo(1 / 3, 6);
    expect(v[2]).toBeCloseTo(2 / 3, 6);
  });

  test('fadeOut ramps 1→0 across the region', () => {
    const out = fadeOutRange(ch([1, 1, 1, 1]), 0, 4);
    const v = arr(out);
    expect(v[0]).toBe(1);
    expect(v[3]).toBe(0);
  });

  test('reverseRange reverses in place', () => {
    expect(arr(reverseRange(ch([1, 2, 3, 4]), 1, 2))).toEqual([1, 3, 2, 4]);
  });

  test('invertRange negates samples', () => {
    expect(arr(invertRange(ch([0.5, -0.25]), 0, 2))).toEqual([-0.5, 0.25]);
  });
});

describe('normalizeRange', () => {
  test('scales the region to the target peak and reports the factor', () => {
    const region = ch([0.5, -0.25]);
    const { data, factor } = normalizeRange(region, 0, 2, 1);
    expect(factor).toBe(2);
    expect(arr(data)).toEqual([1, -0.5]);
  });

  test('leaves a silent region untouched (factor 1)', () => {
    const { factor } = normalizeRange(ch([0, 0]), 0, 2, 1);
    expect(factor).toBe(1);
  });

  test('peakOf finds the max absolute sample', () => {
    expect(peakOf(ch([-0.25, 0.5, 0.125]), 0, 3)).toBe(0.5);
  });
});

describe('removeSilenceRanges + silenceRanges', () => {
  test('finds runs below the threshold longer than minLen', () => {
    // loud, 4 quiet, loud — threshold 0.1, minLen 3
    const data = ch([1, 0.01, 0.02, 0.0, 0.05, 1]);
    const ranges = silenceRanges(data, 0, 6, 0.1, 3);
    expect(ranges).toEqual([{ at: 1, len: 4 }]);
  });

  test('ignores short quiet runs', () => {
    const data = ch([1, 0, 1]);
    expect(silenceRanges(data, 0, 3, 0.1, 3)).toEqual([]);
  });

  test('removeSilenceRanges removes ranges in one pass', () => {
    const data = ch([1, 0, 0, 0, 1, 2, 0, 0, 3]);
    const ranges = [
      { at: 1, len: 3 },
      { at: 6, len: 2 },
    ];
    expect(arr(removeSilenceRanges(data, ranges))).toEqual([1, 1, 2, 3]);
  });
});

describe('findZeroCross', () => {
  test('returns the target when it already sits on a zero crossing', () => {
    const data = new Float32Array([-1, -1, 0.5, 0.5]);
    expect(findZeroCross(data, 2, 100)).toBe(2);
  });

  test('searches outward for the nearest sign change', () => {
    const data = new Float32Array([-1, -1, -1, 0.5, 0.5, 0.5]);
    expect(findZeroCross(data, 1, 100)).toBe(3);
  });

  test('returns the target when no crossing exists within radius', () => {
    const data = new Float32Array([1, 1, 1]);
    expect(findZeroCross(data, 1, 2)).toBe(1);
  });
});

describe('command outcomes', () => {
  test('makeCut: undo restores the removed slice, redo re-cuts', () => {
    const src = ch([0, 1, 2, 3, 4]);
    const outcome = makeCut(src, 1, 2);
    expect(arr(outcome.channels)).toEqual([0, 3, 4]);

    // undo from the cut state → original; redo from the undone state → cut again
    const undone = applyOps(outcome.channels, outcome.undoOps);
    expect(arr(undone)).toEqual([0, 1, 2, 3, 4]);
    const redone = applyOps(undone, outcome.redoOps);
    expect(arr(redone)).toEqual([0, 3, 4]);
  });

  test('makeInsert: undo removes the inserted range, redo reinserts', () => {
    const src = ch([0, 1, 2]);
    const inserted = ch([7, 7, 7]);
    const outcome = makeInsert(src, 1, inserted);
    expect(arr(outcome.channels)).toEqual([0, 7, 7, 7, 1, 2]);

    const undone = applyOps(outcome.channels, outcome.undoOps);
    expect(arr(undone)).toEqual([0, 1, 2]);

    const redone = applyOps(undone, outcome.redoOps);
    expect(arr(redone)).toEqual([0, 7, 7, 7, 1, 2]);
  });

  test('makeRangeWrite: undo restores the before-slice', () => {
    const src = ch([1, 2, 3, 4]);
    const before = sliceRegion(src, 1, 2);
    const after = gainRange(src, 1, 2, 0.5);
    const outcome = makeRangeWrite(src, 1, before, after);
    expect(arr(outcome.channels)).toEqual([1, 1, 1.5, 4]);

    const undone = applyOps(outcome.channels, outcome.undoOps);
    expect(arr(undone)).toEqual([1, 2, 3, 4]);
  });

  test('applyOps applies splices in order (composite)', () => {
    const ops: SliceOp[] = [
      { kind: 'remove', at: 0, len: 1, removed: undefined },
      { kind: 'insert', at: 0, data: [new Float32Array([9])] },
    ];
    expect(arr(applyOps(ch([1, 2, 3]), ops))).toEqual([9, 2, 3]);
  });

  test('round-trip property: cut → undo restores identical buffers across channels', () => {
    const src = [
      new Float32Array([0.5, -0.25, 0.125, -0.75, 1, 0]),
      new Float32Array([0, -1, 0.75, 0.25, -0.5, 0.125]),
    ];
    const outcome = makeCut(src, 2, 2);
    const undone = applyOps(outcome.channels, outcome.undoOps);
    expect(undone.length).toBe(2);
    expect(Array.from(undone[0] ?? [])).toEqual(Array.from(src[0] ?? []));
    expect(Array.from(undone[1] ?? [])).toEqual(Array.from(src[1] ?? []));
  });

  test('reports changed-byte cost for the budget', () => {
    const outcome = makeCut(ch([1, 2, 3, 4]), 0, 4);
    expect(outcome.bytes).toBe(4 * 4); // one channel, 4 float32 samples
  });
});

describe('composite outcomes (round-trip)', () => {
  const ch = (vals: number[]): Float32Array[] => [new Float32Array(vals)];

  function roundTrip(
    original: Float32Array[],
    outcome: EditOutcome,
    expectEdited: number[][],
  ): void {
    const edited = outcome.channels;
    edited.forEach((data, i) => expect(Array.from(data)).toEqual(expectEdited[i]));
    // redo replays from the original onto the edited state
    expect(applyOps(original, outcome.redoOps)).toEqual(edited);
    // undo restores the original from the edited state
    expect(applyOps(edited, outcome.undoOps)).toEqual(original);
  }

  test('makeTrim keeps only the selection (double cut)', () => {
    const original = ch([1, 2, 3, 4, 5]);
    const outcome = makeTrim(original, 1, 3); // keep [2,3,4]
    roundTrip(original, outcome, [[2, 3, 4]]);
  });

  test('makeTrim at document edges', () => {
    const original = ch([1, 2, 3, 4, 5]);
    roundTrip(original, makeTrim(original, 0, 2), [[1, 2]]);
    roundTrip(original, makeTrim(original, 3, 2), [[4, 5]]);
    roundTrip(original, makeTrim(original, 0, 5), [[1, 2, 3, 4, 5]]);
  });

  test('makeOverwritePaste replaces the selection (stereo, unequal lengths)', () => {
    const original = [
      new Float32Array([1, 2, 3, 4, 5]),
      new Float32Array([10, 20, 30, 40, 50]),
    ];
    const insert = [new Float32Array([0.5, 0.25]), new Float32Array([0.125, 0.75])];
    const outcome = makeOverwritePaste(original, 1, 2, insert);
    roundTrip(original, outcome, [
      [1, 0.5, 0.25, 4, 5],
      [10, 0.125, 0.75, 40, 50],
    ]);
  });

  test('makeOverwritePaste when insert is longer than the selection', () => {
    const original = ch([1, 2, 3, 4]);
    const insert = ch([8, 8, 8, 8, 8, 8]);
    const outcome = makeOverwritePaste(original, 1, 1, insert);
    roundTrip(original, outcome, [[1, 8, 8, 8, 8, 8, 8, 3, 4]]);
  });

  test('makeRemoveSilence removes non-touching ranges and round-trips (stereo)', () => {
    const original = [
      new Float32Array([1, 0, 0, 2, 3, 0, 0, 0, 4]),
      new Float32Array([1, 0, 0, 2, 3, 0, 0, 0, 4]),
    ];
    const ranges = [
      { at: 1, len: 2 },
      { at: 5, len: 3 },
    ];
    const outcome = makeRemoveSilence(original, ranges);
    roundTrip(original, outcome, [
      [1, 2, 3, 4],
      [1, 2, 3, 4],
    ]);
  });

  test('makeRemoveSilence restores interleaved content in original order', () => {
    // A S1 B S2 C pattern — undo must not scramble segment order
    const original = ch([1, 0, 2, 0, 3]);
    const ranges = [
      { at: 1, len: 1 },
      { at: 3, len: 1 },
    ];
    const outcome = makeRemoveSilence(original, ranges);
    roundTrip(original, outcome, [[1, 2, 3]]);
  });

  test('makeRemoveSilence with empty ranges is a no-op', () => {
    const original = ch([1, 2, 3]);
    const outcome = makeRemoveSilence(original, []);
    roundTrip(original, outcome, [[1, 2, 3]]);
  });
});
