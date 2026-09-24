/**
 * Built-in effect definitions (ADR 005). Order here = Effects-menu order.
 * All parameter labels point at the i18n catalog; specs double as the
 * dialog UI contract and the validation clamp ranges.
 */
import { FX_MAX_FEEDBACK, FX_MIN_TAIL_GAIN, GEQ20_HZ } from '../core/constants';
import { applyNormalizeLufs, truePeakLimit } from './mastering';
import { EQ_BAND_COUNT, eqBandsFromParams, processParamEq } from './paramEq';
import { registerEffect } from './registry';
import { compressKernel } from './compressor';
import { noiseGate } from './gate';
import { resample } from './resample';
import type { EffectDef, Params, ParamSpec } from './types';

function num(
  key: string,
  labelKey: string,
  min: number,
  max: number,
  step: number,
  default_: number,
): ParamSpec {
  return { key, labelKey, kind: 'number', min, max, step, default: default_ };
}

function bool(key: string, labelKey: string, default_: boolean): ParamSpec {
  return { key, labelKey, kind: 'bool', min: 0, max: 1, step: 1, default: default_ };
}

/** Delay tail: repeats until they drop below FX_MIN_TAIL_GAIN. */
function delayTailSeconds(params: Params): number {
  const time = Number(params.time) || 0;
  const feedback = Math.min(FX_MAX_FEEDBACK, Math.max(0, Number(params.feedback) || 0));
  if (feedback <= FX_MIN_TAIL_GAIN) return time;
  const repeats = Math.ceil(Math.log(FX_MIN_TAIL_GAIN) / Math.log(feedback));
  return time * Math.max(1, repeats);
}

