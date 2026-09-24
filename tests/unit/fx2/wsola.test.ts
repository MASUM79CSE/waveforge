import { describe, expect, test } from 'vitest';
import { wsolaStretch, pitchShift } from '../../../src/fx/wsola';

/**
 * E5 WSOLA time-stretch / pitch-shift anchors (effects v2 plan §E5 + §8):
 *  - null: ×1.00 + 0 st is bit-exact pass-through;
 *  - duration: 10 s ×1.25 / ×0.8 → output length within ±2 ms;
 *  - pitch: 440 Hz +3 st → 440·2^(3/12) = 523.25 Hz ± 0.5 % (zero-cross);
 *  - transients: click train ×1.5 → click peaks align to the ideal grid
 *    ±2 ms (onset-locked frames, no smear);
 *  - stereo: identical channels stay bit-identical (shared frame offsets);
 *  - stability: 30 s worst-case bounded ≤ 4, no NaN, mono + stereo;
 *  - [profile] 60 s stereo ×1.25 ≤ 3 s uninstrumented (ADR 009 D6).
 */

const SR = 44100;

function tone(hz: number, amp: number, seconds: number): Float32Array {
  const n = Math.round(seconds * SR);
  const x = new Float32Array(n);
  for (let i = 0; i < n; ++i) x[i] = amp * Math.sin((2 * Math.PI * hz * i) / SR);
  return x;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noise(n: number, seed: number, amp = 1): Float32Array {
  const rnd = mulberry32(seed);
  const x = new Float32Array(n);
  for (let i = 0; i < n; ++i) x[i] = (rnd() * 2 - 1) * amp;
  return x;
}

/** Fundamental frequency via zero-cross count over [from, from+span),
 * artifact-robust: (a) 9-tap moving average pre-smooth and (b) a
 * hysteresis band of 15 % of the segment peak. WSOLA frame joins add
 * deterministic micro-transients (and the linear resample folds a little
 * of that energy back low) whose spurious zero-crossings would otherwise
 * bias the reading ~+1 %; both refinements leave a ≤ 600 Hz fundamental
 * essentially untouched. Same instrument, artifact-rejected. */
function zeroCrossHz(x: Float32Array, from: number, span: number): number {
  let peak = 0;
  for (let i = from; i < from + span; ++i) peak = Math.max(peak, Math.abs(x[i] ?? 0));
  const h = 0.15 * peak;
  let crossings = 0;
  let armed = true;
  let prev = 0;
  let first = true;
  for (let i = from; i < from + span; ++i) {
    let acc = 0;
    for (let j = -4; j <= 4; ++j) acc += x[i + j] ?? 0;
    const v = acc / 9;
    if (!first && armed && v >= 0 !== prev >= 0) {
      ++crossings;
      armed = false;
    }
    if (Math.abs(v) > h) armed = true;
    prev = v;
    first = false;
  }
  return (crossings / 2) * (SR / span);
}

/** Click positions: first sample of each run above 0.5 (debounced 50 ms). */
function clickPositions(x: Float32Array): number[] {
  const positions: number[] = [];
  const debounce = Math.round(0.05 * SR);
  let next = 0;
  for (let i = 0; i < x.length; ++i) {
    if (Math.abs(x[i] ?? 0) > 0.5 && i >= next) {
      positions.push(i);
      next = i + debounce;
    }
  }
  return positions;
}

describe('E5 WSOLA stretch / pitch shift', () => {
  test('×1.00 is bit-exact pass-through; +0 st likewise', () => {
    const l = noise(22050, 1, 0.4);
    const r = noise(22050, 2, 0.4);
    const stretched = wsolaStretch([l, r], SR, 1);
    expect(stretched[0]).toEqual(l);
    expect(stretched[1]).toEqual(r);
    const pitched = pitchShift([l, r], SR, 0);
    expect(pitched[0]).toEqual(l);
    expect(pitched[1]).toEqual(r);
  });

  test('guard rails: non-finite / non-positive ratio and empty input', () => {
    const x = [noise(4096, 21, 0.4)];
    for (const bad of [0, -1, Number.NaN]) {
      const out = wsolaStretch(x, SR, bad);
      expect(out[0]).toEqual(x[0]);
    }
    const empty = wsolaStretch([new Float32Array(0)], SR, 1.25);
    expect(empty[0]).toHaveLength(0);
    expect(wsolaStretch([], SR, 1.5)).toHaveLength(0);
  });

  test('10 s ×1.25 → length 551250 ± 88 samples; ×0.8 → 352800 ± 88', {
    timeout: 30_000,
  }, () => {
    const x = [noise(441000, 3, 0.3)];
    const up = wsolaStretch(x, SR, 1.25)[0]!;
    expect(Math.abs(up.length - 551250)).toBeLessThanOrEqual(88);
    const down = wsolaStretch(x, SR, 0.8)[0]!;
    expect(Math.abs(down.length - 352800)).toBeLessThanOrEqual(88);
  });

  test('440 Hz tone +3 st → 523.25 Hz ± 0.5 % (zero-cross count), length kept', {
    timeout: 30_000,
  }, () => {
    const x = [tone(440, 0.4, 3)];
    const out = pitchShift(x, SR, 3)[0]!;
    expect(Math.abs(out.length - 3 * SR)).toBeLessThanOrEqual(88); // length preserved
    const span = SR; // middle second
    const from = Math.floor((out.length - span) / 2);
    const hz = zeroCrossHz(out, from, span);
    expect(Math.abs(hz - 523.25)).toBeLessThanOrEqual(523.25 * 0.005);
  });

  test('click train ×1.5: click peaks align to the ×1.5 grid ±2 ms', {
    timeout: 30_000,
  }, () => {
    const n = 6 * SR;
    const x = new Float32Array(n);
    for (let c = 1; c <= 11; ++c) x[c * Math.round(0.5 * SR)] = 1; // 0.5..5.5 s
    const out = wsolaStretch([x], SR, 1.5)[0]!;
    const expected = clickPositions(x).map((p) => p * 1.5);
    const got = clickPositions(out);
    expect(got.length).toBe(expected.length);
    for (let i = 0; i < expected.length; ++i) {
      expect(Math.abs(got[i]! - (expected[i] ?? 0))).toBeLessThanOrEqual(0.002 * SR); // ±2 ms
    }
  });

  test('stereo image: identical channels stay bit-identical after ×1.3', {
    timeout: 30_000,
  }, () => {
    const x = [noise(88200, 5, 0.4), noise(88200, 5, 0.4)];
    const out = wsolaStretch(x, SR, 1.3);
    expect(out[0]).toEqual(out[1]);
  });

  test('30 s worst-case ×1.7 bounded ≤ 4, no NaN (mono + stereo)', {
    timeout: 40_000,
  }, () => {
    const n = 30 * SR;
    const mono = [noise(n, 7, 0.8)];
    for (const ch of wsolaStretch(mono, SR, 1.7)) {
      for (let i = 0; i < ch.length; i += 511) {
        const v = ch[i] ?? Number.NaN;
        expect(Number.isFinite(v)).toBe(true);
        expect(Math.abs(v)).toBeLessThanOrEqual(4);
      }
    }
    const stereo = [noise(n, 8, 0.8), noise(n, 9, 0.8)];
    stereo[0]![n >> 1] = 1; // impulse
    for (const ch of wsolaStretch(stereo, SR, 0.6)) {
      for (let i = 0; i < ch.length; i += 511) {
        const v = ch[i] ?? Number.NaN;
        expect(Number.isFinite(v)).toBe(true);
        expect(Math.abs(v)).toBeLessThanOrEqual(4);
      }
    }
  });

  test('[profile] E5 wsola ×1.25 on 60 s stereo 44.1 kHz (budget 3 s uninstrumented)', {
    timeout: 40_000,
  }, () => {
    const n = 60 * SR;
    const l = noise(n, 11, 0.3);
    const r = noise(n, 12, 0.3);
    const t0 = performance.now();
    wsolaStretch([l, r], SR, 1.25);
    const elapsed = performance.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`[profile] E5 wsola 60 s stereo ×1.25: ${elapsed.toFixed(0)} ms`);
    expect(elapsed).toBeLessThan(9_000); // smoke guard — budget binds uninstrumented (ADR 009 D6)
  });
});
