/**
 * PF-03 Audio Repair kernels (AM-09): De-Click, Edit Repair (splice
 * smoothing) and Hum Notch — behaviour-level ports of the reference
 * repair contract. All three channel processors mutate their argument IN
 * PLACE (the caller owns a region copy) and return the number of repairs
 * performed, exactly like the reference `deClickChannel` /
 * `repairSpliceChannel`. The hum filter is a deterministic RBJ notch
 * cascade (same contract as the reference web-audio chain: notches at
 * f·h, harmonics capped below Nyquist, Q as given).
 */

import { designBiquad, processBiquad } from './biquad';

export type RepairSens = 'low' | 'med' | 'high';
export type HumMode = '50' | '60' | 'auto';

/** Smooth step-limited Hermite (cubic) interpolation of x[s..e) — the
 * reference splice/click window fill: endpoints + slopes pinned. */
function hermiteFill(x: Float32Array, s: number, e: number): void {
  const x0 = x[s - 1]!;
  const x1 = x[e]!;
  const m0 = 0.5 * (x[s]! - x[s - 2]!);
  const m1 = 0.5 * (x[e + 1]! - x[e - 1]!);
  const span = e - (s - 1);
  for (let j = s; j < e; ++j) {
    const t = (j - (s - 1)) / span;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    x[j] = h00 * x0 + h10 * m0 * span + h01 * x1 + h11 * m1 * span;
  }
}

/**
 * De-Click: detect short bipolar energy spikes (vinyl pops, mouth clicks)
 * against an adaptive EMA of per-sample delta energy and interpolate
 * across them. Sensitivity: low = conservative … high = most aggressive.
 * Returns the number of clicks repaired. Input shorter than 128 samples
 * is refused (0 repairs).
 */
export function deClickChannel(x: Float32Array, sampleRate: number, sens: RepairSens): number {
  const len = x.length;
  if (len < 128) return 0;
  const k = sens === 'low' ? 6 : sens === 'high' ? 3 : 4;
  const maxW = Math.max(8, Math.trunc(sampleRate * 0.002));
  const minW = 2;
  const margin = 2;
  const absFloor = sens === 'low' ? 0.03 : sens === 'high' ? 0.008 : 0.015;
  let ema = 0;
  const boot = Math.min(2048, len);
  for (let i = 1; i < boot; ++i) ema += Math.abs(x[i]! - x[i - 1]!);
  ema = ema / (boot - 1) || 1e-9;
  if (ema < 1e-4) ema = 1e-4;
  const alpha = 1 / 2048;
  let count = 0;
  let i = 4;
  while (i < len - maxW - 4) {
    const sd = x[i]! - x[i - 1]!;
    const d = sd < 0 ? -sd : sd;
    if (d > ema * k && d > absFloor) {
      const thresh = d * 0.4;
      let end = i + 1;
      const maxEnd = i + maxW;
      let posMax = sd;
      let negMax = sd;
      while (end < maxEnd && Math.abs(x[end]! - x[end - 1]!) > thresh) {
        const dd = x[end]! - x[end - 1]!;
        if (dd > posMax) posMax = dd;
        if (dd < negMax) negMax = dd;
        ++end;
      }
      const w = end - i;
      const hitMax = end >= maxEnd;
      const bipolar = posMax > thresh && -negMax > thresh;
      if (w >= minW && !hitMax && bipolar) {
        let s = i - margin;
        let e = end + margin;
        if (s < 2) s = 2;
        if (e > len - 2) e = len - 2;
        hermiteFill(x, s, e);
        ++count;
        i = e + 4;
        continue;
      }
    }
    ema = ema * (1 - alpha) + d * alpha;
    if (ema < 1e-4) ema = 1e-4;
    ++i;
  }
  return count;
}

/**
 * Edit Repair: smooth DC-offset splices between joined audio of similar
 * energy (same-direction step, balanced variance, isolated — not a note
 * onset) with a short Hermite ramp. Use after pasting from another
 * source. Returns the number of splices smoothed; refuses < 512 samples.
 */
