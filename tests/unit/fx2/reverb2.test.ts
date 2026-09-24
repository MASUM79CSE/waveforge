import { describe, expect, test } from 'vitest';
import { Fft } from '../../../src/fx/fft';
import { convolvePartitioned, convolvePartitionedStereo } from '../../../src/fx/convolver';
import {
  IR_MAX_SECONDS,
  envelopeGain,
  mulberry32,
  synthesizeIr,
} from '../../../src/fx/reverbIr';
import { reverb2Process } from '../../../src/fx/reverb2';

/**
 * E4 reverb v2 anchors (effects v2 plan §E4 + §8): pure partitioned
 * convolver ≤1e-6 vs direct convolution, seeded IR synthesis with the
 * exact exponential envelope, Schroeder RT60 ±5 %, predelay leading
 * silence ±1 sample, determinism, stability and the 1.5 s profile budget.
 */

const SR = 44100;

function impulse(len: number): Float32Array {
  const x = new Float32Array(len);
  x[0] = 1;
  return x;
}

function noise(n: number, seed: number): Float32Array {
  const rnd = mulberry32(seed);
  const x = new Float32Array(n);
  for (let i = 0; i < n; ++i) x[i] = rnd() * 2 - 1;
  return x;
}

/** Schroeder backward-integration T60 from the −5 dB to −35 dB window. */
function measuredT60(y: ArrayLike<number>, sr: number): number {
  const cum = new Float64Array(y.length + 1);
  let sum = 0;
  for (let i = y.length - 1; i >= 0; --i) {
    sum += (y[i] ?? 0) * (y[i] ?? 0);
    cum[i] = sum;
  }
  const e0 = cum[0] ?? 0;
  if (e0 <= 0) return Number.NaN;
  let t5 = -1;
  let t35 = -1;
  for (let i = 0; i < y.length; ++i) {
    const db = 10 * Math.log10((cum[i] ?? 0) / e0);
    if (t5 < 0 && db <= -5) t5 = i;
    if (db <= -35) {
      t35 = i;
      break;
    }
  }
  if (t5 < 0 || t35 < 0 || t35 <= t5) return Number.NaN;
  return ((t35 - t5) / sr) * 2; // 30 dB span → ×2 extrapolates to T60
}

describe('fft (radix-2, float64)', () => {
  test('inverse(forward(x)) round-trips ≤1e-12 at 4096 points', () => {
    const n = 4096;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    const rnd = mulberry32(7);
    for (let i = 0; i < n; ++i) {
      re[i] = rnd() * 2 - 1;
      im[i] = rnd() * 2 - 1;
    }
    const re0 = Float64Array.from(re);
    const fft = new Fft(n);
    fft.forward(re, im);
    fft.inverse(re, im);
    let maxDiff = 0;
    for (let i = 0; i < n; ++i) maxDiff = Math.max(maxDiff, Math.abs((re[i] ?? 0) - (re0[i] ?? 0)));
    expect(maxDiff).toBeLessThanOrEqual(1e-12);
  });

  test('rejects non-power-of-two sizes', () => {
    expect(() => new Fft(100)).toThrow(/power of 2/);
  });

  test('forward matches the naive DFT ≤1e-9 at 64 points', () => {
    const n = 64;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    const rnd = mulberry32(8);
    for (let i = 0; i < n; ++i) re[i] = rnd() * 2 - 1;
    const fft = new Fft(n);
    const re0 = Float64Array.from(re);
    const im0 = Float64Array.from(im);
    fft.forward(re, im);
    for (let k = 0; k < n; ++k) {
      let sr = 0;
      let si = 0;
      for (let t = 0; t < n; ++t) {
        const a = (-2 * Math.PI * k * t) / n;
        const c = Math.cos(a);
        const s = Math.sin(a);
        sr += (re0[t] ?? 0) * c - (im0[t] ?? 0) * s;
        si += (re0[t] ?? 0) * s + (im0[t] ?? 0) * c;
      }
      expect(re[k] ?? 0).toBeCloseTo(sr, 9);
      expect(im[k] ?? 0).toBeCloseTo(si, 9);
    }
  });
});

