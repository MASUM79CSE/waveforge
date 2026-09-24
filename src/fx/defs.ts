/**
 * Built-in effect definitions (ADR 005). Order here = Effects-menu order.
 * All parameter labels point at the i18n catalog; specs double as the
 * dialog UI contract and the validation clamp ranges.
 */
import { FX_MAX_FEEDBACK, FX_MIN_TAIL_GAIN, GEQ20_HZ } from '../core/constants';
import { applyNormalizeLufs, truePeakLimit } from './mastering';
import {
  chorusProcess,
  flangerProcess,
  phaserProcess,
  tremoloProcess,
  vibratoProcess,
} from './modulation';
import { compressKernelSwept } from './compressor';
import { noiseGateSwept } from './gate';
import { truePeakLimitSwept } from './mastering';
import { EQ_BAND_COUNT, eqBandsFromParams, processParamEq, processParamEqSwept } from './paramEq';
import { reverb2Process } from './reverb2';
import { nr3Process } from './nr3';
import { nrProcess } from './nrPrint';
import { deesserProcess } from './deesser';
import { wsolaStretch } from './wsola';
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
    process: (channels, sampleRate, params, ctx) => {
      const curves = ctx?.paramCurves;
      const p = {
        thresholdDb: Number(params.thresholdDb),
        ratio: Number(params.ratio),
        kneeDb: Number(params.kneeDb),
        attackMs: Number(params.attackMs),
        releaseMs: Number(params.releaseMs),
        makeupDb: Number(params.makeupDb),
      };
      if (curves && Object.keys(curves).length > 0) {
        return compressKernelSwept(channels, sampleRate, p, curves);
      }
      return compressKernel(channels, sampleRate, p);
    },
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
    process: (channels, sampleRate, params, ctx) => {
      const curves = ctx?.paramCurves;
      const p = {
        ceilingDb: Number(params.ceilingDb),
        lookaheadMs: Number(params.lookaheadMs),
        releaseMs: Number(params.releaseMs),
      };
      if (curves && Object.keys(curves).length > 0) {
        return truePeakLimitSwept(channels, sampleRate, p, curves);
      }
      return truePeakLimit(channels, sampleRate, p);
    },
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
    id: 'fx.reverb2',
    labelKey: 'fxReverb2',
    kind: 'kernel',
    process: (channels, sampleRate, params, ctx) =>
      reverb2Process(channels, sampleRate, {
        type: Number(params.type) as 0 | 1 | 2 | 3,
        rt60Sec: Number(params.rt60Sec),
        damping: Number(params.damping),
        predelayMs: Number(params.predelayMs),
        mix: Number(params.mix),
        seed: Number(params.seed),
      }, ctx),
    // wet tail beyond the region: the full decay plus predelay and a
    // short settle margin; an imported IR uses its own length instead
    tail: (params, ctx) => {
      const predelay = (Number(params.predelayMs) || 0) / 1000;
      const settle = 0.02;
      const ir0 = ctx?.irChannels?.[0];
      const irSec =
        params.useImported === true && ir0 && ctx?.irSampleRate
          ? ir0.length / ctx.irSampleRate
          : Number(params.rt60Sec) || 0;
      return irSec + predelay + settle;
    },
    specs: [
      num('type', 'paramReverbType', 0, 3, 1, 0),
      bool('useImported', 'paramUseImported', false),
      num('rt60Sec', 'paramRt60', 0.2, 12, 0.1, 1.8),
      num('damping', 'paramDamping', 0, 100, 1, 30),
      num('predelayMs', 'paramPredelay', 0, 120, 1, 20),
      num('mix', 'paramMix', 0, 1, 0.01, 0.25),
      num('seed', 'paramSeed', 0, 9999, 1, 1234),
    ],
  },
  {
    id: 'fx.chorus',
    labelKey: 'fxChorus',
    kind: 'kernel',
    process: (channels, sampleRate, params) =>
      chorusProcess(channels, sampleRate, {
        baseMs: Number(params.baseMs),
        depthMs: Number(params.depthMs),
        rateHz: Number(params.rateHz),
        mix: Number(params.mix),
      }),
    specs: [
      num('baseMs', 'paramBaseMs', 0, 60, 0.1, 20),
      num('depthMs', 'paramDepthMs', 0, 30, 0.1, 4),
      num('rateHz', 'paramRate', 0.05, 10, 0.05, 0.8),
      num('mix', 'paramMix', 0, 1, 0.01, 0.5),
    ],
  },
  {
    id: 'fx.flanger',
    labelKey: 'fxFlanger',
    kind: 'kernel',
    process: (channels, sampleRate, params) =>
      flangerProcess(channels, sampleRate, {
        baseMs: Number(params.baseMs),
        depthMs: Number(params.depthMs),
        rateHz: Number(params.rateHz),
        feedback: Number(params.feedback),
        mix: Number(params.mix),
      }),
    specs: [
      num('baseMs', 'paramBaseMs', 0, 20, 0.1, 2),
      num('depthMs', 'paramDepthMs', 0, 10, 0.1, 4),
      num('rateHz', 'paramRate', 0.05, 5, 0.05, 0.15),
      num('feedback', 'paramFeedback', 0, 0.95, 0.01, 0.6),
      num('mix', 'paramMix', 0, 1, 0.01, 0.5),
    ],
  },
  {
    id: 'fx.phaser',
    labelKey: 'fxPhaser',
    kind: 'kernel',
    process: (channels, sampleRate, params) =>
      phaserProcess(channels, sampleRate, {
        stages: Number(params.stages),
        rateHz: Number(params.rateHz),
        centerHz: Number(params.centerHz),
        feedback: Number(params.feedback),
        mix: Number(params.mix),
      }),
    specs: [
      num('stages', 'paramStages', 2, 8, 1, 6),
      num('rateHz', 'paramRate', 0.05, 8, 0.05, 0.5),
      num('centerHz', 'paramCenterHz', 100, 4000, 10, 800),
      num('feedback', 'paramFeedback', 0, 0.9, 0.01, 0.6),
      num('mix', 'paramMix', 0, 1, 0.01, 0.5),
    ],
  },
  {
    id: 'fx.tremolo',
    labelKey: 'fxTremolo',
    kind: 'kernel',
    process: (channels, sampleRate, params) =>
      tremoloProcess(channels, sampleRate, {
        rateHz: Number(params.rateHz),
        depth: Number(params.depth),
        shape: Number(params.shape),
      }),
    specs: [
      num('rateHz', 'paramRate', 0.5, 20, 0.1, 5),
      num('depth', 'paramDepth', 0, 1, 0.01, 0.5),
      num('shape', 'paramShape', 0, 1, 1, 0),
    ],
  },
  {
    id: 'fx.vibrato',
    labelKey: 'fxVibrato',
    kind: 'kernel',
    process: (channels, sampleRate, params) =>
      vibratoProcess(channels, sampleRate, {
        rateHz: Number(params.rateHz),
        depthMs: Number(params.depthMs),
      }),
    specs: [
      num('rateHz', 'paramRate', 0.1, 14, 0.1, 5),
      num('depthMs', 'paramDepthMs', 0, 30, 0.1, 4),
    ],
  },
  {
    id: 'fx.pgeq8',
    labelKey: 'fxPgeq8',
    kind: 'kernel',
    process: (channels, sampleRate, params, ctx) => {
      const bands = eqBandsFromParams(params);
      const curves = ctx?.paramCurves;
      if (curves && Object.keys(curves).length > 0) {
        return processParamEqSwept(channels, sampleRate, bands, curves);
      }
      return processParamEq(channels, sampleRate, bands);
    },
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
    process: (channels, sampleRate, params, ctx) => {
      const curves = ctx?.paramCurves;
      const p = {
        thresholdDb: Number(params.thresholdDb),
        ratio: Number(params.ratio),
        attackMs: Number(params.attackMs),
        releaseMs: Number(params.releaseMs),
      };
      if (curves && Object.keys(curves).length > 0) {
        return noiseGateSwept(channels, sampleRate, p, curves);
      }
      return noiseGate(channels, sampleRate, p);
    },
    specs: [
      num('thresholdDb', 'paramThreshold', -80, -10, 1, -50),
      num('ratio', 'paramRatio', 1, 6, 0.1, 2.5),
      num('attackMs', 'paramAttack', 0, 50, 1, 5),
      num('releaseMs', 'paramRelease', 10, 1000, 10, 100),
    ],
  },
  {
    id: 'fx.deesser',
    labelKey: 'fxDeesser',
    kind: 'kernel',
    process: (channels, sampleRate, params) =>
      deesserProcess(channels, sampleRate, {
        crossoverHz: Number(params.crossoverHz),
        thresholdDb: Number(params.thresholdDb),
        ratio: Number(params.ratio),
      }),
    specs: [
      num('crossoverHz', 'paramCrossover', 3000, 9000, 100, 5500),
      num('thresholdDb', 'paramThreshold', -60, 0, 1, -30),
      num('ratio', 'paramRatio', 1, 12, 0.5, 4),
    ],
  },
  {
    id: 'fx.nr3',
    labelKey: 'fxNr3',
    kind: 'kernel',
    process: (channels, _sampleRate, params, ctx) =>
      nr3Process(
        channels,
        {
          reduction: Number(params.reduction),
          adapt: Number(params.adapt),
        },
        ctx?.noisePrint,
      ),
    specs: [
      num('reduction', 'paramReduction', 0, 30, 1, 15),
      num('adapt', 'paramAdapt', 0, 1, 0.05, 0.5),
    ],
  },
  {
    id: 'fx.nrPrint',
    labelKey: 'fxNrPrint',
    kind: 'kernel',
    process: (channels, _sampleRate, params, ctx) =>
      nrProcess(channels, {
        alpha: Number(params.alpha),
        floor: Number(params.floor),
      }, ctx),
    specs: [
      num('alpha', 'paramAlpha', 1, 4, 0.1, 2),
      num('floor', 'paramFloor', 0.01, 0.2, 0.01, 0.05),
    ],
  },
  {
    id: 'fx.rate',
    labelKey: 'fxRate',
    kind: 'kernel',
    process: (channels, _sampleRate, params) => resample(channels, Number(params.factor)),
    specs: [num('factor', 'paramFactor', 0.25, 4, 0.05, 1)],
  },
  {
    id: 'fx.stretch',
    labelKey: 'fxStretch',
    kind: 'kernel',
    process: (channels, sampleRate, params) => {
      const stretch = Number(params.stretchPct) / 100;
      const semitones = Number(params.semitones);
      if (stretch === 1 && semitones === 0) return channels.map((ch) => ch.slice());
      const pitch = Math.pow(2, semitones / 12);
      const stretched = wsolaStretch(channels, sampleRate, stretch * pitch);
      return semitones === 0 ? stretched : resample(stretched, pitch);
    },
    specs: [
      num('stretchPct', 'paramStretchPct', 50, 200, 1, 100),
      num('semitones', 'paramSemitones', -12, 12, 1, 0),
      bool('independent', 'paramIndependent', false),
    ],
  },
];

for (const def of DEFS) registerEffect(def);

export const EFFECT_DEFS: readonly EffectDef[] = DEFS;