export function repairSpliceChannel(x: Float32Array, sampleRate: number, sens: RepairSens): number {
  const len = x.length;
  if (len < 512) return 0;
  const k = sens === 'low' ? 8 : sens === 'high' ? 4 : 6;
  const absFloor = sens === 'low' ? 0.05 : sens === 'high' ? 0.015 : 0.025;
  const dcFloor = sens === 'low' ? 0.04 : sens === 'high' ? 0.008 : 0.018;
  const dcW = Math.max(256, Math.trunc(sampleRate * 0.02));
  const fadeW = Math.max(16, Math.trunc(sampleRate * 0.004));
  const halfFade = fadeW >> 1;
  let ema = 0;
  const boot = Math.min(2048, len);
  for (let i = 1; i < boot; ++i) ema += Math.abs(x[i]! - x[i - 1]!);
  ema = ema / (boot - 1) || 1e-4;
  if (ema < 1e-4) ema = 1e-4;
  const alpha = 1 / 2048;
  let count = 0;
  let i = dcW + halfFade + 4;
  while (i < len - dcW - halfFade - 4) {
    const d = x[i]! - x[i - 1]!;
    const absD = d < 0 ? -d : d;
    if (absD > ema * k && absD > absFloor) {
      let isolated = true;
      for (let ck = 1; ck <= 20; ++ck) {
        if (i + ck >= len) break;
        const dd = x[i + ck]! - x[i + ck - 1]!;
        if ((dd < 0 ? -dd : dd) > absD * 0.5) {
          isolated = false;
          break;
        }
      }
      if (isolated) {
        let preMean = 0;
        let postMean = 0;
        let preE = 0;
        let postE = 0;
        for (let j = 1; j <= dcW; ++j) {
          const pv = x[i - j]!;
          const pov = x[i + j - 1]!;
          preMean += pv;
          postMean += pov;
          preE += pv * pv;
          postE += pov * pov;
        }
        preMean /= dcW;
        postMean /= dcW;
        const dcDiff = postMean - preMean;
        const absDc = dcDiff < 0 ? -dcDiff : dcDiff;
        const sameDir = (d > 0 && dcDiff > 0) || (d < 0 && dcDiff < 0);
        const preVar = preE / dcW - preMean * preMean;
        const postVar = postE / dcW - postMean * postMean;
        const loV = preVar < postVar ? preVar : postVar;
        const hiV = preVar < postVar ? postVar : preVar;
        const balanced = loV > 1e-6 && hiV < loV * 4;
        if (sameDir && balanced && absDc > dcFloor && absDc > absD * 0.5) {
          let s = i - halfFade;
          let e = i + halfFade;
          if (s < 2) s = 2;
          if (e > len - 2) e = len - 2;
          hermiteFill(x, s, e);
          ++count;
          i = e + dcW;
          continue;
        }
      }
    }
    ema = ema * (1 - alpha) + absD * alpha;
    if (ema < 1e-4) ema = 1e-4;
    ++i;
  }
  return count;
}

/** Goertzel power of `freq` over the first `n` samples (reference math). */
export function goertzelMag(x: Float32Array, freq: number, sampleRate: number, n: number): number {
  if (n > x.length) n = x.length;
  const k = Math.trunc(0.5 + (n * freq) / sampleRate);
  const omega = (2 * Math.PI * k) / n;
  const coeff = 2 * Math.cos(omega);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < n; ++i) {
    const s0 = x[i]! + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

/**
 * Mains frequency resolution: fixed 50/60, or auto — Goertzel at both
 * candidates over up to 2 s (min 256, else 4096 from the offset), pick
 * the stronger, then fine-scan ±1 Hz in 0.1 Hz steps. Reference contract.
 */
export function resolveHumFreq(
  x: Float32Array,
  sampleRate: number,
  off: number,
  len: number,
  mode: HumMode,
): number {
  if (mode === '50') return 50;
  if (mode === '60') return 60;
  let n = Math.min(len, Math.trunc(sampleRate * 2));
  if (n < 256) n = Math.min(x.length - off, 4096);
  n = Math.min(n, x.length - off);
  const sub = x.subarray(off, off + n);
  const m50 = goertzelMag(sub, 50, sampleRate, n);
  const m60 = goertzelMag(sub, 60, sampleRate, n);
  const center = m60 > m50 ? 60 : 50;
  let best = center;
  let bestMag = 0;
  for (let f = center - 1; f <= center + 1; f += 0.1) {
    const m = goertzelMag(sub, f, sampleRate, n);
    if (m > bestMag) {
      bestMag = m;
      best = f;
    }
  }
  return best;
}

/**
 * Hum Notch: cascade up to `harmonics` RBJ notch filters at freq·h
 * (skipping at/above Nyquist) over every channel, in place. Same contract
 * as the reference chain (default 8 harmonics, Q 12); coefficients come
 * from the shared biquad engine (ADR 009) — no duplicate DSP here.
 */
export function humNotchChannels(
  channels: readonly Float32Array[],
  sampleRate: number,
  freq: number,
  harmonics = 8,
  q = 12,
): void {
  for (let h = 1; h <= harmonics; ++h) {
    const f = freq * h;
    if (f >= sampleRate * 0.5) break;
    const c = designBiquad('notch', f, 0, q, sampleRate);
    for (const ch of channels) processBiquad(ch, c);
  }
}
