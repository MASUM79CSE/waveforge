/**
 * E1c soft-knee compressor kernel (effects v2 plan §E1) — RED first.
 * Accuracy gates: exact piecewise static curve, steady-state GR ±0.1 dB
 * across a 1 dB input ladder, per-channel independence, bypass null,
 * profile budget.
 */
import { describe, expect, test } from 'vitest';
import {
  compressorGainDb,
  compressKernel,
  type CompressorParams,
} from '../../../src/fx/compressor';

const SR = 44100;

function sineAmplitude(rmsDb: number, seconds: number): Float32Array {
  const n = Math.round(seconds * SR);
  const amp = Math.pow(10, rmsDb / 20) * Math.SQRT2;
  const out = new Float32Array(n);
  for (let i = 0; i < n; ++i) {
    out[i] = amp * Math.sin((2 * Math.PI * 997 * i) / SR);
  }
  return out;
}

function rmsDb(ch: Float32Array, from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < to; ++i) {
    const v = ch[i] ?? 0;
    sum += v * v;
  }
  const mean = sum / Math.max(1, to - from);
  return 10 * Math.log10(Math.max(mean, 1e-20));
}

function chOf(channels: Float32Array[], i = 0): Float32Array {
  const ch = channels[i];
  if (!ch) throw new Error(`missing channel ${i}`);
  return ch;
}

const BASE: CompressorParams = {
  thresholdDb: -24,
  ratio: 4,
  kneeDb: 6,
  attackMs: 5,
  releaseMs: 150,
  makeupDb: 0,
};

describe('compressorGainDb — exact piecewise static curve', () => {
  test('below the knee: zero reduction', () => {
    expect(compressorGainDb(-60, -24, 4, 6)).toBe(0);
    expect(compressorGainDb(-27.1, -24, 4, 6)).toBe(0); // T − W/2 = −27
  });

  test('above the knee: classic linear region (1 − 1/R)(x − T)', () => {
    expect(compressorGainDb(-10, -24, 4, 6)).toBeCloseTo((-10 - -24) * 0.75, 12);
    expect(compressorGainDb(0, -24, 4, 6)).toBeCloseTo((0 - -24) * 0.75, 12);
  });

  test('inside the knee: quadratic branch, continuous at both edges', () => {
    const w = 6;
    const t = -24;
    const inside = compressorGainDb(t, -24, 4, 6); // x = T → (1/R−1)·(W/2)²/(2W)… centre
    expect(inside).toBeCloseTo((0.75 * 9) / 12, 12);
    // edge continuity: quadratic value at T+W/2 equals the linear branch
    const edgeQ = compressorGainDb(t + w / 2, -24, 4, 6);
    const edgeL = compressorGainDb(t + w / 2 + 1e-9, -24, 4, 6);
    expect(edgeQ).toBeCloseTo(edgeL, 6);
    const lowEdge = compressorGainDb(t - w / 2, -24, 4, 6);
    expect(lowEdge).toBeCloseTo(0, 12);
    expect(inside).toBeGreaterThan(0);
  });

  test('hard knee (W=0): classic (x − T)(1 − 1/R) for x > T', () => {
    expect(compressorGainDb(-10, -24, 4, 0)).toBeCloseTo(14 * 0.75, 12);
    expect(compressorGainDb(-30, -24, 4, 0)).toBe(0);
  });

  test('ratio 1 is bypass algebra (zero reduction at any level)', () => {
    expect(compressorGainDb(0, -24, 1, 6)).toBe(0);
  });
});

describe('compressKernel — steady-state GR ladder (±0.1 dB gate)', () => {
  test('input ladder −60…0 dB matches the static curve through the kernel', () => {
    for (let level = -60; level <= 0; level += 1) {
      const sig = sineAmplitude(level, 2);
      const out = compressKernel([sig], SR, BASE);
      const grMeasured = level - rmsDb(chOf(out), Math.round(1.5 * SR), 2 * SR);
      const grExpected = compressorGainDb(level, BASE.thresholdDb, BASE.ratio, BASE.kneeDb);
      expect(Math.abs(grMeasured - grExpected)).toBeLessThanOrEqual(0.1);
    }
  });

  test('hard-knee settings agree the same way', () => {
    const params: CompressorParams = { ...BASE, kneeDb: 0, ratio: 8, thresholdDb: -30 };
    for (const level of [-45, -35, -31, -25, -15, -5]) {
      const sig = sineAmplitude(level, 2);
      const out = compressKernel([sig], SR, params);
      const grMeasured = level - rmsDb(chOf(out), Math.round(1.5 * SR), 2 * SR);
      const grExpected = compressorGainDb(level, params.thresholdDb, params.ratio, 0);
      expect(Math.abs(grMeasured - grExpected)).toBeLessThanOrEqual(0.1);
    }
  });
});

