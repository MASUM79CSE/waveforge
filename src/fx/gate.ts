/**
 * Noise gate kernel (ADR 005 §5): peak-follower envelope (fast attack,
 * smooth release, linked across channels) driving a downward expander
 * g = (env/threshold)^ratio below the threshold. Ships as the v1
 * noise-reduction fallback (Build Plan §11 — RNNoise parked).
 */

export interface GateParams {
  thresholdDb: number;
  ratio: number;
  attackMs: number;
  releaseMs: number;
}

import { fxTable } from './fxCurves';
import type { AutomationCurve } from '../engine/automation';

/**
 * A6c: noiseGate with per-sample thresholdDb / ratio curves (attack and
 * release are detector time constants — not sweepable). No curves →
 * exactly the static kernel.
 */
export function noiseGateSwept(
  channels: Float32Array[],
  sampleRate: number,
  params: GateParams,
  curves: Record<string, AutomationCurve>,
): Float32Array[] {
  if (!curves || Object.keys(curves).length === 0) return noiseGate(channels, sampleRate, params);
  const len = channels[0]?.length ?? 0;
  if (len === 0) return channels.map(() => new Float32Array(0));
  const threshold = fxTable(curves, 'thresholdDb', len);
  const ratio = fxTable(curves, 'ratio', len);
  if (!threshold && !ratio) return noiseGate(channels, sampleRate, params);

  const attackCoef = 1 - Math.exp(-1 / Math.max(1e-4, (sampleRate * params.attackMs) / 1000));
  const releaseCoef = 1 - Math.exp(-1 / Math.max(1e-4, (sampleRate * params.releaseMs) / 1000));

  const gains = new Float32Array(len);
  let env = 0;
  let g = 0;
  for (let i = 0; i < len; ++i) {
    let peak = 0;
    for (const ch of channels) {
      const abs = Math.abs(ch[i] ?? 0);
      if (abs > peak) peak = abs;
    }
    const coef = peak > env ? attackCoef : releaseCoef;
    env = coef * peak + (1 - coef) * env;
    const thr = threshold ? Math.pow(10, threshold[i]! / 20) : Math.pow(10, params.thresholdDb / 20);
    const rat = ratio ? ratio[i]! : params.ratio;
    const target = env >= thr ? 1 : Math.pow(env / thr, rat);
    const gCoef = target > g ? attackCoef : releaseCoef;
    g = gCoef * target + (1 - gCoef) * g;
    gains[i] = g;
  }

  return channels.map((ch) => {
    const out = new Float32Array(len);
    for (let i = 0; i < len; ++i) out[i] = (ch[i] ?? 0) * (gains[i] ?? 0);
    return out;
  });
}

export function noiseGate(
  channels: Float32Array[],
  sampleRate: number,
  params: GateParams,
): Float32Array[] {
  const len = channels[0]?.length ?? 0;
  if (len === 0) return channels.map(() => new Float32Array(0));

  const threshold = Math.pow(10, params.thresholdDb / 20);
  const attackCoef = 1 - Math.exp(-1 / Math.max(1e-4, (sampleRate * params.attackMs) / 1000));
  const releaseCoef = 1 - Math.exp(-1 / Math.max(1e-4, (sampleRate * params.releaseMs) / 1000));

  // envelope over the loudest channel (linked gating, image preserved);
  // the GAIN is smoothed too (attack up / release down) so gate transitions
  // never click, even while the envelope oscillates within a cycle
  const gains = new Float32Array(len);
  let env = 0;
  let g = 0;
  for (let i = 0; i < len; ++i) {
    let peak = 0;
    for (const ch of channels) {
      const abs = Math.abs(ch[i] ?? 0);
      if (abs > peak) peak = abs;
    }
    const coef = peak > env ? attackCoef : releaseCoef;
    env = coef * peak + (1 - coef) * env;
    const target = env >= threshold ? 1 : Math.pow(env / threshold, params.ratio);
    const gCoef = target > g ? attackCoef : releaseCoef;
    g = gCoef * target + (1 - gCoef) * g;
    gains[i] = g;
  }

  return channels.map((ch) => {
    const out = new Float32Array(len);
    for (let i = 0; i < len; ++i) out[i] = (ch[i] ?? 0) * (gains[i] ?? 0);
    return out;
  });
}
