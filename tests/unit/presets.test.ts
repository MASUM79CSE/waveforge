import { describe, expect, test } from 'vitest';
import '../../src/fx/defs'; // side-effect: populates the registry with built-ins
import { parseChain } from '../../src/fx/chain';
import { BUILTIN_CHAIN_PRESETS, EFFECT_PRESETS, chainPresetById, presetsForEffect } from '../../src/fx/presets';

/**
 * C3 — built-in presets (docs/fxchains-plan.md): every recipe must parse
 * against the live registry (effect ids exist, params normalize), the
 * flagship Voice rescue leads with fx.rnvoice, and lookups are total.
 */

describe('C3 — built-in chain presets', () => {
  test('every built-in recipe parses against the registry', () => {
    expect(BUILTIN_CHAIN_PRESETS.length).toBeGreaterThanOrEqual(4);
    for (const preset of BUILTIN_CHAIN_PRESETS) {
      const parsed = parseChain(preset.chain);
      expect(parsed.ok, `${preset.id}: ${!parsed.ok ? parsed.error : ''}`).toBe(true);
    }
  });

  test('flagship Voice rescue = rnvoice → deesser → compressor (E7b heads the chain)', () => {
    const parsed = parseChain(chainPresetById('voiceRescue')!.chain);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.chain.map((e) => e.effectId)).toEqual([
        'fx.rnvoice',
        'fx.deesser',
        'fx.compressor',
      ]);
      expect(parsed.chain[0]!.params.mix).toBe(1);
    }
  });

  test('chainPresetById is total (undefined for unknown); presetsForEffect matches ids', () => {
    expect(chainPresetById('nope')).toBeUndefined();
    const compressorPresets = presetsForEffect('fx.compressor');
    expect(compressorPresets.length).toBeGreaterThan(0);
    for (const quick of compressorPresets) {
      expect(EFFECT_PRESETS['fx.compressor']).toContain(quick);
    }
    expect(presetsForEffect('fx.doesNotExist')).toEqual([]);
  });
});
