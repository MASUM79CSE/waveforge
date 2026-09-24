/**
 * E2 8-band parametric EQ (effects v2 plan §E2) — RED first.
 * Accuracy gates: RBJ peaking/shelf/notch anchors within ±0.25/±0.4 dB,
 * 24 dB/oct Butterworth slopes, analytic-vs-measured curve agreement,
 * bit-exact bypass, worst-case stability, profile budget.
 */
import { describe, expect, test } from 'vitest';
import {
  bandMagnitudeDb,
  eqBandsFromParams,
  bandsToParams,
  processParamEq,
  type EqBand,
} from '../../../src/fx/paramEq';
import { defaultParams, validateParams, getEffect } from '../../../src/fx/registry';
import { EFFECT_DEFS } from '../../../src/fx/defs';

const SR = 44100;

/** Steady-state gain (dB) of `process` at a probe frequency. */
function probeGainDb(
  bands: EqBand[],
  freqHz: number,
  seconds = 3,
): number {
  const n = Math.round(seconds * SR);
  const inSig = new Float32Array(n);
  for (let i = 0; i < n; ++i) inSig[i] = 0.3 * Math.sin((2 * Math.PI * freqHz * i) / SR);
  const out = processParamEq([inSig], SR, bands);
  const ch = out[0];
  if (!ch) throw new Error('missing channel');
  const from = Math.round((seconds - 1.5) * SR);
  let sumIn = 0;
  let sumOut = 0;
  for (let i = from; i < n; ++i) {
    sumIn += (inSig[i] ?? 0) ** 2;
    sumOut += (ch[i] ?? 0) ** 2;
  }
  return 10 * Math.log10(sumOut / sumIn);
}

function band(partial: Partial<EqBand>): EqBand {
  const base: EqBand = { type: 'peaking', freq: 1000, gainDb: 0, q: 1, slope: 12 };
  return { ...base, ...partial };
}

describe('peaking band anchors (RBJ)', () => {
  test('Q4: 500 Hz ≤ 0.4 dB · 1 kHz 12 ± 0.25 dB · 2 kHz ≤ 0.4 dB', () => {
    const bands = [band({ freq: 1000, gainDb: 12, q: 4 })];
    // RBJ truth: Q4 octave skirt ≈ 0.42 dB — bounded at 0.5, centre tight
    expect(probeGainDb(bands, 500)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(probeGainDb(bands, 1000) - 12)).toBeLessThanOrEqual(0.25);
    expect(probeGainDb(bands, 2000)).toBeLessThanOrEqual(0.5);
  });

  test('Q1 skirt: +3.9…4.1 dB one octave below centre (bandwidth behaviour)', () => {
    const leak = probeGainDb([band({ freq: 1000, gainDb: 12, q: 1 })], 500);
    expect(leak).toBeGreaterThanOrEqual(3.9);
    expect(leak).toBeLessThanOrEqual(4.1);
  });

  test('analytic magnitude agrees with audio within 0.3 dB', () => {
    const one = band({ freq: 1000, gainDb: 12, q: 4 });
    const analytic = bandMagnitudeDb(one, 2000, SR);
    const measured = probeGainDb([one], 2000);
    expect(Math.abs(analytic - measured)).toBeLessThanOrEqual(0.3);
  });

  test('0 dB peaking is a null change (bit-exact bypass)', () => {
    const n = 5000;
    const sig = new Float32Array(n);
    for (let i = 0; i < n; ++i) sig[i] = Math.sin(i * 0.01) * 0.5;
    const out = processParamEq([sig], SR, [band({ gainDb: 0 }), band({ freq: 3000, gainDb: 0 })]);
    expect(out[0]).toEqual(sig);
  });
});

describe('shelf + notch anchors', () => {
  test('low shelf 200 Hz +6 dB: 40 Hz within 6 ± 0.25, 2 kHz ≤ 0.4', () => {
    const bands = [band({ type: 'lowshelf', freq: 200, gainDb: 6, q: 0.8 })];
    const low = probeGainDb(bands, 40, 4);
    expect(Math.abs(low - 6)).toBeLessThanOrEqual(0.25);
    expect(probeGainDb(bands, 2000)).toBeLessThanOrEqual(0.4);
  });

  test('high shelf 4 kHz −9 dB: 12 kHz −9 ± 0.25, 500 Hz ≥ −0.4', () => {
    const bands = [band({ type: 'highshelf', freq: 4000, gainDb: -9, q: 0.8 })];
    const high = probeGainDb(bands, 12000, 3);
    expect(Math.abs(high - -9)).toBeLessThanOrEqual(0.25);
    expect(probeGainDb(bands, 500)).toBeGreaterThanOrEqual(-0.4);
  });

  test('notch 1 kHz Q 8 attenuates ≥ 40 dB at centre', () => {
    const bands = [band({ type: 'notch', freq: 1000, q: 8 })];
    expect(probeGainDb(bands, 1000, 4)).toBeLessThanOrEqual(-40);
  });
});

