/**
 * Native WebAudio graph builders for graph-kind effects (ADR 005). Pure
 * wiring — the caller supplies the context (live AudioContext for preview,
 * OfflineAudioContext for apply), so builders are construction-testable in
 * node with a recording fake.
 *
 * Deltas from AudioMass (ADR 005 §5): equal-power dry/wet mix; distortion
 * curve unity at 0 drive.
 */
import {
  FX_CURVE_SAMPLES,
  FX_REVERB_SEED,
  GEQ10_Q,
  GEQ20_HZ,
  GEQ20_Q,
  PG_EQ_HIGH_HZ,
  PG_EQ_LOW_HZ,
} from '../core/constants';
import { distortionCurve, equalPowerMix, reverbImpulse } from './curves';
import type { GraphOpts, Params } from './types';

export interface BuiltGraph {
  input: AudioNode;
  output: AudioNode;
}

/** Build the live/offline graph for a graphId. Unknown ids throw. */
export function buildGraph(
  ctx: BaseAudioContext,
  graphId: string,
  params: Params,
  opts: GraphOpts,
): BuiltGraph {
  switch (graphId) {
    case 'compressor':
      return buildCompressor(ctx, params);
    case 'distortion':
      return buildDistortion(ctx, params);
    case 'delay':
      return buildDelay(ctx, params);
    case 'reverb':
      return buildReverb(ctx, params, opts.channels);
    case 'pgeq':
      return buildParametricEQ(ctx, params);
    case 'geq10':
      return buildGraphicEQ(ctx, params, octaveCenters(), GEQ10_Q);
    case 'geq20':
      return buildGraphicEQ(ctx, params, GEQ20_HZ, GEQ20_Q);
    default:
      throw new Error(`buildGraph: unknown graphId ${graphId}`);
  }
}

function buildCompressor(ctx: BaseAudioContext, params: Params): BuiltGraph {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = Number(params.thresholdDb);
  comp.knee.value = Number(params.kneeDb);
  comp.ratio.value = Number(params.ratio);
  comp.attack.value = Number(params.attackMs) / 1000;
  comp.release.value = Number(params.releaseMs) / 1000;
  const makeup = ctx.createGain();
  makeup.gain.value = Math.pow(10, Number(params.makeupDb) / 20);
  comp.connect(makeup);
  return { input: comp, output: makeup };
}

function buildDistortion(ctx: BaseAudioContext, params: Params): BuiltGraph {
  const shaper = ctx.createWaveShaper();
  shaper.curve = distortionCurve(Number(params.amount), FX_CURVE_SAMPLES);
  shaper.oversample = '2x';
  return { input: shaper, output: shaper };
}

function buildDelay(ctx: BaseAudioContext, params: Params): BuiltGraph {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const feedback = ctx.createGain();
  const delay = ctx.createDelay(2);

  const mix = equalPowerMix(Number(params.mix));
  dry.gain.value = mix.dry;
  wet.gain.value = mix.wet;
  feedback.gain.value = Number(params.feedback);
  delay.delayTime.value = Number(params.time);

  input.connect(dry);
  dry.connect(output);
  input.connect(delay);
  delay.connect(wet);
  wet.connect(output);
  delay.connect(feedback);
  feedback.connect(delay);

  return { input, output };
}

function buildReverb(ctx: BaseAudioContext, params: Params, channels: number): BuiltGraph {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const convolver = ctx.createConvolver();

  const mix = equalPowerMix(Number(params.mix));
  dry.gain.value = mix.dry;
  wet.gain.value = mix.wet;

  const ir = reverbImpulse(
    Math.max(1, channels),
    Number(params.time),
    Number(params.decay),
    Boolean(params.reverse),
    ctx.sampleRate,
    FX_REVERB_SEED,
  );
  const buffer = ctx.createBuffer(ir.length, ir[0]?.length ?? 1, ctx.sampleRate);
  for (let ch = 0; ch < ir.length; ++ch) {
    buffer.getChannelData(ch).set(ir[ch] ?? new Float32Array(0));
  }
  convolver.buffer = buffer;

  input.connect(dry);
  dry.connect(output);
  input.connect(convolver);
  convolver.connect(wet);
  wet.connect(output);

  return { input, output };
}

function buildParametricEQ(ctx: BaseAudioContext, params: Params): BuiltGraph {
  const low = ctx.createBiquadFilter();
  low.type = 'lowshelf';
  low.frequency.value = PG_EQ_LOW_HZ;
  low.gain.value = Number(params.lowGainDb);

  const mid = ctx.createBiquadFilter();
  mid.type = 'peaking';
  mid.frequency.value = Number(params.midFreq);
  mid.Q.value = Number(params.midQ);
  mid.gain.value = Number(params.midGainDb);

  const high = ctx.createBiquadFilter();
  high.type = 'highshelf';
  high.frequency.value = PG_EQ_HIGH_HZ;
  high.gain.value = Number(params.highGainDb);

  low.connect(mid);
  mid.connect(high);
  return { input: low, output: high };
}

function buildGraphicEQ(
  ctx: BaseAudioContext,
  params: Params,
  centers: readonly number[],
  q: number,
): BuiltGraph {
  const bands = centers.map((hz, i) => {
    const band = ctx.createBiquadFilter();
    band.type = 'peaking';
    band.frequency.value = hz;
    band.Q.value = q;
    band.gain.value = Number(params[`band${i}`]);
    return band;
  });
  for (let i = 1; i < bands.length; ++i) {
    const prev = bands[i - 1];
    const next = bands[i];
    if (prev && next) prev.connect(next);
  }
  const first = bands[0];
  const last = bands[bands.length - 1];
  if (!first || !last) return { input: ctx.createGain(), output: ctx.createGain() };
  return { input: first, output: last };
}

function octaveCenters(): readonly number[] {
  return [31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
}
