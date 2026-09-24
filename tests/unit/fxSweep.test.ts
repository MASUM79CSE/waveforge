import { describe, expect, test } from 'vitest';
import { mulTable } from '../../src/engine/automation';
import type { AutomationCurve } from '../../src/engine/automation';
import { BUTTERWORTH_Q_24DB, designBiquad, type BiquadCoeffs, type BiquadKind } from '../../src/fx/biquad';
import {
  bandsToParams,
  defaultBand,
  eqBandsFromParams,
  processParamEq,
  processParamEqSwept,
  type EqBand,
} from '../../src/fx/paramEq';

const SR = 44100;

/** Deterministic pseudo-noise (LCG) — stable anchors across runs. */
function noise(n: number, seed = 12345): Float32Array {
  let s = seed;
  const out = new Float32Array(n);
  for (let i = 0; i < n; ++i) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out[i] = (s / 0x3fffffff - 1) * 0.5;
  }
  return out;
}

/** Test-local reference: per-sample design + the kernel's TDF recursion. */
function refSweep(
  ch: Float32Array,
  kind: BiquadKind,
  band: EqBand,
  which: 'freq' | 'gainDb' | 'q',
  curve: AutomationCurve,
  sections: number,
): Float32Array {
  const table = mulTable(curve, ch.length);
  const states = Array.from({ length: sections }, () => ({ s1: 0, s2: 0 }));
  const out = Float32Array.from(ch);
  const qFor = (i: number): number => (sections === 2 ? BUTTERWORTH_Q_24DB[i]! : band.q);
  for (let n = 0; n < out.length; ++n) {
    let x = out[n]!;
    const v = table[n]!;
    for (let j = 0; j < sections; ++j) {
      const freq = which === 'freq' ? v : band.freq;
      const gainDb = which === 'gainDb' ? v : band.gainDb;
      const q = which === 'q' ? v : qFor(j);
      const c: BiquadCoeffs = designBiquad(kind, freq, gainDb, q, SR);
      const st = states[j]!;
      const y = c.b0 * x + st.s1;
      st.s1 = c.b1 * x - c.a1 * y + st.s2;
      st.s2 = c.b2 * x - c.a2 * y;
      x = Math.fround(y); // f32 at section boundaries (static-path discipline)
    }
    out[n] = x;
  }
  return out;
}

function band(over: Partial<EqBand> = {}): EqBand {
  return { ...defaultBand(0), ...over };
}