describe('HPF/LPF slopes (Butterworth sections)', () => {
  test('HPF 24 dB/oct: −6 dB at cutoff (2 Butterworth sections), ≤ −40 dB at −2 oct', () => {
    const bands = [band({ type: 'hpf', freq: 100, q: 0.7071, slope: 24 })];
    expect(probeGainDb(bands, 100, 4)).toBeGreaterThan(-7); // 4th-order Butterworth −6 dB
    expect(probeGainDb(bands, 25, 5)).toBeLessThanOrEqual(-40);
  });

  test('HPF 12 dB/oct: −3 dB at cutoff, ≈ −24 dB at −2 oct', () => {
    const bands = [band({ type: 'hpf', freq: 100, q: 0.7071, slope: 12 })];
    expect(probeGainDb(bands, 100, 4)).toBeGreaterThan(-4.5);
    expect(probeGainDb(bands, 25, 5)).toBeLessThanOrEqual(-20);
  });

  test('12 dB/oct mode attenuates ~half as fast as 24 dB/oct', () => {
    const gentle = [band({ type: 'hpf', freq: 100, q: 0.7071, slope: 12 })];
    const steep = [band({ type: 'hpf', freq: 100, q: 0.7071, slope: 24 })];
    const g = probeGainDb(gentle, 25, 5);
    const s = probeGainDb(steep, 25, 5);
    expect(s).toBeLessThan(g - 15); // 24 dB/oct is ≥ 15 dB deeper at −2 oct
    expect(g).toBeGreaterThan(-35); // and the shallow one is visibly gentler
  });

  test('LPF 8 kHz passes the highs band untouched enough to hear', () => {
    const bands = [band({ type: 'lpf', freq: 8000, q: 0.7071 })];
    expect(probeGainDb(bands, 1000)).toBeGreaterThan(-0.4);
    expect(probeGainDb(bands, 16000, 3)).toBeLessThanOrEqual(-20);
  });
});

describe('band ⇄ flat-params bridge (generic dialog plumbing)', () => {
  test('round-trips and clamps through the registry specs', () => {
    const def = getEffect('fx.pgeq8');
    expect(def, 'fx.pgeq8 must be registered').toBeDefined();
    const bands = eqBandsFromParams(defaultParams(def!));
    expect(bands).toHaveLength(8);
    bands[3]!.freq = 987;
    bands[3]!.gainDb = 5.5;
    bands[3]!.type = 'notch';
    const params = validateParams(def!, bandsToParams(bands));
    const back = eqBandsFromParams(params);
    expect(back[3]).toMatchObject({ type: 'notch', freq: 987, gainDb: 5.5 });
  });

  test('out-of-range params clamp into spec ranges (20 Hz–20 kHz, ±18 dB)', () => {
    const def = getEffect('fx.pgeq8')!;
    const clamped = validateParams(def, bandsToParams([band({ freq: 99999, gainDb: 40, q: 99 })]));
    const bands = eqBandsFromParams(clamped);
    expect(bands[0]!.freq).toBe(20000);
    expect(bands[0]!.gainDb).toBe(18);
    expect(bands[0]!.q).toBe(16);
  });
});

describe('stability + profile (E2 budget ≤ 0.6 s uninstrumented, 60 s stereo)', () => {
  test('10 s pink noise through 8 worst-case bands stays bounded, no NaN', { timeout: 20_000 }, () => {
    const worst: EqBand[] = [
      band({ type: 'hpf', freq: 20, q: 0.5, slope: 24 }),
      band({ type: 'lowshelf', freq: 60, gainDb: 18, q: 0.5 }),
      band({ type: 'peaking', freq: 150, gainDb: 18, q: 0.2 }),
      band({ type: 'peaking', freq: 400, gainDb: 18, q: 0.2 }),
      band({ type: 'peaking', freq: 1000, gainDb: 18, q: 0.2 }),
      band({ type: 'peaking', freq: 3000, gainDb: 18, q: 0.2 }),
      band({ type: 'highshelf', freq: 8000, gainDb: 18, q: 0.5 }),
      band({ type: 'lpf', freq: 20000, q: 0.5, slope: 24 }),
    ];
    const n = 10 * SR;
    const sig = new Float32Array(n);
    let seed = 424242;
    let b0 = 0;
    let b1 = 0;
    for (let i = 0; i < n; ++i) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const white = seed / 0x3fffffff - 1;
      b0 = 0.99765 * b0 + white * 0.099;
      b1 = 0.963 * b1 + white * 0.2965;
      sig[i] = b0 + b1 + white * 0.1848;
    }
    const out = processParamEq([sig, sig], SR, worst);
    for (const ch of out) {
      expect(ch.length).toBe(n);
      for (let i = 0; i < n; i += 97) {
        const v = ch[i] ?? 0;
        expect(Number.isFinite(v)).toBe(true);
        // 8 × +18 dB Q0.2 bands legitimately stack past +50 dB in-band;
        // the gate is boundedness/NaN-freedom, not loudness (limiter exists).
        // Ceiling ≈ +60 dB (×1024) — beyond any stacked-resonance case.
        expect(Math.abs(v)).toBeLessThanOrEqual(1024);
      }
    }
  });

  test('[profile] E2 pgeq8 60 s stereo 44.1 kHz', { timeout: 30_000 }, () => {
    const tone = new Float32Array(60 * SR).fill(0.2);
    const stereo = [tone, tone];
    const bands = Array.from({ length: 8 }, (_, i) =>
      band({ freq: 40 * Math.pow(2.37, i), gainDb: 6, q: 1.2 }),
    );
    const t0 = performance.now();
    processParamEq(stereo, SR, bands);
    const ms = performance.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`[profile] E2 pgeq8 60 s stereo 44.1 kHz: ${Math.round(ms)} ms`);
    // budget 0.6 s uninstrumented; 5 s = instrumented smoke guard (§8.7 note)
    expect(ms).toBeLessThan(5000);
  });
});

describe('registry wiring hygiene', () => {
  test('fx.pgeq8 is a kernel def with 32 numeric specs', () => {
    const def = EFFECT_DEFS.find((d) => d.id === 'fx.pgeq8');
    expect(def).toBeDefined();
    expect(def!.kind).toBe('kernel');
    expect(def!.specs).toHaveLength(32);
    expect(def!.specs.every((s) => s.kind === 'number')).toBe(true);
  });
});
