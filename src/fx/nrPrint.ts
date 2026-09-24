/**
 * E6a noise-print noise reduction (effects v2 plan §E6). Pure STFT kernel:
 * 2048-sample frames / 512 hop, Hann analysis, Hann² synthesis (WOLA),
 * zero padding ×2 (4096-point FFT) to bound circularity. Learn: the noise
 * print is the magnitude |N̂(k)| EMA-smoothed (0.3) across the frames of
 * the noise-only selection, averaged across channels (deterministic; no
 * Math.random anywhere). Apply: per bin |Ŝ(k)| = max(|Y(k)| − α·|N̂(k)|,
 * β·|Y(k)|), phase = noisy phase. Empty print = bit-exact identity.
 */

import { Fft } from './fft';
import type { EffectRunContext } from './types';

export const NR_FRAME = 2048;
export const NR_HOP = 512;
const FFT_N = NR_FRAME * 2; // zero padding ×2 bounds circularity
const BINS = FFT_N / 2 + 1;
const LEARN_EMA = 0.3;

export interface NrParams {
  /** Over-subtraction factor α (UI 1–4, default 2; 0 = reconstruction). */
  alpha: number;
  /** Spectral floor β (UI 0.01–0.2, default 0.05). */
  floor: number;
}

/** Periodic Hann window (COLA at NR_HOP). */
function hann(i: number): number {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / NR_FRAME);
}

/**
 * Learn the noise print from noise-only material: per-frame magnitudes
 * averaged across channels, EMA-smoothed (0.3) across frames. The average
 * is taken over per-channel magnitudes (NOT a time-domain channel mix —
 * mixing independent noises cancels variance and biases the print low).
 */
export function learnNoisePrint(channels: Float32Array[]): Float32Array {
  const len = channels[0]?.length ?? 0;
  const fft = new Fft(FFT_N);
  const print = new Float32Array(BINS);
  const magAcc = new Float64Array(BINS);
  const re = new Float64Array(FFT_N);
  const im = new Float64Array(FFT_N);
  let first = true;
  for (let s = 0; s < len; s += NR_HOP) {
    magAcc.fill(0);
    const end = Math.min(len, s + NR_FRAME);
    for (const ch of channels) {
      re.fill(0);
      im.fill(0);
      for (let i = s; i < end; ++i) re[i - s] = (ch[i] ?? 0) * hann(i - s);
      fft.forward(re, im);
      for (let k = 0; k < BINS; ++k) {
        const r = re[k]!;
        const i2 = im[k]!;
        magAcc[k] = (magAcc[k] ?? 0) + Math.sqrt(r * r + i2 * i2);
      }
    }
    for (let k = 0; k < BINS; ++k) {
      const mag = (magAcc[k] ?? 0) / channels.length;
      print[k] = first ? mag : (1 - LEARN_EMA) * print[k]! + LEARN_EMA * mag;
    }
    first = false;
  }
  return print;
}

/**
 * Spectral-subtraction NR. Output length == input length; the wet path is
 * magnitude-only (phase = noisy phase). Missing/empty print returns
 * bit-exact copies (bypass null).
 */
export function nrProcess(
  channels: Float32Array[],
  params: NrParams,
  ctx?: EffectRunContext,
): Float32Array[] {
  const print = ctx?.noisePrint;
  if (!print || print.length < BINS) return channels.map((ch) => ch.slice());

  const fft = new Fft(FFT_N);
  const alpha = params.alpha;
  const beta = params.floor;
  const analysis = new Float64Array(NR_FRAME); // w(n)
  const synth = new Float64Array(NR_FRAME); // w²(n)
  for (let i = 0; i < NR_FRAME; ++i) {
    analysis[i] = hann(i);
    synth[i] = analysis[i]! * analysis[i]!;
  }

  return channels.map((ch) => {
    const len = ch.length;
    const acc = new Float64Array(len);
    const winSum = new Float64Array(len);
    const re = new Float64Array(FFT_N);
    const im = new Float64Array(FFT_N);
    for (let s = 0; s < len; s += NR_HOP) {
      re.fill(0);
      im.fill(0);
      const end = Math.min(len, s + NR_FRAME);
      for (let i = s; i < end; ++i) re[i - s] = (ch[i] ?? 0) * analysis[i - s]!;
      fft.forward(re, im);
      for (let k = 0; k < BINS; ++k) {
        const kr = re[k]!;
        const ki = im[k]!;
        const mag = Math.sqrt(kr * kr + ki * ki);
        if (mag > 1e-30) {
          const target = Math.max(mag - alpha * (print[k] ?? 0), beta * mag);
          const scale = target / mag;
          re[k] = re[k]! * scale;
          im[k] = im[k]! * scale;
        } else {
          re[k] = 0;
          im[k] = 0;
        }
      }
      // conjugate-symmetric upper half before the inverse
      for (let k = 1; k < FFT_N / 2; ++k) {
        re[FFT_N - k] = re[k]!;
        im[FFT_N - k] = -im[k]!;
      }
      fft.inverse(re, im);
      for (let i = 0; i < NR_FRAME && s + i < len; ++i) {
        acc[s + i] = (acc[s + i] ?? 0) + re[i]! * synth[i]!;
        winSum[s + i] = (winSum[s + i] ?? 0) + analysis[i]! * synth[i]!;
      }
    }
    const out = new Float32Array(len);
    for (let i = 0; i < len; ++i) out[i] = acc[i]! / (winSum[i]! || 1);
    return out;
  });
}
