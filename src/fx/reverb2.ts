/**
 * E4 reverb v2 kernel (effects v2 plan §E4): synthesized seeded IR set
 * (plate / room / hall / spring) or an imported IR, run through the pure
 * partitioned convolver, with predelay and wet/dry mix. Pure — the live
 * preview uses the same path through the generic effect dialog (the
 * kernel IS the ConvolverNode-equivalent, and previewing it means preview
 * and apply can never diverge).
 *
 * Output length always equals input length; the wet tail beyond the
 * region exists because fxActions pads the input with `tail` seconds of
 * post-region context / zeros (KernelEffectDef.tail mechanism, §0).
 */

import { convolvePartitioned, convolvePartitionedStereo } from './convolver';
import {
  IR_MAX_SECONDS,
  clampIrChannels,
  synthesizeIr,
  type ReverbType,
} from './reverbIr';
import { resample } from './resample';
import { fxTable } from './fxCurves';
import type { AutomationCurve } from '../engine/automation';
import type { EffectRunContext } from './types';

export interface Reverb2Params {
  type: ReverbType;
  rt60Sec: number;
  /** 0–100 %. */
  damping: number;
  /** 0–120 ms. */
  predelayMs: number;
  mix: number;
  seed: number;
}

/** The convolved wet path (no predelay, no mix) shared by static + swept. */
function reverb2Wet(
  channels: Float32Array[],
  sampleRate: number,
  params: Reverb2Params,
  ctx?: EffectRunContext,
): Float64Array[] {
  let irChannels: Float64Array[];
  const imported = ctx?.irChannels;
  if (imported && imported.length > 0) {
    let ir = clampIrChannels(imported, sampleRate, IR_MAX_SECONDS);
    if (ctx?.irSampleRate && ctx.irSampleRate !== sampleRate) {
      ir = resample(ir, ctx.irSampleRate / sampleRate);
    }
    irChannels = ir.map((ch) => Float64Array.from(ch));
  } else {
    irChannels = synthesizeIr(
      { type: params.type, rt60Sec: params.rt60Sec, damping: params.damping, seed: params.seed },
      sampleRate,
      channels.length,
    ).channels;
  }
  if (channels.length === 2) {
    const irL = irChannels[0]!;
    const irR = irChannels[1] ?? irChannels[0]!;
    const [wetL, wetR] = convolvePartitionedStereo(channels[0]!, channels[1]!, irL, irR);
    return [wetL, wetR];
  }
  return channels.map((ch, c) => convolvePartitioned(ch, irChannels[c % irChannels.length]!));
}

export function reverb2Process(
  channels: Float32Array[],
  sampleRate: number,
  params: Reverb2Params,
  ctx?: EffectRunContext,
): Float32Array[] {
  const dry = 1 - params.mix;
  const pd = Math.max(0, Math.round((params.predelayMs * sampleRate) / 1000));
  const wetArr = reverb2Wet(channels, sampleRate, params, ctx);

  const mixIn = (wet: Float64Array, ch: Float32Array): Float32Array => {
    const out = new Float32Array(ch.length);
    for (let i = 0; i < ch.length; ++i) {
      const w = i >= pd ? (wet[i - pd] ?? 0) : 0;
      out[i] = (ch[i] ?? 0) * dry + w * params.mix;
    }
    return out;
  };
  if (channels.length === 2) {
    return [mixIn(wetArr[0]!, channels[0]!), mixIn(wetArr[1]!, channels[1]!)];
  }
  return channels.map((ch, c) => mixIn(wetArr[c % wetArr.length]!, ch));
}

/**
 * A6d: reverb2 with a per-sample mix curve (region-relative samples; the IR
 * shape, predelay, damping and seed are structural — not sweepable). The
 * wet path is the SAME reverb2Wet convolve; only the mix-in differs.
 * Constant curves are BIT-IDENTICAL (per-sample 1−mix == the precomputed
 * dry for the same double); mix 0 → EXACT passthrough, mix 1 → exact wet.
 */
export function reverb2ProcessSwept(
  channels: Float32Array[],
  sampleRate: number,
  params: Reverb2Params,
  curves: Record<string, AutomationCurve>,
  ctx?: EffectRunContext,
): Float32Array[] {
  const len = channels[0]?.length ?? 0;
  const mixT = fxTable(curves, 'mix', len);
  if (!mixT) return reverb2Process(channels, sampleRate, params, ctx);
  const pd = Math.max(0, Math.round((params.predelayMs * sampleRate) / 1000));
  const wetArr = reverb2Wet(channels, sampleRate, params, ctx);
  return channels.map((ch, c) => {
    const wet = wetArr[c % wetArr.length]!;
    const out = new Float32Array(ch.length);
    for (let i = 0; i < ch.length; ++i) {
      const w = i >= pd ? (wet[i - pd] ?? 0) : 0;
      const mx = mixT[i]!;
      out[i] = (ch[i] ?? 0) * (1 - mx) + w * mx;
    }
    return out;
  });
}
