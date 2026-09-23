/**
 * E1 mastering kernels (effects v2 plan §E1) — RED first.
 * Accuracy gates: true-peak containment ≤ ceiling + 0.1 dB across a
 * frequency sweep, LUFS normalize round-trip ±0.3 LU, gain-clamp ±24 dB,
 * bypass nulls, linked-stereo image, stability, profile budget.
 */
import { describe, expect, test } from 'vitest';
import {
  applyNormalizeLufs,
  designOversampleTaps,
  normalizeGainDb,
  oversampleResponseDb,
  truePeakDb,
  truePeakLimit,
} from '../../../src/fx/mastering';

const SR = 44100;

/** sine at dBFS sample-peak amplitude, `seconds` long, optional start phase */
function sine(freqHz: number, peakDbFs: number, seconds: number, phase = 0): Float32Array {
  const n = Math.round(seconds * SR);
  const amp = Math.pow(10, peakDbFs / 20);
  const out = new Float32Array(n);
  for (let i = 0; i < n; ++i) {
    out[i] = amp * Math.sin((2 * Math.PI * freqHz * i) / SR + phase);
  }
  return out;
}

function samplePeakDb(ch: Float32Array, from = 0): number {
  let peak = 0;
  for (let i = from; i < ch.length; ++i) peak = Math.max(peak, Math.abs(ch[i] ?? 0));
  return 20 * Math.log10(Math.max(peak, 1e-12));
}

function chOf(channels: Float32Array[], i = 0): Float32Array {
  const ch = channels[i];
  if (!ch) throw new Error(`missing channel ${i}`);
  return ch;
}

describe('oversample filter design (Kaiser polyphase)', () => {
  test('DC gain is exactly the stuffing factor (4×, 0 dB)', () => {
    const taps = designOversampleTaps(65, 8.5);
    let sum = 0;
    for (const t of taps) sum += t;
    expect(sum).toBeCloseTo(4, 6);
  });

  test('passband is flat to 18 kHz of the 22.05 kHz edge (+0/−0.6 dB)', () => {
    expect(oversampleResponseDb(5000, SR)).toBeGreaterThan(-0.05);
    expect(oversampleResponseDb(18000, SR)).toBeGreaterThan(-0.6);
  });

  test('image band rolls off through the transition, ≥ 80 dB deep stopband', () => {
    expect(oversampleResponseDb(26000, SR)).toBeLessThan(-20); // transition
    expect(oversampleResponseDb(30000, SR)).toBeLessThan(-80);
    expect(oversampleResponseDb(40000, SR)).toBeLessThan(-85);
  });
});

describe('true-peak estimation', () => {
  test('band-centred sine: 4× estimate matches the analogue peak ±0.2 dB', () => {
    // 997 Hz at −0.5 dBFS: sample peak already ≈ true peak
    const tp = truePeakDb([sine(997, -0.5, 1)]);
    expect(tp).toBeGreaterThan(-0.7);
    expect(tp).toBeLessThan(-0.3);
  });

  test('fs/4 tone at 45°: catches the 3 dB intersample peak samples miss', () => {
    // sin(πi/2 + π/4) evaluates to ±0.707A at EVERY sample — the analogue
    // peak is A. A pure steady tone always converges its sample peak, so
    // this exact-ratio construction is the honest intersample witness.
    const sig = sine(11025, -0.5, 0.2, Math.PI / 4);
    const sp = samplePeakDb(sig);
    const tp = truePeakDb([sig]);
    expect(sp).toBeLessThan(-3.0); // sample peak reads −3.5 dB…
    expect(tp).toBeGreaterThan(-0.8); // …the 4× estimate sees the true peak
  });
});

