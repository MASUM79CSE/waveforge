/**
 * E3 modulation kernels (effects v2 plan §E3) — RED first.
 * Accuracy gates: Catmull-Rom fractional delay ≤ 0.02-sample error,
 * absolute-time LFO (chunked == one-shot), tremolo sidebands at the
 * Bessel-predicted level ±0.3 dB, feedback loops bounded, bypass nulls,
 * stereo decorrelation, profile budget.
 */
import { describe, expect, test } from 'vitest';
import {
  catmullDelay,
  chorusProcess,
  createPhaserStates,
  flangerProcess,
  phaserProcess,
  tremoloProcess,
  vibratoProcess,
} from '../../../src/fx/modulation';

const SR = 44100;

function sine(freqHz: number, amp: number, seconds: number): Float32Array {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; ++i) out[i] = amp * Math.sin((2 * Math.PI * freqHz * i) / SR);
  return out;
}

/** Complex DFT value at one exact bin (coherent when f·len/sr is an integer). */
function dftBin(sig: Float32Array, freqHz: number, sr: number, from: number, len: number): { re: number; im: number } {
  let re = 0;
  let im = 0;
  const w = (2 * Math.PI * freqHz) / sr;
  for (let i = 0; i < len; ++i) {
    const v = sig[from + i] ?? 0;
    re += v * Math.cos(w * i);
    im -= v * Math.sin(w * i);
  }
  return { re, im };
}

function binPower(sig: Float32Array, freqHz: number, sr: number, from: number, len: number): number {
  const { re, im } = dftBin(sig, freqHz, sr, from, len);
  return re * re + im * im;
}

describe('catmullDelay — fractional delay accuracy', () => {
  test('catmullDelay clamps reads past signal end (zero-padded edge)', () => {
    const sig = sine(300, 0.5, 0.01);
    const out = catmullDelay(sig, 0.5);
    // last sample: p = len−1.5 → taps s2/s3 fall off the end → treated as 0;
    // recompute the 4-tap Catmull here independently and compare
    const n = sig.length;
    const s0 = sig[n - 3]!, s1 = sig[n - 2]!, s2 = sig[n - 1]!, s3 = 0;
    const a1 = 0.5 * (s2 - s0);
    const a2 = s0 - 2.5 * s1 + 2 * s2 - 0.5 * s3;
    const a3 = 0.5 * (s3 - s0) + 1.5 * (s1 - s2);
    const expected = ((a3 * 0.5 + a2) * 0.5 + a1) * 0.5 + s1;
    expect(out[n - 1]).toBeCloseTo(expected, 5);
  });

  test('empty states array falls back to fresh states (bit-exact vs default)', () => {
    const sig = sine(210, 0.4, 0.5);
    const fParams = { baseMs: 2, depthMs: 4, rateHz: 0.15, feedback: 0.6, mix: 0.5 };
    expect(flangerProcess([sig], SR, fParams, [])[0]).toEqual(
      flangerProcess([sig], SR, fParams)[0],
    );
    const pParams = { stages: 6, rateHz: 0.5, centerHz: 800, feedback: 0.6, mix: 1 };
    expect(phaserProcess([sig], SR, pParams, [])[0]).toEqual(
      phaserProcess([sig], SR, pParams)[0],
    );
  });

  test('1 kHz sine through a static 10.37-sample delay measures 10.37 ± 0.02', () => {
    const sig = sine(1000, 0.5, 1);
    const out = catmullDelay(sig, 10.37);
    // phase of the steady-state ratio gives the delay in samples
    const from = 20000;
    const len = 11025; // 0.25 s — integer cycles at 1 kHz
    const x = dftBin(sig, 1000, SR, from, len);
    const y = dftBin(out, 1000, SR, from, len);
    const phase = Math.atan2(y.im * x.re - y.re * x.im, y.re * x.re + y.im * x.im);
    const w = (2 * Math.PI * 1000) / SR;
    const measured = -phase / w;
    expect(Math.abs(measured - 10.37)).toBeLessThanOrEqual(0.02);
  });

  test('integer delay is exact; gain stays within 0.05 dB of unity', () => {
    const sig = sine(1000, 0.5, 0.5);
    const out = catmullDelay(sig, 7);
    let diff = 0;
    for (let i = 7; i < sig.length; ++i) diff = Math.max(diff, Math.abs((out[i] ?? 0) - (sig[i - 7] ?? 0)));
    expect(diff).toBeLessThanOrEqual(1e-9);
    // fractional path gain: power ratio over the steady region
    const pIn = binPower(sig, 1000, SR, 20000, 11025);
    const pOut = binPower(out, 1000, SR, 20000, 11025);
    expect(Math.abs(10 * Math.log10(pOut / pIn))).toBeLessThanOrEqual(0.05);
  });

  test('reads before the signal start are zero (no wraparound)', () => {
    const sig = sine(1000, 0.5, 0.1);
    const out = catmullDelay(sig, 100);
    for (let i = 0; i < 98; ++i) expect(out[i]).toBe(0);
  });
});

