import { describe, expect, test } from 'vitest';
import { defaultParams, getEffect, listEffects, validateParams } from '../../src/fx/registry';
import { EFFECT_DEFS } from '../../src/fx/defs';
import type { EffectDef } from '../../src/fx/types';
import { en } from '../../src/i18n/en';

const EXPECTED_ORDER = [
  'fx.compressor',
  'fx.limiter',
  'fx.normalizeLufs',
  'fx.distortion',
  'fx.delay',
  'fx.reverb',
  'fx.reverb2',
  'fx.chorus',
  'fx.flanger',
  'fx.phaser',
  'fx.tremolo',
  'fx.vibrato',
  'fx.pgeq8',
  'fx.pgeq',
  'fx.geq10',
  'fx.geq20',
  'fx.gate',
  'fx.deesser',
  'fx.nrPrint',
  'fx.rate',
];

describe('fx registry', () => {
  test('all built-in defs are registered in menu order', () => {
    expect(listEffects().map((def) => def.id)).toEqual(EXPECTED_ORDER);
  });

  test('ids are unique', () => {
    const ids = EXPECTED_ORDER;
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('getEffect resolves every id; unknown id is undefined', () => {
    for (const id of EXPECTED_ORDER) expect(getEffect(id)?.id).toBe(id);
    expect(getEffect('fx.nope')).toBeUndefined();
  });
});

describe('fx definitions hygiene', () => {
  const defs = EFFECT_DEFS;

  test('specs are sane: min < max, positive step, default inside range', () => {
    for (const def of defs) {
      for (const spec of def.specs) {
        expect(spec.min, `${def.id}.${spec.key} min`).toBeLessThan(spec.max);
        expect(spec.step, `${def.id}.${spec.key} step`).toBeGreaterThan(0);
        if (spec.kind === 'number') {
          expect(spec.default, `${def.id}.${spec.key} default`).toBeGreaterThanOrEqual(spec.min);
          expect(spec.default, `${def.id}.${spec.key} default`).toBeLessThanOrEqual(spec.max);
        }
      }
    }
  });

  test('every labelKey (effect + params) exists in the catalog', () => {
    for (const def of defs) {
      expect((en as Record<string, unknown>)[def.labelKey], def.labelKey).toBeDefined();
      for (const spec of def.specs) {
        expect((en as Record<string, unknown>)[spec.labelKey], spec.labelKey).toBeDefined();
      }
    }
  });

  test('kernel defs have a process fn; graph defs have a graphId + tail info', () => {
    const kinds = Object.fromEntries(defs.map((def) => [def.id, def.kind]));
    expect(kinds).toEqual({
      'fx.compressor': 'kernel',
      'fx.limiter': 'kernel',
      'fx.normalizeLufs': 'kernel',
      'fx.distortion': 'graph',
      'fx.delay': 'graph',
      'fx.reverb': 'graph',
      'fx.reverb2': 'kernel',
      'fx.chorus': 'kernel',
      'fx.flanger': 'kernel',
      'fx.phaser': 'kernel',
      'fx.tremolo': 'kernel',
      'fx.vibrato': 'kernel',
      'fx.pgeq8': 'kernel',
      'fx.pgeq': 'graph',
      'fx.geq10': 'graph',
      'fx.geq20': 'graph',
      'fx.gate': 'kernel',
      'fx.deesser': 'kernel',
      'fx.nrPrint': 'kernel',
      'fx.rate': 'kernel',
    });
    for (const def of defs) {
      if (def.kind === 'kernel') expect(typeof def.process).toBe('function');
      else expect(typeof def.graphId).toBe('string');
    }
  });

  test('delay tail grows with feedback and stays finite; reverb tail = IR time', () => {
    const delay = getEffect('fx.delay') as Extract<EffectDef, { kind: 'graph' }>;
    expect(delay.tailSeconds).toBeDefined();
    const t1 = delay.tailSeconds?.({ time: 0.3, feedback: 0.2, mix: 0.5 }) ?? -1;
    const t2 = delay.tailSeconds?.({ time: 0.3, feedback: 0.9, mix: 0.5 }) ?? -1;
    expect(t1).toBeGreaterThan(0.3);
    expect(t2).toBeGreaterThan(t1);
    expect(t2).toBeLessThan(30); // clamped, never runaway

    const reverb = getEffect('fx.reverb') as Extract<EffectDef, { kind: 'graph' }>;
    expect(reverb.tailSeconds?.({ time: 1.8, decay: 2, mix: 0.3, reverse: false })).toBeCloseTo(
      1.8,
      6,
    );
  });

  test('reverb2 kernel tail = decay + predelay + settle; imported IR uses its length', () => {
    const reverb2 = getEffect('fx.reverb2') as Extract<EffectDef, { kind: 'kernel' }>;
    const synthesized = reverb2.tail?.({ rt60Sec: 2, predelayMs: 20, useImported: false }) ?? -1;
    expect(synthesized).toBeCloseTo(2 + 0.02 + 0.02, 6);
    const imported = reverb2.tail?.(
      { rt60Sec: 2, predelayMs: 20, useImported: true },
      { irChannels: [new Float32Array(44100)], irSampleRate: 44100 },
    ) ?? -1;
    expect(imported).toBeCloseTo(1 + 0.02 + 0.02, 6);
  });

  test('kernel processes smoke-run: correct shapes', () => {
    const sr = 8000;
    const quiet = [new Float32Array(64).fill(0.1)];
    const limiter = getEffect('fx.limiter') as Extract<EffectDef, { kind: 'kernel' }>;
    expect(limiter.process(quiet, sr, { ceilingDb: 0, lookaheadMs: 15, releaseMs: 50 })[0]).toHaveLength(64);

    const gate = getEffect('fx.gate') as Extract<EffectDef, { kind: 'kernel' }>;
    expect(gate.process([new Float32Array(64)], sr, { thresholdDb: -50, ratio: 2.5, attackMs: 5, releaseMs: 100 })[0]).toHaveLength(64);

    const rate = getEffect('fx.rate') as Extract<EffectDef, { kind: 'kernel' }>;
    expect(rate.process([new Float32Array(64)], sr, { factor: 2 })[0]).toHaveLength(32);
  });
});

describe('validateParams / defaultParams', () => {
  test('defaults parse through validation unchanged', () => {
    for (const def of EFFECT_DEFS) {
      const defaults = defaultParams(def);
      expect(validateParams(def, defaults)).toEqual(defaults);
    }
  });

  test('numbers clamp into range; unknown keys drop; bools coerce', () => {
    const limiter = getEffect('fx.limiter') as Extract<EffectDef, { kind: 'kernel' }>;
    const out = validateParams(limiter, {
      ceilingDb: -999,
      lookaheadMs: 1e6,
      releaseMs: 17,
      bogus: 'x',
    });
    expect(out.ceilingDb).toBe(-24);
    expect(out.lookaheadMs).toBe(30);
    expect(out.releaseMs).toBe(17);
    expect('bogus' in out).toBe(false);

    const reverb = getEffect('fx.reverb') as Extract<EffectDef, { kind: 'graph' }>;
    const rev = validateParams(reverb, { reverse: 1, time: 2, decay: 2, mix: 0.5 });
    expect(rev.reverse).toBe(true);
  });
});
