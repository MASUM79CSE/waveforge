/**
 * C3 — presets (docs/fxchains-plan.md): curated built-in chain recipes
 * (Voice rescue first — the E7b RNNoise engine compounding with the
 * downstream voice chain) plus per-effect quick presets for the generic
 * dialog. Pure data + getters; user presets live in the preset store
 * (IndexedDB, drafts precedent). Params are merged over the registry
 * defaults so exported chains stay complete and stable.
 */
import '../fx/defs'; // side-effect: presets are meaningless without the registry
import type { Chain, ChainEntry } from './chain';
import type { Params } from './types';
import { defaultParams, getEffect } from './registry';

export interface ChainPreset {
  id: string;
  /** i18n key (catalog key, e.g. fxPresetVoiceRescue); falls back to id. */
  nameKey: string;
  chain: Chain;
}

export interface QuickPreset {
  id: string;
  nameKey: string;
  params: Params;
}

/** Full defaults + overrides (complete param sets — stable export). */
function entry(effectId: string, overrides: Params = {}): ChainEntry {
  const def = getEffect(effectId);
  if (!def) throw new Error(`preset references unknown effect: ${effectId}`);
  return { effectId, params: { ...defaultParams(def), ...overrides }, bypass: false };
}

/** The curated rack recipes, in menu order (Voice rescue first). */
export const BUILTIN_CHAIN_PRESETS: ChainPreset[] = [
  {
    id: 'voiceRescue',
    nameKey: 'fxPresetVoiceRescue',
    chain: [
      entry('fx.rnvoice', { mix: 1 }),
      entry('fx.deesser', { thresholdDb: -32, ratio: 4 }),
      entry('fx.compressor', { thresholdDb: -18, ratio: 3, makeupDb: 3 }),
    ],
  },
  {
    id: 'podcastPolish',
    nameKey: 'fxPresetPodcast',
    chain: [
      entry('fx.deesser', { thresholdDb: -30, ratio: 3 }),
      entry('fx.compressor', { thresholdDb: -20, ratio: 2.5, makeupDb: 4 }),
      entry('fx.normalizeLufs', { targetLufs: -16, amount: 100 }),
    ],
  },
  {
    id: 'masterGlue',
    nameKey: 'fxPresetMasterGlue',
    chain: [
      entry('fx.compressor', {
        thresholdDb: -22,
        ratio: 2,
        kneeDb: 6,
        attackMs: 15,
        releaseMs: 120,
        makeupDb: 2,
      }),
      entry('fx.limiter', { ceilingDb: -1 }),
    ],
  },
  {
    id: 'warmAir',
    nameKey: 'fxPresetWarmAir',
    chain: [
      entry('fx.chorus', { depthMs: 2, rateHz: 0.5, mix: 0.25 }),
      entry('fx.reverb2', { rt60Sec: 1.2, mix: 0.18 }),
    ],
  },
];

export function chainPresetById(id: string): ChainPreset | undefined {
  return BUILTIN_CHAIN_PRESETS.find((p) => p.id === id);
}

/** Per-effect quick presets for the generic dialog's preset select. */
export const EFFECT_PRESETS: Record<string, QuickPreset[]> = {
  'fx.compressor': [
    { id: 'vocal', nameKey: 'fxQpVocal', params: { thresholdDb: -18, ratio: 3, makeupDb: 3 } },
    { id: 'busGlue', nameKey: 'fxQpGlue', params: { thresholdDb: -22, ratio: 2, kneeDb: 6 } },
    { id: 'podcast', nameKey: 'fxQpPodcast', params: { thresholdDb: -20, ratio: 2.5, makeupDb: 4 } },
  ],
  'fx.rnvoice': [
    { id: 'full', nameKey: 'fxQpFull', params: { mix: 1 } },
    { id: 'subtle', nameKey: 'fxQpSubtle', params: { mix: 0.6 } },
  ],
  'fx.delay': [
    { id: 'slap', nameKey: 'fxQpSlap', params: { time: 0.08, feedback: 0.2, mix: 0.2 } },
    { id: 'wide', nameKey: 'fxQpWide', params: { time: 0.45, feedback: 0.45, mix: 0.35 } },
  ],
  'fx.reverb2': [
    { id: 'room', nameKey: 'fxQpRoom', params: { rt60Sec: 0.6, mix: 0.18 } },
    { id: 'fullMix', nameKey: 'fxQpFullMix', params: { rt60Sec: 2.4, mix: 0.35 } },
  ],
};

export function presetsForEffect(effectId: string): QuickPreset[] {
  return EFFECT_PRESETS[effectId] ?? [];
}