describe('compressKernel — dynamics behaviour', () => {
  test('bypass (ratio 1, makeup 0) is bit-exact', () => {
    const sig = sineAmplitude(-6, 0.5);
    const out = compressKernel([sig], SR, { ...BASE, ratio: 1 });
    expect(chOf(out)).toEqual(sig);
  });

  test('channels are detected independently (R quiet stays untouched)', () => {
    const loud = sineAmplitude(-8, 1);
    const quiet = sineAmplitude(-40, 1);
    const out = compressKernel([loud, quiet], SR, { ...BASE, kneeDb: 0 });
    const grL = -8 - rmsDb(chOf(out, 0), Math.round(0.7 * SR), SR);
    const grR = -40 - rmsDb(chOf(out, 1), Math.round(0.7 * SR), SR);
    expect(grL).toBeGreaterThan(2); // loud channel compressed
    expect(Math.abs(grR)).toBeLessThan(0.05); // quiet channel untouched
  });

  test('attack ramps in, no overshoot past the static target', () => {
    const sig = sineAmplitude(-6, 0.5);
    const out = compressKernel([sig], SR, { ...BASE, attackMs: 20, kneeDb: 0 });
    const earlyDb = rmsDb(chOf(out), 0, Math.round(0.002 * SR));
    const lateDb = rmsDb(chOf(out), Math.round(0.4 * SR), Math.round(0.5 * SR));
    // GR grows over the attack, never beyond the static target + 0.2 dB
    expect(earlyDb).toBeGreaterThan(lateDb);
    const grLate = -6 - lateDb;
    expect(grLate).toBeLessThanOrEqual(compressorGainDb(-6, -24, 4, 0) + 0.2);
  });

  test('makeup gain applies after compression', () => {
    const sig = sineAmplitude(-6, 1);
    const plain = compressKernel([sig], SR, BASE);
    const made = compressKernel([sig], SR, { ...BASE, makeupDb: 6 });
    const gain =
      rmsDb(chOf(made), Math.round(0.7 * SR), SR) - rmsDb(chOf(plain), Math.round(0.7 * SR), SR);
    expect(gain).toBeCloseTo(6, 6);
  });
});

describe('stability + profile (E1 budget ≤ 1.5 s, 60 s stereo)', () => {
  test('30 s worst-case input stays bounded, no NaN', { timeout: 20_000 }, () => {
    const n = 30 * SR;
    const sig = new Float32Array(n);
    let seed = 987654321;
    for (let i = 0; i < n; ++i) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      sig[i] = (seed / 0x3fffffff - 1) * 1.5;
    }
    const out = compressKernel([sig, sig], SR, {
      thresholdDb: -60,
      ratio: 20,
      kneeDb: 24,
      attackMs: 0.5,
      releaseMs: 1000,
      makeupDb: 24,
    });
    for (const ch of out) {
      for (let i = 0; i < n; i += 97) {
        const v = ch[i] ?? 0;
        expect(Number.isFinite(v)).toBe(true);
        expect(Math.abs(v)).toBeLessThanOrEqual(4);
      }
    }
  });

  test('[profile] E1 compressor 60 s stereo 44.1 kHz', { timeout: 30_000 }, () => {
    const stereo = [sineAmplitude(-6, 60), sineAmplitude(-10, 60)];
    const t0 = performance.now();
    compressKernel(stereo, SR, BASE);
    const ms = performance.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`[profile] E1 compressor 60 s stereo 44.1 kHz: ${Math.round(ms)} ms`);
    // budget 1.5 s uninstrumented (measured 621 ms); instrumentation ~3× →
    // the smoke guard here is 5 s (see mastering.test.ts)
    expect(ms).toBeLessThan(5000);
  });
});
