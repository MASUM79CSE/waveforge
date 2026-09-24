/**
 * E1 mastering kernels (effects v2 plan §E1, ADR 009):
 *  - true-peak engine: 4× zero-stuffing oversampler with a 65-tap Kaiser
 *    polyphase filter (β 8.5, cutoff at the old Nyquist, ≥ 80 dB image
 *    rejection) — the M5 bilinear lesson applies: the taps are normalized
 *    to an exact DC gain so detection is unbiased;
 *  - truePeakLimit: the hardLimit lookahead skeleton (sliding-window
 *    min via monotonic deque, linked stereo gain, one-pole release) fed
 *    from the oversampled envelope, with a program-adaptive fast unload;
 *  - applyNormalizeLufs: BS.1770-4 integrated measurement (M5 kernels)
 *    + flat gain clamped to ±24 dB, optional true-peak ceiling pass.
 * Pure TypeScript — no AudioContext, fully unit-tested.
 */
import { integrateLoudness } from '../engine/lufs';

export const OVER_FACTOR = 4;
const OVER_TAPS = 65;
const OVER_BETA = 8.5;

export interface LimitParams {
  ceilingDb: number;
  lookaheadMs: number;
  releaseMs: number;
}

export interface NormalizeParams {
  targetLufs: number;
  /** dBTP ceiling applied after the gain; null disables limiting. */
  ceilingDbtp: number | null;
}

/** Modified Bessel function of the first kind, order 0 (series). */
function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  for (let k = 1; k < 64; ++k) {
    const half = x / (2 * k);
    term *= half * half;
    sum += term;
    if (term < sum * 1e-16) break;
  }
  return sum;
}

/**
 * Kaiser-windowed sinc lowpass for the 4× oversampling clock; cutoff is
 * the ORIGINAL Nyquist (π/4 rad/sample at the new clock) and the DC gain
 * is normalized to exactly the stuffing factor.
 */
export function designOversampleTaps(taps: number = OVER_TAPS, beta: number = OVER_BETA): Float64Array {
  const h = new Float64Array(taps);
  const wc = Math.PI / OVER_FACTOR;
  const mid = (taps - 1) / 2;
  const i0b = besselI0(beta);
  let sum = 0;
  for (let n = 0; n < taps; ++n) {
    const m = n - mid;
    const sinc = m === 0 ? wc / Math.PI : Math.sin(wc * m) / (Math.PI * m);
    const r = (2 * n) / (taps - 1) - 1;
    const w = besselI0(beta * Math.sqrt(Math.max(0, 1 - r * r))) / i0b;
    h[n] = sinc * w;
    sum += h[n] ?? 0;
  }
  const k = OVER_FACTOR / sum;
  for (let n = 0; n < taps; ++n) h[n] = (h[n] ?? 0) * k;
  return h;
}

/** |H(f)| of the oversampling filter in dB, relative to the passband. */
export function oversampleResponseDb(freqHz: number, sampleRate: number): number {
  const taps = designOversampleTaps();
  const w = (2 * Math.PI * freqHz) / (OVER_FACTOR * sampleRate);
  let re = 0;
  let im = 0;
  for (let n = 0; n < taps.length; ++n) {
    const t = taps[n] ?? 0;
    re += t * Math.cos(w * n);
    im -= t * Math.sin(w * n);
  }
  const dc = taps.reduce((sum, t) => sum + t, 0);
  return 20 * Math.log10(Math.max(1e-12, Math.hypot(re, im) / dc));
}

/** Per-phase tap sets: phaseTaps[r][q] = h[4q + r], zero-padded to Q+1. */
function phaseTaps(taps: Float64Array): Float64Array[] {
  const qCount = Math.ceil(taps.length / OVER_FACTOR); // 17
  const phases: Float64Array[] = [];
  for (let r = 0; r < OVER_FACTOR; ++r) {
    const p = new Float64Array(qCount);
    for (let q = 0; 4 * q + r < taps.length; ++q) p[q] = taps[4 * q + r] ?? 0;
    phases.push(p);
  }
  return phases;
}

/**
 * True-peak envelope: max |filtered| over the 4 sub-samples around each
 * original sample (polyphase evaluation, zero history before sample 0).
 */
