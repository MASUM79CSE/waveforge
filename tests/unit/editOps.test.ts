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
  seamlessLoopRange,
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

// ---- PF-06 / AM-11: seamless loop kernel ----
describe('seamlessLoopRange', () => {
  const SR = 1000; // 1 kHz sample rate keeps sample math obvious in tests
  // 1000-sample sine whose period does NOT divide the region: the wrap clicks.
  const src = new Float32Array(1200);
  for (let i = 0; i < src.length; ++i) src[i] = Math.sin((2 * Math.PI * 13.37 * i) / SR);
  const stereo = [
    src.slice(),
    src.map((v) => v * 0.5),
  ];

  test('RED: the kernel exists (module export)', () => {
    expect(seamlessLoopRange).toBeTypeOf('function');
  });

  test('region is replaced by the len−fade loop; audio outside it is kept', () => {
    const outcome = seamlessLoopRange(stereo, 100, 1000, { fadeMs: 10, repeat: 1, trim: false, snap: false, sampleRate: SR });
    const loopLen = 1000 - 10; // 10 ms @ 1 kHz = 10 samples
    // doc = [0..100) + loop(990) + [1100..1200)
    expect(outcome.channels[0]?.length).toBe(1200 - 1000 + loopLen);
    expect(outcome.channels[1]?.length).toBe(1200 - 1000 + loopLen);
  });

  test('equal-power fold: head blends tail→head, body keeps original samples', () => {
    const fade = 10;
    const outcome = seamlessLoopRange([src.slice()], 0, 1000, { fadeMs: 10, repeat: 1, trim: false, snap: false, sampleRate: SR });
    const a = arr(outcome.channels);
    const loopLen = 990;
    // body (i >= fade, inside the loop) must equal src[i] exactly
    for (let i = fade; i < loopLen; ++i) expect(a[i]).toBeCloseTo(src[i] ?? 0, 6);
    // tail beyond the region is preserved untouched
    for (let j = 0; j < 200; j += 37) expect(a[loopLen + j]).toBeCloseTo(src[1000 + j] ?? 0, 6);
    // blend start p=0: cos(0)=1 → tail sample; blend end p=1: sin(π/2)=1 → head sample
    expect(a[0]).toBeCloseTo(src[1000 - fade] ?? 0, 6); // src[end-fade]
    expect(a[fade - 1]).toBeCloseTo(src[fade - 1] ?? 0, 6); // pure head by p→1
    // mid-blend: kernel phase p = i/(fade-1); weights are equal-power sin/cos
    const i = 5;
    const p = i / (fade - 1);
    const expectVal = (src[i] ?? 0) * Math.sin(p * (Math.PI / 2)) + (src[1000 - fade + i] ?? 0) * Math.cos(p * (Math.PI / 2));
    expect(a[i]).toBeCloseTo(expectVal, 5);
  });

  test('seam at the wrap is continuous: out[last] → out[0] follows source flow', () => {
    const fade = 10;
    const outcome = seamlessLoopRange([src.slice()], 0, 1000, { fadeMs: 10, repeat: 1, trim: false, snap: false, sampleRate: SR });
    const a = arr(outcome.channels);
    // source at the seam position flows src[end-fade-1] -> src[end-fade];
    // the loop flows out[last]=src[end-fade-1] -> out[0]=src[end-fade]. Same pair.
    expect(a[989]).toBeCloseTo(src[1000 - fade - 1] ?? 0, 6);
  });

  test('repeat tiles the loop N times', () => {
    const outcome = seamlessLoopRange([src.slice()], 0, 1000, { fadeMs: 10, repeat: 3, trim: false, snap: false, sampleRate: SR });
    const a = arr(outcome.channels);
    const loopLen = 990;
    expect(a.length).toBe(loopLen * 3 + 200); // 3 tiles + the preserved tail
    for (let n = 1; n < 3; ++n) {
      for (let i = 0; i < loopLen; i += 97) {
        expect(a[n * loopLen + i]).toBeCloseTo(a[i] ?? 0, 6);
      }
    }
  });

  test('input channels are never mutated (immutable doc invariant)', () => {
    const before = Array.from(src);
    const alias = [src]; // same reference the kernel receives
    seamlessLoopRange(alias, 0, 1000, { fadeMs: 10, repeat: 1, trim: false, snap: false, sampleRate: SR });
    expect(Array.from(src)).toEqual(before);
  });

  test('fade larger than a quarter of the region is clamped', () => {
    const outcome = seamlessLoopRange([src.slice()], 0, 100, { fadeMs: 500, repeat: 1, trim: false, snap: false, sampleRate: SR });
    // fade clamps to len>>2 = 25 → doc = 75 loop + 1100 preserved tail
    expect(outcome.channels[0]?.length).toBe(1200 - 100 + 75);
  });

  test('trim removes leading/trailing near-silence (with 1 ms pad)', () => {
    const quiet = new Float32Array(1000);
    for (let i = 200; i < 800; ++i) quiet[i] = Math.sin((2 * Math.PI * 20 * i) / SR);
    const outcome = seamlessLoopRange([quiet.slice()], 0, 1000, { fadeMs: 0, repeat: 1, trim: true, snap: false, sampleRate: SR });
    // doc length is unchanged (overwrite) — the observable is WHERE the
    // region now sits: non-silent core 600 samples + 1 ms pad per side
    const replace = outcome.redoOps[0] as { at: number; len: number };
    expect(replace.at).toBeGreaterThanOrEqual(199);
    expect(replace.at + replace.len).toBeLessThanOrEqual(802);
    expect(replace.len).toBeGreaterThanOrEqual(600);
    expect(replace.len).toBeLessThanOrEqual(604);
  });

  test('snap moves edges to matched-slope zero crossings', () => {
    // 2 Hz sine @1 kHz: gentle slope so a crossing sample is numerically ~0;
    // rising crossings at i=0, 500 (period 500). Knock the start off its
    // crossing (crossing slides to i=1) and end the region past the i=500
    // crossing so the backward scan (window 10 ms = 10 samples) finds it.
    const z = new Float32Array(1000);
    for (let i = 0; i < z.length; ++i) z[i] = Math.sin((2 * Math.PI * 2 * i) / SR);
    z[0] = -0.4; // start: crossing moves to i=1 (rising, same slope family)
    const outcome = seamlessLoopRange([z.slice()], 0, 505, { fadeMs: 0, repeat: 1, trim: false, snap: true, sampleRate: SR });
    // snapped region starts at the crossing one sample in (i=1) and its end
    // lands on the rising crossing near i=500 (float-sin may shift ±1 sample)
    const replace = outcome.redoOps[0] as { at: number; len: number };
    expect(replace.at).toBe(1);
    expect(replace.len).toBeGreaterThanOrEqual(495);
    expect(replace.len).toBeLessThanOrEqual(505);
    const a = arr(outcome.channels);
    expect(Math.abs(a[1] ?? 1)).toBeLessThan(0.05); // starts on a rising zero
    expect(Math.abs(a[replace.at + replace.len - 1] ?? 1)).toBeLessThan(0.05); // ends on one
  });

  test('outcome composes overwrite-paste ops (undo restores the original region)', () => {
    const outcome = seamlessLoopRange([src.slice()], 0, 1000, { fadeMs: 10, repeat: 1, trim: false, snap: false, sampleRate: SR });
    expect(outcome.undoOps.length).toBeGreaterThan(0);
    const undone = applyOps(outcome.channels, outcome.undoOps as SliceOp[]);
    expect(undone[0]?.length).toBe(1200);
    expect(Array.from(undone[0] ?? [])).toEqual(Array.from(src));
  });
});
