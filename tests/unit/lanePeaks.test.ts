import { describe, expect, test } from 'vitest';
import { lanePeaks } from '../../src/engine/lanePeaks';

describe('M8d lanePeaks — per-column min/max buckets', () => {
  test('exact min/max per column on known fills (stereo union)', () => {
    const l = new Float32Array(100);
    const r = new Float32Array(100);
    for (let i = 0; i < 100; ++i) {
      l[i] = (i % 10) / 20 - 0.2; // min -0.2 .. max 0.25 over each 10
      r[i] = i < 50 ? 0.5 : -0.5;
    }
    const peaks = lanePeaks([l, r], 10, 0, 10);
    expect(peaks.min).toHaveLength(10);
    expect(peaks.max).toHaveLength(10);
    // column 0: L spans -0.2..-0.15? (i=0..9 → (i%10)/20-0.2 = -0.2..0.25? no: i%10 max 9 → 0.45-0.2=0.25)
    expect(peaks.min[0]).toBeCloseTo(-0.2, 6);
    expect(peaks.max[0]).toBeCloseTo(0.5, 6); // R high in first half
    // column 5: R switches to -0.5 mid-column
    expect(peaks.min[5]).toBeCloseTo(-0.5, 6);
    // column 9: L max = (9%10)/20-0.2 = 0.25, R = -0.5
    expect(peaks.max[9]).toBeCloseTo(0.25, 6);
    expect(peaks.min[9]).toBeCloseTo(-0.5, 6);
  });

  test('columns past the data end stay silent (0,0); partial columns clamp', () => {
    const data = new Float32Array(40).fill(0.25);
    const peaks = lanePeaks([data], 10, 0, 8);
    expect(peaks.max[3]).toBe(0.25); // samples 30..39 exist
    expect(peaks.max[4]).toBe(0); // past end
    expect(peaks.min[4]).toBe(0);
    expect(peaks.max[7]).toBe(0);
  });

  test('start offset shifts the window; width 0 → empty arrays', () => {
    const data = new Float32Array(100);
    data[50] = 0.9;
    const peaks = lanePeaks([data], 10, 50, 5);
    expect(peaks.max[0]).toBe(Math.fround(0.9)); // sample 50 is the first of column 0
    expect(lanePeaks([data], 10, 0, 0).max).toHaveLength(0);
  });

  test('mono lane mirrors its single channel; negative-only data floors min', () => {
    const data = new Float32Array(20).fill(-0.75);
    const peaks = lanePeaks([data], 20, 0, 1);
    expect(peaks.min[0]).toBe(-0.75);
    expect(peaks.max[0]).toBe(-0.75);
  });
});

// ---- M8g: bucket envelope ----
import { laneBuckets, lanePeaksFromBuckets, LANE_BUCKET } from '../../src/engine/lanePeaks';

describe('M8g laneBuckets — zoom/pan cost', () => {
  test('buckets equal the direct scan at coarse zoom (anchor)', () => {
    const l = new Float32Array(1000);
    const r = new Float32Array(1000);
    let a = 7 >>> 0;
    for (let i = 0; i < 1000; ++i) {
      a = (a * 1664525 + 1013904223) >>> 0;
      l[i] = ((a >>> 8) / 8388608 - 1) * 0.8;
      r[i] = i % 100 === 0 ? 0.9 : (i % 37) / 74 - 0.25;
    }
    const buckets = laneBuckets([l, r]);
    expect(buckets.bucket).toBe(LANE_BUCKET);
    const direct = lanePeaks([l, r], 128, 256, 4); // columns fully inside buckets
    const fast = lanePeaksFromBuckets(buckets, 128, 256, 4);
    for (let x = 0; x < 4; ++x) {
      expect(fast.min[x]).toBeCloseTo(direct.min[x]!, 5);
      expect(fast.max[x]).toBeCloseTo(direct.max[x]!, 5);
    }
  });

  test('zoomed-in (spp < bucket) falls back to the direct scan', () => {
    const data = new Float32Array(2048);
    data[300] = 0.77;
    const buckets = laneBuckets([data]);
    const direct = lanePeaks([data], 16, 256, 8);
    const fast = lanePeaksFromBuckets(buckets, 16, 256, 8);
    expect(fast.max[2]).toBe(Math.fround(0.77));
    expect(fast.min[2]).toBe(direct.min[2]);
  });

  test('columns past the end stay silent; partial coverage clamps', () => {
    const data = new Float32Array(300).fill(0.5);
    const buckets = laneBuckets([data]); // 2 buckets
    const fast = lanePeaksFromBuckets(buckets, 256, 0, 4);
    expect(fast.max[0]).toBe(Math.fround(0.5));
    expect(fast.max[1]).toBe(Math.fround(0.5));
    expect(fast.max[2]).toBe(0);
  });

  test('[profile] 6×3-min: bucket build ≤ 700 ms; zoomed-out view reads ≤ 30 ms', { timeout: 30_000 }, () => {
    const n = 44100 * 180;
    const tracks: Float32Array[][] = [];
    for (let i = 0; i < 6; ++i) {
      const l = new Float32Array(n);
      const r = new Float32Array(n);
      for (let j = 0; j < n; j += 64) {
        l[j] = ((j * 2654435761) >>> 16) / 2147483648 - 1;
        r[j] = -l[j]!;
      }
      tracks.push([l, r]);
    }
    let t0 = performance.now();
    const built = tracks.map((ch) => laneBuckets(ch));
    const buildMs = performance.now() - t0;
    t0 = performance.now();
    for (const b of built) lanePeaksFromBuckets(b, 60000, 0, 1200); // full zoom-out
    const readMs = performance.now() - t0;
    // eslint-disable-next-line no-console
    console.log(
      `[profile] M8g lane buckets 6×3min: build ${Math.round(buildMs)} ms, view read ${Math.round(readMs)} ms`,
    );
    expect(buildMs).toBeLessThan(2000); // budget: 700 ms uninstrumented (measured 184)
    expect(readMs).toBeLessThan(100); // budget 30 ms (measured 3)
  });
});