describe('partitioned OLA convolver', () => {
  test('random 2048-tap IR × 4096 signal: max abs diff vs direct ≤ 1e-6', () => {
    const sig = noise(4096, 11);
    const ir = noise(2048, 12);
    // direct reference (float64)
    const direct = new Float64Array(sig.length);
    for (let i = 0; i < sig.length; ++i) {
      let acc = 0;
      const jMax = Math.min(ir.length, i + 1);
      for (let j = 0; j < jMax; ++j) acc += (sig[i - j] ?? 0) * (ir[j] ?? 0);
      direct[i] = acc;
    }
    const fast = convolvePartitioned(sig, ir);
    let maxDiff = 0;
    for (let i = 0; i < sig.length; ++i) maxDiff = Math.max(maxDiff, Math.abs(fast[i]! - direct[i]!));
    expect(maxDiff).toBeLessThanOrEqual(1e-6);
  });

  test('stereo packed path matches direct convolution ≤1e-6 (2-partition random IRs)', () => {
    const l = noise(5000, 41);
    const r = noise(5000, 42);
    const irL = noise(9000, 43);
    const irR = noise(9000, 44);
    const [outL, outR] = convolvePartitionedStereo(l, r, irL, irR);
    for (const [sig, ir, out] of [
      [l, irL, outL],
      [r, irR, outR],
    ] as const) {
      let maxDiff = 0;
      for (let i = 0; i < sig.length; ++i) {
        let acc = 0;
        const jMax = Math.min(ir.length, i + 1);
        for (let j = 0; j < jMax; ++j) acc += (sig[i - j] ?? 0) * (ir[j] ?? 0);
        maxDiff = Math.max(maxDiff, Math.abs(out[i]! - acc));
      }
      expect(maxDiff).toBeLessThanOrEqual(1e-6);
    }
  });

  test('impulse IR reproduces the signal ≤1e-9; output length == input length', () => {
    const sig = noise(5000, 21);
    const ir = impulse(2048);
    const out = convolvePartitioned(sig, ir);
    expect(out).toHaveLength(sig.length);
    for (let i = 1000; i < 1200; ++i) expect(out[i]!).toBeCloseTo(sig[i]!, 9);
  });
});