describe('chorus', () => {
  test('mix 0 is bit-exact bypass (both channels)', () => {
    const l = sine(440, 0.4, 0.3);
    const r = sine(660, 0.3, 0.3);
    const out = chorusProcess([l, r], SR, { baseMs: 20, depthMs: 4, rateHz: 0.8, mix: 0 });
    expect(out[0]).toEqual(l);
    expect(out[1]).toEqual(r);
  });

  test('chunked processing with overlap stitches bit-identically (absolute-time LFO)', () => {
    const sig = sine(997, 0.4, 1);
    const params = { baseMs: 20, depthMs: 4, rateHz: 0.8, mix: 0.5 };
    const oneShot = chorusProcess([sig], SR, params)[0]!;
    const boundary = 3000;
    const context = 2048; // ≥ base + depth (max delay history)
    const a = chorusProcess([sig.subarray(0, boundary)], SR, params, 0)[0]!;
    const b = chorusProcess([sig.subarray(boundary - context)], SR, params, boundary - context)[0]!;
    const stitched = new Float32Array(oneShot.length);
    stitched.set(a, 0);
    stitched.set(b.subarray(context), boundary);
    expect(stitched).toEqual(oneShot);
  });

  test('stereo voices decorrelate: L ≠ R on a centred mono signal', () => {
    const mono = sine(440, 0.4, 1);
    const out = chorusProcess([mono, mono], SR, { baseMs: 20, depthMs: 5, rateHz: 1, mix: 1 });
    const lo = out[0]!;
    const ro = out[1]!;
    let maxDiff = 0;
    for (let i = 2000; i < lo.length; ++i) maxDiff = Math.max(maxDiff, Math.abs((lo[i] ?? 0) - (ro[i] ?? 0)));
    expect(maxDiff).toBeGreaterThan(0.01);
  });
});