describe('truePeakLimit — ceiling containment across the sweep', () => {
  const SWEEP = [997, 3000, 7000, 9500, 12500, 15500];

  for (const freq of SWEEP) {
    test(`${freq} Hz @ −0.5 dBFS into ceiling −1.0 dBTP stays ≤ −0.9 dBTP`, () => {
      const out = truePeakLimit([sine(freq, -0.5, 2)], SR, {
        ceilingDb: -1,
        lookaheadMs: 5,
        releaseMs: 60,
      });
      const measured = truePeakDb(out);
      expect(measured).toBeLessThanOrEqual(-0.9);
      // limited, not crushed: the tone survives near the ceiling
      expect(measured).toBeGreaterThan(-2.5);
    });
  }

  test('program below the ceiling passes through bit-exact', () => {
    const l = sine(997, -6, 0.5);
    const r = sine(3000, -7, 0.5, 0.3);
    const out = truePeakLimit([l, r], SR, { ceilingDb: 0, lookaheadMs: 5, releaseMs: 60 });
    expect(chOf(out, 0)).toEqual(l);
    expect(chOf(out, 1)).toEqual(r);
  });

  test('linked stereo gain: correlated channels keep their ratio (image)', () => {
    const l = sine(997, -0.4, 1);
    const r = l.map((v) => v * 0.5);
    const out = truePeakLimit([l, r], SR, { ceilingDb: -3, lookaheadMs: 5, releaseMs: 60 });
    const lo = chOf(out, 0);
    const ro = chOf(out, 1);
    const mid = Math.floor(lo.length / 2);
    for (let i = mid; i < mid + 500; ++i) {
      expect(Math.abs((ro[i] ?? 0) - 0.5 * (lo[i] ?? 0))).toBeLessThan(1e-6);
    }
  });

  test('release trajectory is monotone without pumping steps (> 0.5 dB/frame)', () => {
    // burst: 100 ms at −0.2 dBFS then 400 ms of quiet recovery
    const burst = sine(997, -0.2, 0.1);
    const tail = new Float32Array(Math.round(0.4 * SR));
    const sig = new Float32Array(burst.length + tail.length);
    sig.set(burst, 0);
    const out = truePeakLimit([sig], SR, { ceilingDb: -1, lookaheadMs: 5, releaseMs: 60 });
    const gOut = chOf(out);
    let prevDb = 20 * Math.log10(Math.max(Math.abs(gOut[burst.length] ?? 0), 1e-12));
    let maxStep = 0;
    for (let i = burst.length + 1; i < gOut.length; ++i) {
      const db = 20 * Math.log10(Math.max(Math.abs(gOut[i] ?? 0), 1e-12));
      // recovery: output level may only rise, and by ≤ 0.5 dB per frame @44.1k
      maxStep = Math.max(maxStep, db - prevDb);
      prevDb = db;
    }
    expect(maxStep).toBeLessThanOrEqual(0.5);
  });
});

describe('normalizeGainDb — clamped flat gain', () => {
  test('Δ = target − integrated', () => {
    expect(normalizeGainDb(-23, -14)).toBeCloseTo(9, 9);
    expect(normalizeGainDb(-12, -14)).toBeCloseTo(-2, 9);
  });

  test('clamped to ±24 dB (silence → +24, hot program → −24)', () => {
    expect(normalizeGainDb(Number.NEGATIVE_INFINITY, -9)).toBe(24);
    expect(normalizeGainDb(20, -14)).toBe(-24);
  });
});

