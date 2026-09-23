import { describe, expect, test } from 'vitest';
import { distortionCurve, equalPowerMix, reverbImpulse } from '../../src/fx/curves';

const SR = 8000;

/** Index read that satisfies noUncheckedIndexedAccess; NaN fails loudly. */
function at(data: Float32Array, i: number): number {
  return data[i] ?? Number.NaN;
}

/** Spec mapping: x = 2i/(n-1) - 1 (mirrors the WaveShaper curve contract). */
function xAt(i: number, n: number): number {
  return (i * 2) / Math.max(1, n - 1) - 1;
}

describe('distortionCurve', () => {
  test('amount 0 is unity (identity mapping)', () => {
    const curve = distortionCurve(0, 64);
    for (let i = 0; i < 64; ++i) {
      expect(at(curve, i)).toBeCloseTo(xAt(i, 64), 5);
    }
  });

  test('follows the AudioMass waveshaper formula (scaled x3 for unity at 0)', () => {
    // spec: f(x) = (3+g) * x * (PI/3) / (PI + g*|x|), g = round(amount)
    const n = 128;
    const curve = distortionCurve(60, n);
    const g = 60;
    for (let i = 0; i < n; ++i) {
      const x = xAt(i, n);
      const expected = ((3 + g) * x * (Math.PI / 3)) / (Math.PI + g * Math.abs(x));
      expect(at(curve, i)).toBeCloseTo(expected, 5);
    }
  });

  test('odd symmetry: f(-x) = -f(x)', () => {
    // with the spec mapping, index n-1-i is the exact mirror of i
    const curve = distortionCurve(80, 256);
    for (let i = 0; i < 128; ++i) {
      expect(at(curve, 255 - i)).toBeCloseTo(-at(curve, i), 6);
    }
  });

  test('monotonically non-decreasing', () => {
    const curve = distortionCurve(100, 512);
    for (let i = 1; i < 512; ++i) {
      expect(at(curve, i)).toBeGreaterThanOrEqual(at(curve, i - 1) - 1e-7);
    }
  });

  test('stays near unity ceiling at full drive (no runaway)', () => {
    const curve = distortionCurve(100, 256);
    expect(at(curve, 255)).toBeCloseTo(((3 + 100) * (Math.PI / 3)) / (Math.PI + 100), 3);
    let max = 0;
    for (let i = 0; i < 256; ++i) max = Math.max(max, Math.abs(at(curve, i)));
    expect(max).toBeLessThan(1.06);
  });
});

describe('reverbImpulse', () => {
  test('length is time * sampleRate, per requested channel count', () => {
    const ir = reverbImpulse(2, 1.5, 2, false, SR, 1);
    const ch0 = ir[0];
    const ch1 = ir[1];
    expect(ch0).toHaveLength(Math.round(SR * 1.5));
    expect(ch1).toHaveLength(Math.round(SR * 1.5));
    expect(reverbImpulse(1, 0.25, 2, false, SR, 1)).toHaveLength(1);
  });

  test('deterministic for a given seed, different across seeds', () => {
    const a = reverbImpulse(1, 0.5, 2, false, SR, 7)[0] ?? new Float32Array(0);
    const b = reverbImpulse(1, 0.5, 2, false, SR, 7)[0] ?? new Float32Array(0);
    const c = reverbImpulse(1, 0.5, 2, false, SR, 8)[0] ?? new Float32Array(0);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });

  test('every sample respects the pow(1 - n/len, decay) envelope bound', () => {
    const decay = 3;
    const len = Math.round(SR * 1);
    const ir = reverbImpulse(1, 1, decay, false, SR, 42)[0] ?? new Float32Array(0);
    for (let i = 0; i < len; ++i) {
      const bound = Math.pow(1 - i / len, decay);
      expect(Math.abs(at(ir, i))).toBeLessThanOrEqual(bound + 1e-9);
    }
  });

  test('energy sits at the start (forward) or end (reverse)', () => {
    const len = Math.round(SR * 1);
    const fwd = reverbImpulse(1, 1, 1.5, false, SR, 5)[0] ?? new Float32Array(0);
    const rev = reverbImpulse(1, 1, 1.5, true, SR, 5)[0] ?? new Float32Array(0);
    const centroid = (data: Float32Array): number => {
      let num = 0;
      let den = 0;
      for (let i = 0; i < data.length; ++i) {
        num += i * Math.abs(at(data, i));
        den += Math.abs(at(data, i));
      }
      return num / den;
    };
    expect(centroid(fwd)).toBeLessThan(len * 0.4);
    expect(centroid(rev)).toBeGreaterThan(len * 0.6);
  });

  test('stereo channels are independent draws', () => {
    const ir = reverbImpulse(2, 0.5, 2, false, SR, 9);
    const left = Array.from(ir[0] ?? []);
    const right = Array.from(ir[1] ?? []);
    expect(left).not.toEqual(right);
  });
});

describe('equalPowerMix', () => {
  test('endpoints', () => {
    expect(equalPowerMix(0)).toEqual({ dry: 1, wet: 0 });
    expect(equalPowerMix(1)).toEqual({ dry: 0, wet: 1 });
  });

  test('constant power across the sweep', () => {
    for (const mix of [0.25, 0.5, 0.75]) {
      const { dry, wet } = equalPowerMix(mix);
      expect(dry * dry + wet * wet).toBeCloseTo(1, 6);
    }
    expect(equalPowerMix(0.5).dry).toBeCloseTo(Math.SQRT1_2, 6);
    expect(equalPowerMix(0.5).wet).toBeCloseTo(Math.SQRT1_2, 6);
  });
});
