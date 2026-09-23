import { describe, expect, test } from 'vitest';
import { resample } from '../../src/fx/resample';

function zeroCrossings(data: Float32Array): number {
  let count = 0;
  for (let i = 1; i < data.length; ++i) {
    const a = data[i - 1] ?? 0;
    const b = data[i] ?? 0;
    if ((a < 0 && b >= 0) || (a >= 0 && b < 0)) count += 1;
  }
  return count;
}

function chOf(channels: Float32Array[], i = 0): Float32Array {
  const ch = channels[i];
  if (!ch) throw new Error(`missing channel ${i}`);
  return ch;
}

describe('resample kernel (varispeed)', () => {
  test('factor 1 is bit-exact identity', () => {
    const ch = [new Float32Array([0.5, -0.25, 0.125, -0.875, 0])];
    expect(resample(ch, 1)).toHaveLength(1);
    expect(Array.from(chOf(resample(ch, 1)))).toEqual(Array.from(chOf(ch)));
  });

  test('factor 2 halves the length, keeping every other input sample', () => {
    const out = chOf(resample([new Float32Array([1, 2, 3, 4])], 2));
    expect(out).toHaveLength(2);
    expect(Array.from(out)).toEqual([1, 3]);
  });

  test('factor 0.5 doubles the length with linear interpolation (golden)', () => {
    const out = chOf(resample([new Float32Array([1, 2, 3, 4])], 0.5));
    expect(out).toHaveLength(8);
    expect(Array.from(out)).toEqual([1, 1.5, 2, 2.5, 3, 3.5, 4, 4]);
  });

  test('DC passes through at any factor', () => {
    const dc = new Float32Array(64).fill(0.25);
    for (const f of [0.3, 0.7, 1.5, 3]) {
      const out = chOf(resample([dc], f));
      for (const v of out) expect(v).toBeCloseTo(0.25, 6);
    }
  });

  test('doubling the factor doubles the frequency density', () => {
    const sr = 8000;
    const freq = 500;
    const len = 1600; // 100 cycles
    const ch = new Float32Array(len);
    for (let i = 0; i < len; ++i) ch[i] = Math.sin((2 * Math.PI * freq * i) / sr);
    const out = chOf(resample([ch], 2));
    expect(out).toHaveLength(800);
    // zero crossings are unchanged in count (same cycles) but twice as dense
    const inDensity = zeroCrossings(ch) / (len / sr);
    const outDensity = zeroCrossings(out) / (out.length / sr);
    const ratio = outDensity / inDensity;
    expect(ratio).toBeGreaterThan(1.8);
    expect(ratio).toBeLessThan(2.2);
  });

  test('all channels share the same output length', () => {
    const out = resample([new Float32Array([1, 2, 3, 4, 5]), new Float32Array([9, 8, 7])], 0.75);
    expect(out[0]).toHaveLength(out[1]?.length ?? -1);
    expect(chOf(out).length).toBeGreaterThan(3);
  });
});