function truePeakEnvelope(ch: Float32Array, phases: Float64Array[]): Float32Array {
  const n = ch.length;
  const env = new Float32Array(n);
  const qCount = phases[0]?.length ?? 0;
  for (let i = 0; i < n; ++i) {
    let peak = 0;
    for (let r = 0; r < OVER_FACTOR; ++r) {
      const taps = phases[r] ?? (new Float64Array(0) as Float64Array);
      let acc = 0;
      const qMax = Math.min(qCount, i + 1);
      for (let q = 0; q < qMax; ++q) {
        acc += (taps[q] ?? 0) * (ch[i - q] ?? 0);
      }
      const abs = Math.abs(acc);
      if (abs > peak) peak = abs;
    }
    env[i] = peak;
  }
  return env;
}

/** O(n) sliding minimum over a forward window via a monotonic deque. */
function slidingMin(data: Float64Array, window: number): Float64Array {
  const n = data.length;
  const out = new Float64Array(n);
  const deque: number[] = [];
  let head = 0;
  const at = (i: number): number => data[i] ?? 0;
  for (let j = 0; j < n; ++j) {
    while (deque.length > head && at(deque[deque.length - 1] ?? 0) >= at(j)) deque.pop();
    deque.push(j);
    const i = j - window + 1;
    if (i >= 0) {
      while (deque.length > head && (deque[head] ?? 0) < i) head += 1;
      out[i] = at(deque[head] ?? 0);
    }
  }
  for (let i = Math.max(0, n - window + 1); i < n; ++i) {
    while (deque.length > head && (deque[head] ?? 0) < i) head += 1;
    out[i] = at(deque[head] ?? 0);
  }
  return out;
}

/** Max true-peak level of the program in dB (−Infinity for silence). */
export function truePeakDb(channels: Float32Array[]): number {
  const phases = phaseTaps(designOversampleTaps());
  let peak = 0;
  for (const ch of channels) {
    const env = truePeakEnvelope(ch, phases);
    for (let i = 0; i < env.length; ++i) {
      const v = env[i] ?? 0;
      if (v > peak) peak = v;
    }
  }
  return 20 * Math.log10(Math.max(peak, 1e-12));
}

/**
 * True-peak limiter: same lookahead skeleton as hardLimit, but the
 * detector reads the 4× oversampled envelope, so intersample peaks are
 * contained. Release is program-adaptive: a fast 5 ms unload once GR has
 * stayed under 1 dB for 20 ms, otherwise the configured release time.
 */
export function truePeakLimit(
  channels: Float32Array[],
  sampleRate: number,
  params: LimitParams,
): Float32Array[] {
  const len = channels[0]?.length ?? 0;
  if (len === 0) return channels.map(() => new Float32Array(0));

  const ceiling = Math.pow(10, params.ceilingDb / 20);
  const lookahead = Math.max(1, Math.round((sampleRate * params.lookaheadMs) / 1000));
  const releaseSlow = 1 - Math.exp(-1 / Math.max(1e-4, (sampleRate * params.releaseMs) / 1000));
  const releaseFast = 1 - Math.exp(-1 / Math.max(1e-4, sampleRate * 0.005));
  const fastAfter = Math.round(sampleRate * 0.02); // 20 ms below 1 dB GR

  const phases = phaseTaps(designOversampleTaps());
  // per-channel envelopes folded into one linked target (image preservation)
  const envelopes = channels.map((ch) => truePeakEnvelope(ch, phases));
  const target = new Float64Array(len);
  for (let i = 0; i < len; ++i) {
    let needed = 1;
    for (const env of envelopes) {
      const tp = env[i] ?? 0;
      if (tp > ceiling) {
        const g = ceiling / tp;
        if (g < needed) needed = g;
      }
    }
    target[i] = needed;
  }

  const ahead = slidingMin(target, lookahead);

  const gain = new Float64Array(len);
  let current = 1;
  let quiet = 0;
  for (let i = 0; i < len; ++i) {
    const m = ahead[i] ?? 1;
    if (m < current) {
      current = m; // attack: instant, lookahead makes it artefact-free
      quiet = 0;
    } else {
      const gr = 1 - current;
      quiet = gr < 0.109 ? quiet + 1 : 0; // GR < 1 dB (1 − 10^(−1/20) ≈ 0.109)
      const coef = quiet > fastAfter ? releaseFast : releaseSlow;
      current = Math.min(m, current + (1 - current) * coef);
    }
    gain[i] = current;
  }

  return channels.map((ch) => {
    const out = new Float32Array(len);
    for (let i = 0; i < len; ++i) out[i] = (ch[i] ?? 0) * (gain[i] ?? 0);
    return out;
  });
}