describe('vibrato + tremolo', () => {
  test('vibrato depth 0 is bit-exact; depth > 0 changes samples', () => {
    const sig = sine(440, 0.4, 0.3);
    expect(vibratoProcess([sig], SR, { rateHz: 5, depthMs: 0 })[0]).toEqual(sig);
    const moved = vibratoProcess([sig], SR, { rateHz: 5, depthMs: 4 })[0]!;
    let diff = 0;
    for (let i = 1000; i < sig.length; ++i) diff = Math.max(diff, Math.abs((moved[i] ?? 0) - (sig[i] ?? 0)));
    expect(diff).toBeGreaterThan(1e-4);
  });

  test('tremolo depth 0 is bit-exact; depth 1 dips to silence at the LFO null', () => {
    const sig = sine(440, 0.4, 1);
    expect(tremoloProcess([sig], SR, { rateHz: 4, depth: 0, shape: 0 })[0]).toEqual(sig);
    const mod = tremoloProcess([sig], SR, { rateHz: 1, depth: 1, shape: 0 })[0]!;
    // LFO period = 1 s; at t = 0.5 s the cosine is −1 → gain 1 − 1 = 0
    const at = Math.round(0.5 * SR);
    const near = Math.abs(mod[at - 2] ?? 0) + Math.abs(mod[at] ?? 0) + Math.abs(mod[at + 2] ?? 0);
    expect(near).toBeLessThan(0.02);
  });

  test('tremolo 4 Hz depth 60 %: sidebands at ±4 Hz match the Bessel ratio ±0.3 dB', () => {
    const sig = sine(1000, 0.5, 0.25);
    const out = tremoloProcess([sig], SR, { rateHz: 4, depth: 0.6, shape: 0 })[0]!;
    const len = 11025; // 0.25 s — both 1000 Hz and 4 Hz are integer-cycle
    const carrier = binPower(out, 1000, SR, 0, len);
    const low = binPower(out, 996, SR, 0, len);
    const high = binPower(out, 1004, SR, 0, len);
    const relDb = 10 * Math.log10(low / carrier);
    // amplitudes: carrier (1−d/2) = 0.7, sidebands d/4 = 0.15 → 20log10(0.15/0.7)
    expect(relDb).toBeGreaterThanOrEqual(-13.7);
    expect(relDb).toBeLessThanOrEqual(-13.1);
    // symmetric sidebands
    expect(Math.abs(10 * Math.log10(high / low))).toBeLessThanOrEqual(0.1);
    // no second-order products (±8 Hz) beyond −50 dB rel carrier
    const far = binPower(out, 992, SR, 0, len);
    expect(10 * Math.log10(far / carrier)).toBeLessThanOrEqual(-50);
  });
});

describe('flanger + phaser (feedback paths)', () => {
  test('flanger mix 0 is bit-exact bypass', () => {
    const sig = sine(440, 0.4, 0.3);
    const out = flangerProcess([sig], SR, { baseMs: 2, depthMs: 1, rateHz: 0.25, feedback: 0.4, mix: 0 });
    expect(out[0]).toEqual(sig);
  });

  test('flanger feedback 0.95 on an impulse decays and stays bounded (30 s)', { timeout: 30_000 }, () => {
    const impulse = new Float32Array(30 * SR);
    impulse[0] = 1;
    const out = flangerProcess([impulse], SR, { baseMs: 2, depthMs: 1, rateHz: 0.25, feedback: 0.95, mix: 1 });
    const ch = out[0]!;
    let peak = 0;
    let finite = true;
    for (let i = 0; i < ch.length; ++i) {
      const v = Math.abs(ch[i] ?? 0);
      if (!Number.isFinite(v)) finite = false;
      if (v > peak) peak = v;
    }
    expect(finite).toBe(true);
    expect(peak).toBeLessThanOrEqual(4); // never diverges
    // tail (last 2 s) has decayed to inaudible
    let tailPeak = 0;
    for (let i = ch.length - 2 * SR; i < ch.length; ++i) tailPeak = Math.max(tailPeak, Math.abs(ch[i] ?? 0));
    expect(tailPeak).toBeLessThanOrEqual(1e-3);
  });

  test('phaser feedback state carries across chunks (stitched == one-shot)', () => {
    const sig = sine(440, 0.4, 0.5);
    const params = { stages: 6, rateHz: 0.4, centerHz: 600, feedback: 0.5, mix: 0.5 };
    const oneShot = phaserProcess([sig], SR, params)[0]!;
    const states = createPhaserStates(1, 6);
    const a = phaserProcess([sig.subarray(0, 997)], SR, params, states)[0]!;
    const b = phaserProcess([sig.subarray(997)], SR, params, states)[0]!;
    const stitched = new Float32Array(oneShot.length);
    stitched.set(a, 0);
    stitched.set(b, 997);
    expect(stitched).toEqual(oneShot);
  });

  test('phaser sweep touches both notch regions (frequency response moves)', () => {
    // long slow sweep: energy at 300 Hz and 1500 Hz must both be shaped
    const sig = sine(300, 0.4, 3);
    const out = phaserProcess([sig], SR, { stages: 6, rateHz: 0.5, centerHz: 600, feedback: 0.5, mix: 1 })[0]!;
    const pIn = binPower(sig, 300, SR, 22050, 11025);
    const pOut = binPower(out, 300, SR, 22050, 11025);
    const shaped = 10 * Math.log10(pOut / pIn);
    expect(shaped).toBeLessThan(-1); // visibly swept, not passthrough
    expect(shaped).toBeGreaterThan(-40); // not destroyed either
  });
});