const OCTAVE_HZ = [31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

/** 4 flat numeric params per band — the generic registry/validation layer. */
function pgeq8Specs(): ParamSpec[] {
  const specs: ParamSpec[] = [];
  for (let b = 0; b < EQ_BAND_COUNT; ++b) {
    specs.push(num(`b${b}Type`, 'paramEqType', 0, 5, 1, 0));
    specs.push(num(`b${b}Freq`, 'paramEqFreq', 20, 20000, 1, Math.round(40 * Math.pow(400, b / 7))));
    specs.push(num(`b${b}Gain`, 'paramEqGain', -18, 18, 0.5, 0));
    specs.push(num(`b${b}Q`, 'paramEqQ', 0.1, 16, 0.1, 1));
  }
  return specs;
}

const DEFS: EffectDef[] = [
  {
    id: 'fx.compressor',
    labelKey: 'fxCompressor',
    kind: 'kernel',
    process: (channels, sampleRate, params) =>
      compressKernel(channels, sampleRate, {
        thresholdDb: Number(params.thresholdDb),
        ratio: Number(params.ratio),
        kneeDb: Number(params.kneeDb),
        attackMs: Number(params.attackMs),
        releaseMs: Number(params.releaseMs),
        makeupDb: Number(params.makeupDb),
      }),
    specs: [
      num('thresholdDb', 'paramThreshold', -60, 0, 1, -24),
      num('kneeDb', 'paramKnee', 0, 24, 1, 6),
      num('ratio', 'paramRatio', 1, 20, 0.5, 4),
      num('attackMs', 'paramAttack', 0.5, 100, 0.5, 10),
      num('releaseMs', 'paramRelease', 10, 1000, 5, 150),
      num('makeupDb', 'paramMakeup', 0, 24, 0.5, 0),
    ],
  },
  {
    id: 'fx.limiter',
    labelKey: 'fxLimiter',
    kind: 'kernel',
    process: (channels, sampleRate, params) =>
      truePeakLimit(channels, sampleRate, {
        ceilingDb: Number(params.ceilingDb),
        lookaheadMs: Number(params.lookaheadMs),
        releaseMs: Number(params.releaseMs),
      }),
    specs: [
      num('ceilingDb', 'paramCeiling', -24, 0, 0.1, -1),
      num('lookaheadMs', 'paramLookahead', 1, 30, 1, 5),
      num('releaseMs', 'paramRelease', 5, 500, 5, 60),
    ],
  },
  {
    id: 'fx.normalizeLufs',
    labelKey: 'fxNormalizeLufs',
    kind: 'kernel',
    process: (channels, sampleRate, params) =>
      applyNormalizeLufs(channels, sampleRate, {
        targetLufs: Number(params.targetLufs),
        ceilingDbtp: params.ceilingEnable ? -1 : null,
      }),
    specs: [
      num('targetLufs', 'paramTargetLufs', -24, -9, 0.5, -14),
      bool('ceilingEnable', 'paramTrueCeil', true),
    ],
  },
  {
    id: 'fx.distortion',
    labelKey: 'fxDistortion',
    kind: 'graph',
    graphId: 'distortion',
    specs: [num('amount', 'paramAmount', 0, 100, 1, 20)],
  },
  {
    id: 'fx.delay',
    labelKey: 'fxDelay',
    kind: 'graph',
    graphId: 'delay',
    tailSeconds: delayTailSeconds,
    specs: [
      num('time', 'paramTime', 0.01, 2, 0.01, 0.3),
      num('feedback', 'paramFeedback', 0, FX_MAX_FEEDBACK, 0.01, 0.35),
      num('mix', 'paramMix', 0, 1, 0.01, 0.3),
    ],
  },
  {
    id: 'fx.reverb',
    labelKey: 'fxReverb',
    kind: 'graph',
    graphId: 'reverb',
    tailSeconds: (params) => Number(params.time) || 0,
    specs: [
      num('time', 'paramTime', 0.2, 6, 0.1, 1.8),
      num('decay', 'paramDecay', 0.5, 10, 0.1, 2.5),
      num('mix', 'paramMix', 0, 1, 0.01, 0.35),
      bool('reverse', 'paramReverse', false),
    ],
  },
  {
    id: 'fx.pgeq8',
    labelKey: 'fxPgeq8',
    kind: 'kernel',
    process: (channels, sampleRate, params) =>
      processParamEq(channels, sampleRate, eqBandsFromParams(params)),
    specs: pgeq8Specs(),
  },
  {
    id: 'fx.pgeq',
    labelKey: 'fxPGEQ',
    kind: 'graph',
    graphId: 'pgeq',
    specs: [
      num('lowGainDb', 'paramLowGain', -15, 15, 0.5, 0),
      num('midGainDb', 'paramMidGain', -15, 15, 0.5, 0),
      num('midFreq', 'paramMidFreq', 200, 5000, 10, 1000),
      num('midQ', 'paramMidQ', 0.3, 8, 0.1, 1),
      num('highGainDb', 'paramHighGain', -15, 15, 0.5, 0),
    ],
  },
  {
    id: 'fx.geq10',
    labelKey: 'fxGEQ10',
    kind: 'graph',
    graphId: 'geq10',
    specs: OCTAVE_HZ.map((_, i) => num(`band${i}`, 'paramBand', -12, 12, 0.5, 0)),
  },
  {
    id: 'fx.geq20',
    labelKey: 'fxGEQ20',
    kind: 'graph',
    graphId: 'geq20',
    specs: GEQ20_HZ.map((_, i) => num(`band${i}`, 'paramBand', -12, 12, 0.5, 0)),
  },
  {
    id: 'fx.gate',
    labelKey: 'fxGate',
    kind: 'kernel',
    process: (channels, sampleRate, params) =>
      noiseGate(channels, sampleRate, {
        thresholdDb: Number(params.thresholdDb),
        ratio: Number(params.ratio),
        attackMs: Number(params.attackMs),
        releaseMs: Number(params.releaseMs),
      }),
    specs: [
      num('thresholdDb', 'paramThreshold', -80, -10, 1, -50),
      num('ratio', 'paramRatio', 1, 6, 0.1, 2.5),
      num('attackMs', 'paramAttack', 0, 50, 1, 5),
      num('releaseMs', 'paramRelease', 10, 1000, 10, 100),
    ],
  },
  {
    id: 'fx.rate',
    labelKey: 'fxRate',
    kind: 'kernel',
    process: (channels, _sampleRate, params) => resample(channels, Number(params.factor)),
    specs: [num('factor', 'paramFactor', 0.25, 4, 0.05, 1)],
  },
];

for (const def of DEFS) registerEffect(def);

export const EFFECT_DEFS: readonly EffectDef[] = DEFS;
