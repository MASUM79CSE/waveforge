/**
 * E1c soft-knee compressor kernel (effects v2 plan §E1, ADR 009).
 * Feed-forward RMS detection (10 ms window, per channel), exact piecewise
 * static gain curve (hard/soft knee), one-pole attack/release smoothing
 * in the dB domain, makeup gain applied after compression. Pure — the
 * graph-node compressor it replaces could not be anchor-tested.
 */

export interface CompressorParams {
  thresholdDb: number;
  ratio: number;
  kneeDb: number;
  attackMs: number;
  releaseMs: number;
  makeupDb: number;
}

/**
 * Static gain reduction (positive dB) for an input level xDb, from the
 * standard soft-knee output equations (continuous at both knee edges):
 *   x ≤ T − W/2                       → 0
 *   T − W/2 < x < T + W/2             → (1 − 1/R)(x − T + W/2)² / (2W)
 *   x ≥ T + W/2                       → (1 − 1/R)(x − T)
 * W = 0 degenerates to the classic hard knee (x − T)(1 − 1/R) for x > T.
 */
export function compressorGainDb(
  xDb: number,
  thresholdDb: number,
  ratio: number,
  kneeDb: number,
): number {
  if (ratio <= 1) return 0;
  const gr = 1 - 1 / ratio;
  if (kneeDb <= 0) {
    return xDb > thresholdDb ? (xDb - thresholdDb) * gr : 0;
  }
  const a = xDb - thresholdDb + kneeDb / 2;
  if (a <= 0) return 0;
  if (a >= kneeDb) return (xDb - thresholdDb) * gr;
  return gr * ((a * a) / (2 * kneeDb));
}

import { fxTable } from './fxCurves';
import type { AutomationCurve } from '../engine/automation';

/**
 * Compress with per-channel independent detection. Steady-state GR
 * matches compressorGainDb exactly (one-pole smoothing converges);
 * attack and release are time-constant one-poles in the dB domain.
 *
 * A6c: the AUDIO-SHAPING params (thresholdDb, ratio, kneeDb, makeupDb)
 * accept per-sample curves; the TIME-DOMAIN params (attackMs, releaseMs)
 * are NOT sweepable — their coefficients shape the detector, not the
 * audio directly, and curves under those keys are ignored.
 */
export function compressKernelSwept(
  channels: Float32Array[],
  sampleRate: number,
  params: CompressorParams,
  curves: Record<string, AutomationCurve>,
): Float32Array[] {
  if (!curves || Object.keys(curves).length === 0) return compressKernel(channels, sampleRate, params);
  const len = channels[0]?.length ?? 0;
  const threshold = fxTable(curves, 'thresholdDb', len);
  const ratio = fxTable(curves, 'ratio', len);
  const knee = fxTable(curves, 'kneeDb', len);
  const makeup = fxTable(curves, 'makeupDb', len);
  if (!threshold && !ratio && !knee && !makeup) return compressKernel(channels, sampleRate, params);

  const window = Math.max(1, Math.round(sampleRate * 0.010));
  const attackCoef =
    params.attackMs <= 0 ? 1 : 1 - Math.exp(-1 / Math.max(1e-4, (sampleRate * params.attackMs) / 1000));
  const releaseCoef = 1 - Math.exp(
    -1 / Math.max(1e-4, (sampleRate * params.releaseMs) / 1000),
  );

  return channels.map((ch) => {
    const n = ch.length;
    const out = new Float32Array(n);
    let sum = 0;
    let gr = 0;
    for (let i = 0; i < n; ++i) {
      const v = ch[i] ?? 0;
      sum += v * v;
      if (i >= window) {
        const old = ch[i - window] ?? 0;
        sum -= old * old;
      }
      const count = Math.min(i + 1, window);
      const levelDb = 10 * Math.log10(Math.max(sum / count, 1e-12));
      const target = compressorGainDb(
        levelDb,
        threshold ? threshold[i]! : params.thresholdDb,
        ratio ? ratio[i]! : params.ratio,
        knee ? knee[i]! : params.kneeDb,
      );
      const coef = target >= gr ? attackCoef : releaseCoef;
      gr += (target - gr) * coef;
      const mk = makeup ? Math.pow(10, makeup[i]! / 20) : Math.pow(10, params.makeupDb / 20);
      out[i] = v * Math.pow(10, -gr / 20) * mk;
    }
    return out;
  });
}
export function compressKernel(
  channels: Float32Array[],
  sampleRate: number,
  params: CompressorParams,
): Float32Array[] {
  const window = Math.max(1, Math.round(sampleRate * 0.010)); // 10 ms RMS
  const attackCoef =
    params.attackMs <= 0 ? 1 : 1 - Math.exp(-1 / Math.max(1e-4, (sampleRate * params.attackMs) / 1000));
  const releaseCoef = 1 - Math.exp(
    -1 / Math.max(1e-4, (sampleRate * params.releaseMs) / 1000),
  );
  const makeup = Math.pow(10, params.makeupDb / 20);

  return channels.map((ch) => {
    const n = ch.length;
    const out = new Float32Array(n);
    let sum = 0; // running Σx² over the sliding window
    let gr = 0; // smoothed gain reduction, dB (≥ 0)
    for (let i = 0; i < n; ++i) {
      const v = ch[i] ?? 0;
      sum += v * v;
      if (i >= window) {
        const old = ch[i - window] ?? 0;
        sum -= old * old;
      }
      const count = Math.min(i + 1, window);
      const levelDb = 10 * Math.log10(Math.max(sum / count, 1e-12));
      const target = compressorGainDb(levelDb, params.thresholdDb, params.ratio, params.kneeDb);
      const coef = target >= gr ? attackCoef : releaseCoef;
      gr += (target - gr) * coef;
      out[i] = v * Math.pow(10, -gr / 20) * makeup;
    }
    return out;
  });
}