describe('A6b — processParamEqSwept (biquad kernel curves)', () => {
  test('constant curves == static processParamEq BIT-FOR-BIT', () => {
    const bands = [
      band({ type: 'peaking', freq: 1000, gainDb: 6, q: 2 }),
      band({ type: 'lpf', freq: 4000, gainDb: 0, q: 0.71, slope: 24 }),
    ];
    const ch = [noise(512)];
    const staticOut = processParamEq(ch, SR, bands);
    const curves = {
      b0Freq: [
        { at: 0, value: 1000 },
        { at: 10, value: 1000 },
      ],
      b1Freq: [{ at: 0, value: 4000 }],
      b1Q: [{ at: 0, value: 0.71 }],
    };
    const sweptOut = processParamEqSwept(ch.map((c) => Float32Array.from(c)), SR, bands, curves);
    expect(sweptOut[0]).toEqual(staticOut[0]);
  });

  test('freq sweep matches the per-sample reference exactly (hold after last)', () => {
    const b = band({ type: 'lpf', freq: 18000, gainDb: 0, q: 0.71, slope: 12 });
    const curve: AutomationCurve = [
      { at: 0, value: 18000 },
      { at: 15, value: 100 },
      { at: 24, value: 100 },
    ];
    const ch = [noise(48)];
    const out = processParamEqSwept(ch, SR, [b], { b0Freq: curve })[0]!;
    const ref = refSweep(ch[0]!, 'lpf', b, 'freq', curve, 1);
    expect(out).toEqual(ref);
    // hold-after-last: samples ≥ 24 use value 100 — implied by ref equality
  });

  test('gainDb sweep on a peaking band matches the reference', () => {
    const b = band({ type: 'peaking', freq: 1000, gainDb: 0, q: 1 });
    const curve: AutomationCurve = [
      { at: 0, value: -18 },
      { at: 31, value: 18 },
    ];
    const ch = [noise(40)];
    const out = processParamEqSwept(ch, SR, [b], { b0Gain: curve })[0]!;
    expect(out).toEqual(refSweep(ch[0]!, 'peaking', b, 'gainDb', curve, 1));
  });

  test('Q sweep matches the reference', () => {
    const b = band({ type: 'peaking', freq: 2000, gainDb: 9, q: 1 });
    const curve: AutomationCurve = [
      { at: 0, value: 0.1 },
      { at: 47, value: 16 },
    ];
    const ch = [noise(48)];
    const out = processParamEqSwept(ch, SR, [b], { b0Q: curve })[0]!;
    expect(out).toEqual(refSweep(ch[0]!, 'peaking', b, 'q', curve, 1));
  });

  test('24 dB/oct cascade sweeps stay state-continuous across sections', () => {
    const b = band({ type: 'hpf', freq: 200, gainDb: 0, q: 0.71, slope: 24 });
    const curve: AutomationCurve = [
      { at: 0, value: 2000 },
      { at: 39, value: 60 },
    ];
    const ch = [noise(40)];
    const out = processParamEqSwept(ch, SR, [b], { b0Freq: curve })[0]!;
    expect(out).toEqual(refSweep(ch[0]!, 'hpf', b, 'freq', curve, 2));
  });

  test('sweep direction: LPF closing 18 kHz → 80 Hz muffles the tail', () => {
    const b = band({ type: 'lpf', freq: 18000, gainDb: 0, q: 0.71, slope: 12 });
    const curve: AutomationCurve = [
      { at: 0, value: 18000 },
      { at: 511, value: 80 },
    ];
    const input = noise(512, 777);
    const out = processParamEqSwept([input], SR, [b], { b0Freq: curve })[0]!;
    const rms = (a: Float32Array, from: number, to: number): number => {
      let sum = 0;
      for (let i = from; i < to; ++i) sum += a[i]! * a[i]!;
      return Math.sqrt(sum / (to - from));
    };
    const head = rms(out, 0, 64);
    const tail = rms(out, 448, 512);
    expect(tail).toBeLessThan(head * 0.5);
  });

  test('non-swept bands ride the static path (mixed swept/static bands)', () => {
    const staticBand = band({ type: 'peaking', freq: 100, gainDb: 6, q: 1 });
    const sweptBand = band({ type: 'lpf', freq: 8000, gainDb: 0, q: 0.71, slope: 12 });
    const curve: AutomationCurve = [
      { at: 0, value: 8000 },
      { at: 63, value: 500 },
    ];
    const ch = [noise(64)];
    // full-static reference for the static band chain order: [static, swept]
    const bands = [staticBand, sweptBand];
    const out = processParamEqSwept(ch, SR, bands, { b1Freq: curve })[0]!;
    // reference: static band first (whole-array), then per-sample swept band
    const afterStatic = processParamEq(ch, SR, [staticBand])[0]!;
    expect(out).toEqual(refSweep(afterStatic, 'lpf', sweptBand, 'freq', curve, 1));
  });

  test('no curves → identical to processParamEq (fresh copies)', () => {
    const bands = [band({ type: 'peaking', freq: 1000, gainDb: 6, q: 2 })];
    const ch = [noise(64)];
    const a = processParamEqSwept(ch, SR, bands, {});
    const b = processParamEq(ch, SR, bands);
    expect(a[0]).toEqual(b[0]);
  });

  test('fx.pgeq8 def routes ctx.paramCurves to the swept path', async () => {
    const { EFFECT_DEFS } = await import('../../src/fx/defs');
    const def = EFFECT_DEFS.find((d) => d.id === 'fx.pgeq8');
    expect(def && def.kind === 'kernel').toBe(true);
    if (!def || def.kind !== 'kernel') return;
    const params = bandsToParams([
      band({ type: 'lpf', freq: 8000, gainDb: 0, q: 0.71, slope: 12 }),
    ]);
    const curve: AutomationCurve = [
      { at: 0, value: 8000 },
      { at: 63, value: 500 },
    ];
    const ch = [noise(64)];
    const swept = def.process(ch, SR, params, { paramCurves: { b0Freq: curve } });
    const bands = eqBandsFromParams(params);
    expect(swept[0]).toEqual(refSweep(ch[0]!, 'lpf', bands[0]!, 'freq', curve, 1));
    const plain = def.process(ch, SR, params);
    const staticRef = processParamEq(ch, SR, bands);
    expect(plain[0]).toEqual(staticRef[0]);
  });
});