describe('seeded IR synthesis', () => {
  test('envelope g(n)=10^(−3n/(RT60·Fs)) is 1 at n=0 and −60 dB exactly at n=RT60·Fs', () => {
    const rt60 = 2;
    expect(envelopeGain(0, rt60, SR)).toBe(1);
    expect(envelopeGain(Math.round(rt60 * SR), rt60, SR)).toBeCloseTo(1e-3, 12);
    expect(envelopeGain(Math.round(rt60 * SR) / 2, rt60, SR)).toBeCloseTo(10 ** -1.5, 12);
  });

  test('same seed → bit-identical IR; different seed → different IR', () => {
    const spec = { type: 0 as const, rt60Sec: 1, damping: 30, seed: 1234 };
    const a = synthesizeIr(spec, SR, 2);
    const b = synthesizeIr(spec, SR, 2);
    expect(a.channels.length).toBe(2);
    expect(b.channels[0]).toEqual(a.channels[0]);
    expect(b.channels[1]).toEqual(a.channels[1]);
    const c = synthesizeIr({ ...spec, seed: 999 }, SR, 2);
    let differs = 0;
    for (let i = 0; i < 1000; ++i) if (c.channels[0]![i] !== a.channels[0]![i]) ++differs;
    expect(differs).toBeGreaterThan(900);
  });

  test('stereo plate channels are decorrelated (lag-0 |corr| < 0.3)', () => {
    const ir = synthesizeIr({ type: 0, rt60Sec: 1, damping: 30, seed: 1234 }, SR, 2);
    const [l, r] = ir.channels;
    let ab = 0;
    let aa = 0;
    let bb = 0;
    for (let i = 0; i < l!.length; ++i) {
      ab += l![i]! * r![i]!;
      aa += l![i]! * l![i]!;
      bb += r![i]! * r![i]!;
    }
    expect(Math.abs(ab / Math.sqrt(aa * bb))).toBeLessThan(0.3);
  });

  test('ER taps: room 8–16 in 5–35 ms; hall 16–24 in 20–80 ms', () => {
    const room = synthesizeIr({ type: 1, rt60Sec: 1.5, damping: 20, seed: 55 }, SR, 1);
    expect(room.erTapTimesMs.length).toBeGreaterThanOrEqual(8);
    expect(room.erTapTimesMs.length).toBeLessThanOrEqual(16);
    for (const t of room.erTapTimesMs) {
      expect(t).toBeGreaterThanOrEqual(5);
      expect(t).toBeLessThanOrEqual(35);
    }
    const hall = synthesizeIr({ type: 2, rt60Sec: 2.5, damping: 20, seed: 56 }, SR, 1);
    expect(hall.erTapTimesMs.length).toBeGreaterThanOrEqual(16);
    expect(hall.erTapTimesMs.length).toBeLessThanOrEqual(24);
    for (const t of hall.erTapTimesMs) {
      expect(t).toBeGreaterThanOrEqual(20);
      expect(t).toBeLessThanOrEqual(80);
    }
  });

  test('spring IR shows ≥3 comb notches ≥12 dB deep below 8 kHz', () => {
    const spring = synthesizeIr({ type: 3, rt60Sec: 2, damping: 0, seed: 57 }, SR, 1);
    const n = 1 << Math.ceil(Math.log2(spring.channels[0]!.length));
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    re.set(spring.channels[0]!, 0);
    const fft = new Fft(n);
    fft.forward(re, im);
    const bins = n >> 1;
    const magDb: number[] = [];
    for (let k = 0; k < bins; ++k) magDb.push(10 * Math.log10((re[k]! ** 2 + im[k]! ** 2) || 1e-30));
    const binHz = SR / n;
    let notches = 0;
    for (let k = 8; k < Math.floor(8000 / binHz) - 8; ++k) {
      const m = magDb[k]!;
      if (m < magDb[k - 1]! && m < magDb[k + 1]!) {
        const left = Math.max(...magDb.slice(Math.max(0, k - 60), k));
        const right = Math.max(...magDb.slice(k + 1, k + 61));
        if (Math.min(left, right) - m >= 12) ++notches;
      }
    }
    expect(notches).toBeGreaterThanOrEqual(3);
  });
});

