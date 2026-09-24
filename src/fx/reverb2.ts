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

export function reverb2Process(
  channels: Float32Array[],
  sampleRate: number,
  params: Reverb2Params,
  ctx?: EffectRunContext,
): Float32Array[] {
  const dry = 1 - params.mix;
  const pd = Math.max(0, Math.round((params.predelayMs * sampleRate) / 1000));

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

  const mixIn = (wet: Float64Array, ch: Float32Array): Float32Array => {
    const out = new Float32Array(ch.length);
    for (let i = 0; i < ch.length; ++i) {
      const w = i >= pd ? (wet[i - pd] ?? 0) : 0;
      out[i] = (ch[i] ?? 0) * dry + w * params.mix;
    }
    return out;
  };
  if (channels.length === 2) {
    const irL = irChannels[0]!;
    const irR = irChannels[1] ?? irChannels[0]!;
    const [wetL, wetR] = convolvePartitionedStereo(channels[0]!, channels[1]!, irL, irR);
    return [mixIn(wetL, channels[0]!), mixIn(wetR, channels[1]!)];
  }
  return channels.map((ch, c) => {
    const wet = convolvePartitioned(ch, irChannels[c % irChannels.length]!);
    return mixIn(wet, ch);
  });
}
