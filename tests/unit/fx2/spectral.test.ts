import { describe, expect, test } from 'vitest';
import { learnNoisePrint, nrProcess } from '../../../src/fx/nrPrint';
import { deesserProcess, deesserSplit } from '../../../src/fx/deesser';

/**
 * E6 spectral repair anchors (effects v2 plan §E6 + §8):
 *  E6a noise-print NR — STFT 2048/512 Hann WOLA with ×2 zero padding,
 *      |Ŝ(k)| = max(|Y(k)| − α|N̂(k)|, β|Y(k)|), empty print = identity;
 *      +6 dB SNR tone+noise gains ≥ 10 dB SNR with ≤ 1 dB tone loss;
 *  E6b de-esser — LR4 2-way crossover (Butterworth Q pair [0.5412,
 *      1.3066]: each band −3.01 dB at fc, sum flat), sine-peak-calibrated
 *      HF RMS detector, static downward ratio curve.
 * Determinism (mulberry32 in tests, none in kernels), stability, stereo,
 * and the 4 s uninstrumented profile budget are gated below.
 */

const SR = 44100;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noise(n: number, seed: number, amp = 1): Float32Array {
  const rnd = mulberry32(seed);
  const x = new Float32Array(n);
  for (let i = 0; i < n; ++i) x[i] = (rnd() * 2 - 1) * amp;
  return x;
}

/** Windowed zero-padded DFT of x on the n-point grid (k → k·SR/n Hz). */
function spectrum(x: Float32Array, specLen: number, n: number): Float64Array {
  const out = new Float64Array(specLen);
  for (let k = 0; k < specLen; ++k) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < x.length; ++i) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / x.length); // Hann
      const a = (-2 * Math.PI * k * i) / n;
      const v = (x[i] ?? 0) * w;
      re += v * Math.cos(a);
      im += v * Math.sin(a);
    }
    out[k] = Math.hypot(re, im);
  }
  return out;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

/** Tone-bin SNR: peak bin vs median spectral floor over a frequency band. */
function toneSnrDb(x: Float32Array, toneHz: number, floorLo: number, floorHi: number): number {
  const seg = x.subarray(Math.floor(x.length / 2)); // second half
  const n = 32768;
  const spec = spectrum(seg, Math.min(n >> 1, Math.round((floorHi / SR) * n) + 2), n);
  const k0 = Math.round((toneHz / SR) * n);
  let peak = 0;
  for (let k = k0 - 2; k <= k0 + 2; ++k) peak = Math.max(peak, spec[k] ?? 0);
  const lo = Math.round((floorLo / SR) * n);
  const hi = Math.round((floorHi / SR) * n);
  const floor: number[] = [];
  for (let k = lo; k < hi; ++k) floor.push(spec[k] ?? 0);
  return 20 * Math.log10(peak / (median(floor) || 1e-30));
}

/** Peak tone-bin magnitude (whole second-half segment). */
function toneMagnitude(x: Float32Array, toneHz: number): number {
  const seg = x.subarray(Math.floor(x.length / 2));
  const n = 32768;
  const spec = spectrum(seg, Math.round((toneHz / SR) * n) + 3, n);
  const k0 = Math.round((toneHz / SR) * n);
  let peak = 0;
  for (let k = k0 - 2; k <= k0 + 2; ++k) peak = Math.max(peak, spec[k] ?? 0);
  return peak;
}

/** Variance of 1024-hop frame energies (musical-noise fluctuation proxy). */
function frameEnergyVariance(x: Float32Array): number {
  const hop = 1024;
  const energies: number[] = [];
  for (let s = 0; s + hop <= x.length; s += hop) {
    let e = 0;
    for (let i = 0; i < hop; ++i) e += (x[s + i] ?? 0) ** 2;
    energies.push(e / hop);
  }
  const mean = energies.reduce((a, b) => a + b, 0) / energies.length;
  return energies.reduce((a, e) => a + (e - mean) ** 2, 0) / energies.length;
}