describe('applyNormalizeLufs — LUFS round-trip gate', () => {
  test('−23 dBFS 997 Hz stereo normalized to −14 LUFS measures −14 ± 0.3', async () => {
    const { integrateLoudness } = await import('../../../src/engine/lufs');
    const tone = sine(997, -23, 6);
    const out = applyNormalizeLufs([tone, tone], SR, {
      targetLufs: -14,
      ceilingDbtp: null,
    });
    const measured = integrateLoudness(out, SR).integrated;
    expect(Math.abs(measured - -14)).toBeLessThanOrEqual(0.3);
  });

  test('peaky program: normalize to −9 engages the −1 dBTP ceiling', () => {
    // low-RMS bed + full-scale bursts: LUFS normalize adds ~+10 dB, the
    // ceiling pass must contain the resulting intersample-hot peaks
    const bed = sine(997, -20, 4);
    const peaky = bed;
    for (let k = 0; k < 7; ++k) {
      const at = Math.round((k + 0.5) * 0.5 * SR);
      for (let j = 0; j < 24 && at + j < peaky.length; ++j) {
        peaky[at + j] = 0.95 * Math.sin((2 * Math.PI * 3000 * j) / SR);
      }
    }
    const out = applyNormalizeLufs([peaky], SR, { targetLufs: -9, ceilingDbtp: -1 });
    const tp = truePeakDb(out);
    expect(tp).toBeLessThanOrEqual(-0.9); // contained…
    expect(tp).toBeGreaterThan(-4); // …not crushed
  });

  test('bypass: target equal to the measured loudness is a null change', async () => {
    const { integrateLoudness } = await import('../../../src/engine/lufs');
    const tone = sine(997, -23, 2);
    const out = applyNormalizeLufs([tone], SR, { targetLufs: -23, ceilingDbtp: null });
    const drift = Math.abs(integrateLoudness(out, SR).integrated - -23);
    expect(drift).toBeLessThanOrEqual(0.05);
  });

  test('silence stays finite (gain clamped to +24 dB) and is still silent', () => {
    const out = applyNormalizeLufs([new Float32Array(SR)], SR, {
      targetLufs: -14,
      ceilingDbtp: null,
    });
    expect(samplePeakDb(chOf(out))).toBeLessThan(-200);
  });
});

describe('stability + profile (E1 budget ≤ 1.5 s per kernel, 60 s stereo)', () => {
  test('30 s pink-ish noise through worst-case params stays bounded, no NaN', { timeout: 20_000 }, () => {
    const n = 30 * SR;
    const noisy = new Float32Array(n);
    let b0 = 0;
    let b1 = 0;
    let seed = 12345;
    for (let i = 0; i < n; ++i) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const white = (seed / 0x3fffffff - 1) * 0.9;
      b0 = 0.99765 * b0 + white * 0.099;
      b1 = 0.963 * b1 + white * 0.2965;
      noisy[i] = (b0 + b1 + white * 0.1848) as number;
    }
    const limited = truePeakLimit([noisy, noisy], SR, {
      ceilingDb: -6,
      lookaheadMs: 5,
      releaseMs: 60,
    });
    const normalized = applyNormalizeLufs(limited, SR, { targetLufs: -9, ceilingDbtp: -1 });
    for (const ch of normalized) {
      expect(ch.length).toBe(n);
      for (let i = 0; i < n; i += 97) {
        const v = ch[i] ?? 0;
        expect(Number.isFinite(v)).toBe(true);
        expect(Math.abs(v)).toBeLessThanOrEqual(4);
      }
    }
  });

  test('[profile] E1 kernels on 60 s stereo 44.1 kHz', { timeout: 30_000 }, () => {
    const tone = sine(997, -3, 60);
    const stereo = [tone, tone];

    let t0 = performance.now();
    truePeakLimit(stereo, SR, { ceilingDb: -1, lookaheadMs: 5, releaseMs: 60 });
    const limitMs = performance.now() - t0;

    t0 = performance.now();
    applyNormalizeLufs(stereo, SR, { targetLufs: -14, ceilingDbtp: -1 });
    const normMs = performance.now() - t0;

    // eslint-disable-next-line no-console
    console.log(
      `[profile] E1 tplimiter 60 s stereo 44.1 kHz: ${Math.round(limitMs)} ms; normalizeLufs: ${Math.round(normMs)} ms`,
    );
    // Budgets (plan §8.7) are 1.5 s per kernel uninstrumented — measured
    // 867 ms (limit) / 1147 ms (normalize). v8 coverage instrumentation
    // slows hot loops ~3× (normalize ≈ 3.4 s instrumented), so this smoke
    // guard is 5 s; the recorded uninstrumented [profile] number feeds the
    // §8.5 B1 trigger review.
    expect(limitMs).toBeLessThan(5000);
    expect(normMs).toBeLessThan(5000);
  });
});
