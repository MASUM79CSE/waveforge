import { describe, expect, test } from 'vitest';
import '../../src/fx/defs'; // side-effect: populates the registry with built-ins
import { getEffect, registerEffect, validateParams } from '../../src/fx/registry';
import type { Chain, ChainEntry } from '../../src/fx/chain';
import { exportChain, foldChain, foldChainAsync, parseChain } from '../../src/fx/chain';
import type { EffectDef, Params } from '../../src/fx/types';

/**
 * C1 — FX chain model (docs/fxchains-plan.md §C1 gates 1–9).
 * Boundary JSON is untrusted: zod shape + registry validation; the fold is
 * a sequential stage fold with an injected runner (pure, app-free).
 */

const premade: Chain = [
  { effectId: 'fx.compressor', params: { thresholdDb: -20, ratio: 3 }, bypass: false },
  { effectId: 'fx.deesser', params: {}, bypass: true },
];

describe('C1 — parse (boundary)', () => {
  test('g1: valid JSON round-trips to the typed chain', () => {
    const raw = exportChain(premade);
    const parsed = parseChain(JSON.parse(raw));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      // params normalize to the FULL spec set (defaults fill missing keys)
      const comp = getEffect('fx.compressor')!;
      const deesser = getEffect('fx.deesser')!;
      expect(parsed.chain).toEqual([
        {
          effectId: 'fx.compressor',
          params: validateParams(comp, { thresholdDb: -20, ratio: 3 }),
          bypass: false,
        },
        { effectId: 'fx.deesser', params: validateParams(deesser, {}), bypass: true },
      ]);
    }
  });

  test('g2: unknown effect id rejected, message names the id', () => {
    const parsed = parseChain([{ effectId: 'fx.doesNotExist', params: {}, bypass: false }]);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain('fx.doesNotExist');
  });

  test('g3: out-of-range param clamps to the def spec range', () => {
    const parsed = parseChain([{ effectId: 'fx.compressor', params: { thresholdDb: 50 }, bypass: false }]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const spec = getEffect('fx.compressor')!.specs.find((s) => s.key === 'thresholdDb')!;
      expect(parsed.chain[0]!.params.thresholdDb).toBe(spec.max);
    }
  });

  test('g4: junk param values fall back to spec defaults; unknown keys drop; bools coerce', () => {
    const parsed = parseChain([
      { effectId: 'fx.compressor', params: { thresholdDb: 'loud', nope: 7, auto: 'false' }, bypass: 0 },
    ]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const def = getEffect('fx.compressor')!;
      const expected = validateParams(def, { thresholdDb: 'loud', nope: 7, auto: 'false' });
      expect(parsed.chain[0]!.params).toEqual(expected);
      expect(parsed.chain[0]!.bypass).toBe(false);
    }
  });

  test('shape: non-array, non-object entry, bad params record, overflow rejected', () => {
    expect(parseChain('x').ok).toBe(false);
    expect(parseChain(['x']).ok).toBe(false);
    expect(parseChain([{ effectId: 'fx.deesser', params: 5, bypass: false }]).ok).toBe(false);
    const tooMany: unknown[] = [];
    for (let i = 0; i < 17; ++i) {
      tooMany.push({ effectId: 'fx.deesser', params: {}, bypass: false });
    }
    expect(parseChain(tooMany).ok).toBe(false);
  });
});