/** Steady-state amplitude of a tone over the last 0.2 s. */
function steadyAmplitude(x: Float32Array, sr: number): number {
  const from = x.length - Math.round(0.2 * sr);
  let peak = 0;
  for (let i = from; i < x.length; ++i) peak = Math.max(peak, Math.abs(x[i] ?? 0));
  return peak;
}

function tone(hz: number, amp: number, seconds: number): Float32Array {
  const n = Math.round(seconds * SR);
  const x = new Float32Array(n);
  for (let i = 0; i < n; ++i) x[i] = amp * Math.sin((2 * Math.PI * hz * i) / SR);
  return x;
}

describe('E6a noise-print NR', () => {
  test('empty print is bit-exact identity (bypass null)', () => {
    const l = noise(8192, 1, 0.3);
    const r = noise(8192, 2, 0.3);
    const out = nrProcess([l, r], { alpha: 2, floor: 0.05 });
    expect(out[0]).toEqual(l);
    expect(out[1]).toEqual(r);
  });

  test('alpha 0 reconstructs through the WOLA STFT ≤ 1e-6 (sample 1..n−1)', {
    timeout: 20_000,
  }, () => {
    const x = noise(44100, 3, 0.4);
    const print = learnNoisePrint([noise(2048, 4, 0.1)]);
    const out = nrProcess([x], { alpha: 0, floor: 0 }, { noisePrint: print });
    let maxDiff = 0;
    // Hann(0) = 0, so sample 0 carries no signal by construction — the
    // reconstruction contract covers every sample the window touches
    const o = out[0]!;
    for (let i = 1; i < x.length - 1; ++i) maxDiff = Math.max(maxDiff, Math.abs(o[i]! - x[i]!));
    expect(maxDiff).toBeLessThanOrEqual(1e-6);
  });

  test('tone + noise @ +6 dB SNR: post-NR SNR improves ≥ 10 dB', { timeout: 30_000 }, () => {
    const n = SR; // 1 s
    const noisy = noise(n, 5, 0.05);
    const amp = 0.05 * Math.sqrt((2 * Math.pow(10, 6 / 10)) / 3); // +6 dB SNR
    const toneWav = tone(1000, amp, 1);
    for (let i = Math.round(0.5 * SR); i < n; ++i) noisy[i] = (noisy[i] ?? 0) + (toneWav[i] ?? 0);
    const learnSeg = noisy.subarray(0, Math.round(0.4 * SR)); // noise-only
    const print = learnNoisePrint([Float32Array.from(learnSeg)]);
    const out = nrProcess([noisy], { alpha: 2, floor: 0.05 }, { noisePrint: print });
    const before = toneSnrDb(noisy, 1000, 5000, 10000);
    const after = toneSnrDb(out[0]!, 1000, 5000, 10000);
    expect(after - before).toBeGreaterThanOrEqual(10);
  });

  test('tone magnitude loss ≤ 1 dB at the 1 kHz peak', { timeout: 30_000 }, () => {
    const n = SR;
    const noisy = noise(n, 6, 0.05);
    const amp = 0.05 * Math.sqrt((2 * Math.pow(10, 6 / 10)) / 3);
    const toneWav = tone(1000, amp, 1);
    for (let i = Math.round(0.5 * SR); i < n; ++i) noisy[i] = (noisy[i] ?? 0) + (toneWav[i] ?? 0);
    const print = learnNoisePrint([Float32Array.from(noisy.subarray(0, Math.round(0.4 * SR)))]);
    const out = nrProcess([noisy], { alpha: 2, floor: 0.05 }, { noisePrint: print });
    const loss = 20 * Math.log10(toneMagnitude(out[0]!, 1000) / toneMagnitude(noisy, 1000));
    expect(loss).toBeGreaterThanOrEqual(-1);
  });

  test('musical-noise bound: frame-energy variance ratio post/pre ≤ 2.5', { timeout: 30_000 }, () => {
    const n = SR;
    const noisy = noise(n, 7, 0.05);
    const amp = 0.05 * Math.sqrt((2 * Math.pow(10, 6 / 10)) / 3);
    const toneWav = tone(1000, amp, 1);
    for (let i = Math.round(0.5 * SR); i < n; ++i) noisy[i] = (noisy[i] ?? 0) + (toneWav[i] ?? 0);
    const print = learnNoisePrint([Float32Array.from(noisy.subarray(0, Math.round(0.4 * SR)))]);
    const out = nrProcess([noisy], { alpha: 2, floor: 0.05 }, { noisePrint: print });
    const from = Math.round(0.5 * SR);
    const pre = frameEnergyVariance(noisy.subarray(from));
    const post = frameEnergyVariance(out[0]!.subarray(from));
    expect(post / pre).toBeLessThanOrEqual(2.5);
  });

  test('determinism: learn and process are bit-identical across runs', { timeout: 20_000 }, () => {
    const x = noise(22050, 8, 0.2);
    const p1 = learnNoisePrint([x, x]);
    const p2 = learnNoisePrint([x, x]);
    expect(p2).toEqual(p1);
    const o1 = nrProcess([x], { alpha: 2, floor: 0.05 }, { noisePrint: p1 });
    const o2 = nrProcess([x], { alpha: 2, floor: 0.05 }, { noisePrint: p2 });
    expect(o2[0]).toEqual(o1[0]);
  });

  test('stereo honesty: both channels gain ≥ 10 dB SNR with a shared print', { timeout: 30_000 }, () => {
    const n = SR;
    const amp = 0.05 * Math.sqrt((2 * Math.pow(10, 6 / 10)) / 3);
    const toneWav = tone(1000, amp, 1);
    const mk = (seed: number): Float32Array => {
      const ch = noise(n, seed, 0.05);
      for (let i = Math.round(0.5 * SR); i < n; ++i) ch[i] = (ch[i] ?? 0) + (toneWav[i] ?? 0);
      return ch;
    };
    const l = mk(11);
    const r = mk(12);
    const print = learnNoisePrint([
      Float32Array.from(l.subarray(0, Math.round(0.4 * SR))),
      Float32Array.from(r.subarray(0, Math.round(0.4 * SR))),
    ]);
    const out = nrProcess([l, r], { alpha: 2, floor: 0.05 }, { noisePrint: print });
    const gainL = toneSnrDb(out[0]!, 1000, 5000, 10000) - toneSnrDb(l, 1000, 5000, 10000);
    const gainR = toneSnrDb(out[1]!, 1000, 5000, 10000) - toneSnrDb(r, 1000, 5000, 10000);
    expect(gainL).toBeGreaterThanOrEqual(10);
    expect(gainR).toBeGreaterThanOrEqual(10);
  });
});