import { fxTable } from './fxCurves';
import type { AutomationCurve } from '../engine/automation';

/**
 * A6c: truePeakLimit with a per-sample ceilingDb curve (lookahead and
 * release are detector time constants — not sweepable). No curves →
 * exactly the static limiter.
 */
export function truePeakLimitSwept(
  channels: Float32Array[],
  sampleRate: number,
  params: LimitParams,
  curves: Record<string, AutomationCurve>,
): Float32Array[] {
  if (!curves || Object.keys(curves).length === 0) return truePeakLimit(channels, sampleRate, params);
  const len = channels[0]?.length ?? 0;
  if (len === 0) return channels.map(() => new Float32Array(0));
  const ceiling = fxTable(curves, 'ceilingDb', len);
  if (!ceiling) return truePeakLimit(channels, sampleRate, params);

  const lookahead = Math.max(1, Math.round((sampleRate * params.lookaheadMs) / 1000));
  const releaseSlow = 1 - Math.exp(-1 / Math.max(1e-4, (sampleRate * params.releaseMs) / 1000));
  const releaseFast = 1 - Math.exp(-1 / Math.max(1e-4, sampleRate * 0.005));
  const fastAfter = Math.round(sampleRate * 0.02);

  const phases = phaseTaps(designOversampleTaps());
  const envelopes = channels.map((ch) => truePeakEnvelope(ch, phases));
  const target = new Float64Array(len);
  for (let i = 0; i < len; ++i) {
    const thr = Math.pow(10, ceiling[i]! / 20);
    let needed = 1;
    for (const env of envelopes) {
      const tp = env[i] ?? 0;
      if (tp > thr) {
        const g = thr / tp;
        if (g < needed) needed = g;
      }
    }
    target[i] = needed;
  }

  const ahead = slidingMin(target, lookahead);

  const gain = new Float64Array(len);
  let current = 1;
  let quiet = 0;
  for (let i = 0; i < len; ++i) {
    const m = ahead[i] ?? 1;
    if (m < current) {
      current = m;
      quiet = 0;
    } else {
      const gr = 1 - current;
      quiet = gr < 0.109 ? quiet + 1 : 0;
      const coef = quiet > fastAfter ? releaseFast : releaseSlow;
      current = Math.min(m, current + (1 - current) * coef);
    }
    gain[i] = current;
  }

  return channels.map((ch) => {
    const out = new Float32Array(len);
    for (let i = 0; i < len; ++i) out[i] = (ch[i] ?? 0) * (gain[i] ?? 0);
    return out;
  });
}

/**
 * Flat gain ΔL = target − measured (clamped ±24 dB), optionally followed
 * by a true-peak ceiling pass. Exported separately for direct testing.
 */
export function normalizeGainDb(integratedLufs: number, targetLufs: number): number {
  if (!Number.isFinite(integratedLufs)) return 24;
  return Math.max(-24, Math.min(24, targetLufs - integratedLufs));
}

/** LUFS-target normalize with an optional true-peak ceiling. */
export function applyNormalizeLufs(
  channels: Float32Array[],
  sampleRate: number,
  params: NormalizeParams,
): Float32Array[] {
  const integrated = integrateLoudness(channels, sampleRate).integrated;
  const gain = Math.pow(10, normalizeGainDb(integrated, params.targetLufs) / 20);
  const gained = channels.map((ch) => {
    const out = new Float32Array(ch.length);
    for (let i = 0; i < ch.length; ++i) out[i] = (ch[i] ?? 0) * gain;
    return out;
  });
  if (params.ceilingDbtp === null) return gained;
  return truePeakLimit(gained, sampleRate, {
    ceilingDb: params.ceilingDbtp,
    lookaheadMs: 5,
    releaseMs: 60,
  });
}