describe('C1 — fold (pure)', () => {
  /** Test kernels: a doubles values, b adds 0.1, len appends one zero. */
  const mapAll = (channels: Float32Array[], f: (v: number) => number): Float32Array[] =>
    channels.map((ch) => Float32Array.from(ch, (v) => f(v)));
  const a: EffectDef = {
    id: 'fxTest.a',
    labelKey: 'fxTestA',
    kind: 'kernel',
    process: (channels) => mapAll(channels, (v) => v * 2),
    specs: [],
  };
  const b: EffectDef = {
    id: 'fxTest.b',
    labelKey: 'fxTestB',
    kind: 'kernel',
    process: (channels) => mapAll(channels, (v) => v + 0.5),
    specs: [],
  };
  const lenDef: EffectDef = {
    id: 'fxTest.len',
    labelKey: 'fxTestLen',
    kind: 'kernel',
    process: (channels) => channels.map((ch) => Float32Array.from([...ch, 0])),
    specs: [],
  };
  registerEffect(a);
  registerEffect(b);
  registerEffect(lenDef);

  const run = (effectId: string, channels: Float32Array[]): Float32Array[] =>
    (getEffect(effectId) as Extract<EffectDef, { kind: 'kernel' }>).process(
      channels.map((ch) => ch.slice()),
      48000,
      {} as Params,
    );

  test('g5: fold order == manual composition (non-commutative pair)', () => {
    const input = [Float32Array.from([1, 2, 3])];
    const chain: Chain = [
      { effectId: 'fxTest.a', params: {}, bypass: false },
      { effectId: 'fxTest.b', params: {}, bypass: false },
    ];
    const folded = foldChain(input, 48000, chain, run);
    // a then b: (x*2)+0.5 — NOT (x+0.5)*2; literals exact in f32
    expect(Array.from(folded[0]!)).toEqual([2.5, 4.5, 6.5]);
  });

  test('g6: bypass entry skipped bit-exactly (stage never runs)', () => {
    const input = [Float32Array.from([1, 2, 3])];
    const chain: Chain = [
      { effectId: 'fxTest.a', params: {}, bypass: true },
      { effectId: 'fxTest.b', params: {}, bypass: false },
    ];
    const folded = foldChain(input, 48000, chain, run);
    expect(Array.from(folded[0]!)).toEqual([1.5, 2.5, 3.5]);
  });

  test('g7: all entries bypassed → input arrays returned unchanged', () => {
    const input = [Float32Array.from([1, 2, 3])];
    const chain: ChainEntry[] = [{ effectId: 'fxTest.a', params: {}, bypass: true }];
    const folded = foldChain(input, 48000, chain, run);
    expect(folded[0]).toBe(input[0]);
  });

  test('g8: length-changing stage output feeds the next stage whole', () => {
    const input = [Float32Array.from([1, 2])];
    const chain: Chain = [
      { effectId: 'fxTest.len', params: {}, bypass: false },
      { effectId: 'fxTest.b', params: {}, bypass: false },
    ];
    const folded = foldChain(input, 48000, chain, run);
    expect(folded[0]!.length).toBe(3);
    expect(Array.from(folded[0]!)).toEqual([1.5, 2.5, 0.5]);
  });

  test('g9: export→parse→fold is a fixed point', () => {
    const input = [Float32Array.from([1, 2, 3])];
    const chain: Chain = [
      { effectId: 'fxTest.a', params: {}, bypass: false },
      { effectId: 'fxTest.b', params: {}, bypass: true },
    ];
    const round = parseChain(JSON.parse(exportChain(chain)));
    expect(round.ok).toBe(true);
    if (round.ok) {
      const direct = foldChain(input, 48000, chain, run);
      const cycled = foldChain(input, 48000, round.chain, run);
      expect(cycled[0]).toEqual(direct[0]);
    }
  });
});

describe('C2 — async fold (graph stages render offline)', () => {
  // registry is global — the fxTest.* defs registered in the C1 describe
  const baseRun = (effectId: string, channels: Float32Array[]): Float32Array[] =>
    (getEffect(effectId) as Extract<EffectDef, { kind: 'kernel' }>).process(
      channels.map((ch) => ch.slice()),
      48000,
      {} as Params,
    );
  /** Async wrapper over the sync test runner (the offline-render shape). */
  const runAsync = async (effectId: string, channels: Float32Array[]): Promise<Float32Array[]> =>
    baseRun(effectId, channels);

  test('g10: async runner composition == sync composition', async () => {
    const input = [Float32Array.from([1, 2, 3])];
    const chain: Chain = [
      { effectId: 'fxTest.a', params: {}, bypass: false },
      { effectId: 'fxTest.b', params: {}, bypass: false },
    ];
    const sync = foldChain(input, 48000, chain, baseRun);
    const asyncOut = await foldChainAsync(input, 48000, chain, runAsync);
    expect(Array.from(asyncOut[0]!)).toEqual(Array.from(sync[0]!));
  });

  test('g11: async fold honors bypass + all-bypassed identity', async () => {
    const input = [Float32Array.from([1, 2, 3])];
    const mixed: Chain = [
      { effectId: 'fxTest.a', params: {}, bypass: true },
      { effectId: 'fxTest.b', params: {}, bypass: false },
    ];
    const out = await foldChainAsync(input, 48000, mixed, runAsync);
    expect(Array.from(out[0]!)).toEqual([1.5, 2.5, 3.5]);
    const allBypassed: Chain = [{ effectId: 'fxTest.a', params: {}, bypass: true }];
    const identity = await foldChainAsync(input, 48000, allBypassed, runAsync);
    expect(identity[0]).toBe(input[0]);
  });
});