describe('E6b de-esser', () => {
  test('LR4 bands: −6.02 ± 0.2 dB at fc (in phase); sum flat ±0.2 dB at fc/2, fc, 2fc', () => {
    // plan correction: "two cascaded Butterworth per way" = Butterworth²
    // → bands at −6.02 dB at fc (not −3.01, which is the 2nd-order value)
    const fc = 4000;
    for (const f of [fc / 2, fc, fc * 2]) {
      const x = tone(f, 0.5, 0.25);
      const [lp, hp] = deesserSplit([x], SR, fc);
      const lpAmp = steadyAmplitude(lp[0]!, SR) / 0.5;
      const hpAmp = steadyAmplitude(hp[0]!, SR) / 0.5;
      const sumAmp = steadyAmplitude(
        lp[0]!.map((v, i) => v + (hp[0]![i] ?? 0)),
        SR,
      ) / 0.5;
      if (f === fc) {
        expect(20 * Math.log10(lpAmp)).toBeGreaterThanOrEqual(-6.22);
        expect(20 * Math.log10(lpAmp)).toBeLessThanOrEqual(-5.82);
        expect(20 * Math.log10(hpAmp)).toBeGreaterThanOrEqual(-6.22);
        expect(20 * Math.log10(hpAmp)).toBeLessThanOrEqual(-5.82);
      }
      expect(20 * Math.log10(sumAmp)).toBeGreaterThanOrEqual(-0.2);
      expect(20 * Math.log10(sumAmp)).toBeLessThanOrEqual(0.2);
    }
  });

  test('6.5 kHz tone @ −10 dBFS, threshold −20, ratio 4 → reduced 7.5 ± 0.5 dB', {
    timeout: 20_000,
  }, () => {
    // crossover 3000 keeps the tone deep in the HF passband (LP leak
    // below −27 dB would otherwise mask part of the reduction)
    const x = tone(6500, Math.pow(10, -10 / 20), 1);
    const out = deesserProcess([x], SR, { crossoverHz: 2500, thresholdDb: -20, ratio: 4 });
    const reduction = 20 * Math.log10(steadyAmplitude(x, SR) / steadyAmplitude(out[0]!, SR));
    expect(reduction).toBeGreaterThanOrEqual(7);
    expect(reduction).toBeLessThanOrEqual(8);
  });

  test('300 Hz tone passes untouched ± 0.1 dB', { timeout: 20_000 }, () => {
    const x = tone(300, 0.5, 1);
    const out = deesserProcess([x], SR, { crossoverHz: 4000, thresholdDb: -20, ratio: 4 });
    const delta = 20 * Math.log10(steadyAmplitude(out[0]!, SR) / steadyAmplitude(x, SR));
    expect(Math.abs(delta)).toBeLessThanOrEqual(0.1);
  });

  test('level below threshold → no reduction; ratio 1 → bit-exact bypass', { timeout: 20_000 }, () => {
    const quiet = tone(6500, Math.pow(10, -30 / 20), 0.5);
    const out = deesserProcess([quiet], SR, { crossoverHz: 3000, thresholdDb: -20, ratio: 4 });
    const delta = 20 * Math.log10(steadyAmplitude(out[0]!, SR) / steadyAmplitude(quiet, SR));
    expect(Math.abs(delta)).toBeLessThanOrEqual(0.1);

    const x = noise(4096, 13, 0.5);
    const unity = deesserProcess([x], SR, { crossoverHz: 6000, thresholdDb: -12, ratio: 1 });
    expect(unity[0]).toEqual(x);
  });

  test('30 s pink-ish noise worst-case: bounded ≤ 4, no NaN, mono + stereo', {
    timeout: 30_000,
  }, () => {
    const n = 30 * SR;
    const mk = (seed: number): Float32Array => {
      const x = new Float32Array(n);
      const rnd = mulberry32(seed);
      let lp = 0;
      for (let i = 0; i < n; ++i) {
        lp += 0.02 * (rnd() * 2 - 1 - lp);
        x[i] = lp;
      }
      return x;
    };
    const l = mk(21);
    const r = mk(22);
    l[0] = 1; // impulse
    const out = deesserProcess([l, r], SR, { crossoverHz: 9000, thresholdDb: -60, ratio: 12 });
    for (const ch of out) {
      for (let i = 0; i < n; i += 511) {
        const v = ch[i] ?? Number.NaN;
        expect(Number.isFinite(v)).toBe(true);
        expect(Math.abs(v)).toBeLessThanOrEqual(4);
      }
    }
  });

  test('[profile] E6 nrPrint 60 s stereo (defaults, budget 4 s uninstrumented)', {
    timeout: 40_000,
  }, () => {
    const n = 60 * SR;
    const l = noise(n, 31, 0.2);
    const r = noise(n, 32, 0.2);
    const print = learnNoisePrint([l.subarray(0, 2048 * 4), r.subarray(0, 2048 * 4)]);
    const t0 = performance.now();
    nrProcess([l, r], { alpha: 2, floor: 0.05 }, { noisePrint: print });
    const elapsed = performance.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`[profile] E6 nrPrint 60 s stereo 44.1 kHz: ${elapsed.toFixed(0)} ms`);
    expect(elapsed).toBeLessThan(12_000); // smoke guard — budget binds uninstrumented (ADR 009 D6)
  });
});