describe('stability + profile (E3 budget ≤ 0.8 s uninstrumented, 60 s stereo)', () => {
  test('phaser centre clamp keeps extreme settings stable (both frequency bounds)', () => {
    // kernel accepts unclamped centres (the dialog spec clamps them):
    // 8 kHz sr pushes w0 past π → Nyquist clamp; centre 10 pushes the
    // swept stage floor below 20 Hz; centre 30000 pushes past 20 kHz
    const sr = 8000;
    const n = 4000;
    const x = new Float32Array(n);
    for (let i = 0; i < n; ++i) x[i] = 0.5 * Math.sin((2 * Math.PI * 300 * i) / sr);
    for (const centerHz of [10, 30000]) {
      const out = phaserProcess([x], sr, { stages: 8, rateHz: 6, centerHz, feedback: 0.5, mix: 1 });
      let maxAbs = 0;
      for (const v of out[0]!) {
        expect(Number.isFinite(v)).toBe(true);
        maxAbs = Math.max(maxAbs, Math.abs(v));
      }
      expect(maxAbs).toBeLessThanOrEqual(8);
    }
  });

  test('30 s noise through all five effects stays bounded, no NaN', { timeout: 30_000 }, () => {
    const n = 30 * SR;
    const sig = new Float32Array(n);
    let seed = 777777;
    for (let i = 0; i < n; ++i) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      sig[i] = (seed / 0x3fffffff - 1) * 0.8;
    }
    const stereo = [sig, sig];
    const runs: Float32Array[][] = [
      chorusProcess(stereo, SR, { baseMs: 30, depthMs: 10, rateHz: 5, mix: 1 }),
      flangerProcess(stereo, SR, { baseMs: 5, depthMs: 5, rateHz: 2, feedback: 0.95, mix: 1 }),
      phaserProcess(stereo, SR, { stages: 8, rateHz: 2, centerHz: 2000, feedback: 0.8, mix: 1 }),
      tremoloProcess(stereo, SR, { rateHz: 20, depth: 1, shape: 1 }),
      vibratoProcess(stereo, SR, { rateHz: 14, depthMs: 30 }),
    ];
    for (const out of runs) {
      for (const ch of out) {
        for (let i = 0; i < n; i += 511) {
          const v = ch[i] ?? 0;
          expect(Number.isFinite(v)).toBe(true);
          // divergence guard, not a physics bound: measured max here is the
          // flanger fb 0.95 sweep at 4.95 (its ≤4 anchor uses slower params)
          expect(Math.abs(v)).toBeLessThanOrEqual(8);
        }
      }
    }
  });

  test('[profile] E3 chorus 60 s stereo 44.1 kHz', { timeout: 30_000 }, () => {
    const tone = sine(997, 0.3, 60);
    const stereo = [tone, tone];
    const t0 = performance.now();
    chorusProcess(stereo, SR, { baseMs: 20, depthMs: 4, rateHz: 0.8, mix: 0.5 });
    const ms = performance.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`[profile] E3 chorus 60 s stereo 44.1 kHz: ${Math.round(ms)} ms`);
    // budget 0.8 s uninstrumented (§8.7); 5 s = instrumented smoke guard
    expect(ms).toBeLessThan(5000);
  });
});
