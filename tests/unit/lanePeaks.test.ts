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