describe('reverb2 kernel (accuracy gates)', () => {
  const base = { type: 0 as const, damping: 30, predelayMs: 0, mix: 1, seed: 1234 };

  test('plate RT60 measured (Schroeder) within ±5 % for 1/2/4/8 s', { timeout: 20_000 }, () => {
    for (const rt60 of [1, 2, 4, 8]) {
      const len = Math.round(rt60 * SR) + 1;
      const out = reverb2Process([impulse(len)], SR, { ...base, rt60Sec: rt60 })[0]!;
      const t = measuredT60(out, SR);
      expect(t).toBeGreaterThanOrEqual(rt60 * 0.95);
      expect(t).toBeLessThanOrEqual(rt60 * 1.05);
    }
  });

  test('all four types land RT60 2 s ±5 %', { timeout: 20_000 }, () => {
    for (const type of [0, 1, 2, 3] as const) {
      const len = 2 * SR + 1;
      const out = reverb2Process([impulse(len)], SR, { ...base, type, rt60Sec: 2 })[0]!;
      const t = measuredT60(out, SR);
      expect(t).toBeGreaterThanOrEqual(2 * 0.95);
      expect(t).toBeLessThanOrEqual(2 * 1.05);
    }
  });

  test('predelay 25 ms → leading silence of 1102 ± 1 samples at 44.1 kHz', () => {
    const out = reverb2Process([impulse(SR)], SR, { ...base, rt60Sec: 0.5, predelayMs: 25 })[0]!;
    let first = -1;
    for (let i = 0; i < out.length; ++i)
      if (out[i] !== 0) {
        first = i;
        break;
      }
    const expected = Math.round((25 * SR) / 1000);
    expect(first).toBeGreaterThanOrEqual(expected - 1);
    expect(first).toBeLessThanOrEqual(expected + 1);
  });

  test('mix 0 is bit-exact bypass; output length == input length (mono + stereo)', () => {
    const l = noise(4410, 31);
    const r = noise(4410, 32);
    const out = reverb2Process([l, r], SR, {
      type: 2,
      rt60Sec: 2.5,
      damping: 80,
      predelayMs: 100,
      mix: 0,
      seed: 77,
    });
    expect(out[0]).toEqual(l);
    expect(out[1]).toEqual(r);
  });

  test('ctx IR drives the kernel (delta IR → IR); 16 s import clamps to 15 s', () => {
    // (a) a known 3-tap IR comes through the convolution exactly
    const ir = new Float32Array(3);
    ir[0] = 0.5;
    ir[1] = 0.25;
    ir[2] = 0.125;
    const out = reverb2Process([impulse(64)], SR, { ...base, rt60Sec: 1 }, {
      irChannels: [ir],
      irSampleRate: SR,
    })[0]!;
    expect(out[0]).toBeCloseTo(0.5, 6);
    expect(out[1]).toBeCloseTo(0.25, 6);
    expect(out[2]).toBeCloseTo(0.125, 6);
    expect(out[40]).toBeCloseTo(0, 9); // float64 spectral rounding dust at most
    // (b) imports are capped at 15 s — wet beyond the cap is silent
    const longIr = [noise(Math.round(16 * SR), 41)];
    const big = reverb2Process([impulse(Math.round(16.5 * SR))], SR, { ...base, rt60Sec: 1 }, {
      irChannels: longIr,
      irSampleRate: SR,
    })[0]!;
    let tailMax = 0;
    const from = Math.round((IR_MAX_SECONDS + 0.1) * SR);
    for (let i = from; i < big.length; ++i) tailMax = Math.max(tailMax, Math.abs(big[i] ?? 0));
    expect(tailMax).toBeLessThanOrEqual(1e-9); // float64 spectral dust at most
  });

  test(
    '30 s stereo noise (RT60 3 s) + RT60 12 s impulse: bounded ≤4, no NaN',
    { timeout: 30_000 },
    () => {
      const n = 30 * SR;
      const l = new Float32Array(n);
      const r = new Float32Array(n);
      const rnd = mulberry32(99);
      let lp = 0;
      for (let i = 0; i < n; ++i) {
        const w = rnd() * 2 - 1;
        lp += 0.02 * (w - lp); // pinkish
        l[i] = lp;
        r[i] = -lp;
      }
      const worst = { ...base, type: 1 as const, rt60Sec: 3, damping: 100, predelayMs: 120 };
      for (const out of reverb2Process([l, r], SR, worst)) {
        for (let i = 0; i < n; i += 511) {
          expect(Number.isFinite(out[i] ?? Number.NaN)).toBe(true);
          expect(Math.abs(out[i] ?? 0)).toBeLessThanOrEqual(4);
        }
      }
      const long = reverb2Process([impulse(SR), impulse(SR)], SR, {
        ...base,
        type: 0,
        rt60Sec: 12,
        predelayMs: 120,
      });
      for (const ch of long)
        for (const v of ch) {
          expect(Number.isFinite(v)).toBe(true);
          expect(Math.abs(v)).toBeLessThanOrEqual(4);
        }
    },
  );

  test('[profile] E4 reverb2 60 s stereo 44.1 kHz (defaults, budget 1.5 s uninstrumented)', { timeout: 30_000 }, () => {
    const n = 60 * SR;
    const l = noise(n, 61);
    const r = noise(n, 62);
    const t0 = performance.now();
    reverb2Process([l, r], SR, {
      type: 0,
      rt60Sec: 1.8,
      damping: 30,
      predelayMs: 20,
      mix: 0.25,
      seed: 1234,
    });
    const elapsed = performance.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`[profile] E4 reverb2 60 s stereo 44.1 kHz: ${elapsed.toFixed(0)} ms`);
    expect(elapsed).toBeLessThan(5_000); // smoke guard — budget binds uninstrumented (ADR 009 D6)
  });
});
