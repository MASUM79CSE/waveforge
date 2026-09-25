import { describe, expect, test } from 'vitest';
import {
  STREAM_TARGETS,
  analyzeReport,
  verdicts,
  type AnalysisReport,
} from '../../src/engine/analysisReport';

/**
 * P1 — professional analysis report (docs/analyze-plan.md): analytic
 * anchors over known signals. Loudness parity with the BS.1770-4 kernel
 * anchors; physics for correlation/DC/clipping/balance/noise.
 */

const SR = 48000;

function sine(dbFs: number, sec: number, freq = 997, phase = 0): Float32Array {
  const n = Math.round(SR * sec);
  const amp = Math.pow(10, dbFs / 20);
  const out = new Float32Array(n);
  for (let i = 0; i < n; ++i) {
    out[i] = amp * Math.sin((2 * Math.PI * freq * i) / SR + phase);
  }
  return out;
}

function noise(n: number, seed: number): Float32Array {
  let s = seed >>> 0;
  const out = new Float32Array(n);
  for (let i = 0; i < n; ++i) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out[i] = (s / 2147483648 - 1) * 0.1;
  }
  return out;
}

describe('P1 — analysis report anchors', () => {
  test('g1: EBU anchor parity — 997 Hz stereo −23 dBFS', () => {
    const r = analyzeReport([sine(-23, 5), sine(-23, 5)], SR);
    expect(r.lufs.integrated).toBeGreaterThanOrEqual(-23.5);
    expect(r.lufs.integrated).toBeLessThanOrEqual(-22.5);
    expect(r.lufs.lra).toBeLessThanOrEqual(1); // constant program
    expect(r.stereo).not.toBeNull();
    expect(r.stereo!.correlationMean).toBeGreaterThan(0.999999);
    expect(r.stereo!.sidePct).toBeLessThan(0.01);
    expect(r.integrity.clippedSamples).toBe(0);
    expect(Math.abs(r.integrity.dc[0]!)).toBeLessThan(1e-6);
    expect(r.truePeakDb).toBeGreaterThan(-24);
    expect(r.truePeakDb).toBeLessThan(-20); // near −23 + small overshoot
  });

  test('g2: LRA across loud/quiet segments; silence % counts the tail', () => {
    const chans = [
      Float32Array.from([...sine(-12, 3), ...sine(-32, 3), ...new Float32Array(SR)]),
      Float32Array.from([...sine(-12, 3), ...sine(-32, 3), ...new Float32Array(SR)]),
    ];
    const r = analyzeReport(chans, SR);
    expect(r.lufs.lra).toBeGreaterThanOrEqual(18);
    expect(r.lufs.lra).toBeLessThanOrEqual(22);
    // 1 s of 7 s is silent → 14.29 % (50 ms frames)
    expect(r.noise.silencePct).toBeGreaterThanOrEqual(13);
    expect(r.noise.silencePct).toBeLessThanOrEqual(16);
    expect(r.noise.snrDb).toBeGreaterThan(12);
  });

  test('g3: correlation −1 for inverse polarity; ≈0 for independent noises; side 100 %', () => {
    const t = sine(-20, 2);
    const inv = analyzeReport([t, Float32Array.from(t, (v) => -v)], SR);
    expect(inv.stereo!.correlationMean).toBeLessThan(-0.999999);
    expect(inv.stereo!.sidePct).toBeGreaterThan(99.9);
    const rnd = analyzeReport([noise(SR * 2, 7), noise(SR * 2, 99)], SR);
    expect(Math.abs(rnd.stereo!.correlationMean)).toBeLessThan(0.2);
  });

  test('g4: clipping audit — counts, runs, first-run location; DC offset exact', () => {
    const ch = sine(-12, 1);
    const runs = [1000, 12000, 24000, 36000, 40000];
    for (const at of runs) {
      for (let i = 0; i < 5; ++i) ch[at + i] = i % 2 === 0 ? 1 : -1;
    }
    const r = analyzeReport([ch, sine(-12, 1)], SR);
    expect(r.integrity.clippedSamples).toBe(25); // one channel only
    expect(r.integrity.clippedRuns).toBe(5);
    expect(r.integrity.firstRun).toEqual([1000, 5]);
    const dcCh = Float32Array.from(sine(-20, 1), (v) => v + 0.01);
    const rdc = analyzeReport([dcCh, dcCh.slice()], SR);
    expect(Math.abs(rdc.integrity.dc[0]! - 0.01)).toBeLessThan(1e-6);
  });

  test('g5: balance — 100 Hz sine puts ≥ 60 % of power in the low bands', () => {
    const r = analyzeReport([sine(-20, 2, 100), sine(-20, 2, 100)], SR);
    const low = r.balance[1]! + r.balance[2]!; // 31.25 + 62.5/125 octave bins
    expect(low).toBeGreaterThanOrEqual(60);
  });

  test('g6: mono → stereo section null; 44.1 kHz runs; deterministic', () => {
    const t = sine(-23, 2);
    const mono = analyzeReport([t], 44100);
    expect(mono.stereo).toBeNull();
    expect(mono.lufs.integrated).toBeLessThan(-20);
    const a = analyzeReport([t, t.slice()], SR);
    const b = analyzeReport([t, t.slice()], SR);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test('verdicts: gain needed = target − integrated; TP-safe flag respects the ceiling', () => {
    const r: AnalysisReport = {
      ...analyzeReport([sine(-23, 5), sine(-23, 5)], SR),
    };
    const v = new Map(verdicts(r).map((x) => [x.id, x]));
    const spotify = v.get('spotify')!;
    expect(spotify.target).toBe(-14);
    expect(spotify.gainDb).toBeGreaterThan(8.5);
    expect(spotify.gainDb).toBeLessThan(9.5);
    expect(spotify.tpSafe).toBe(true); // −20.5 dBTP + 9 dB ≤ −1
    const netflix = v.get('netflix')!;
    expect(netflix.tpCeiling).toBe(-2);
  });

  test('streaming table: every 2026 target present', () => {
    const ids = STREAM_TARGETS.map((t) => t.id);
    for (const id of ['spotify', 'youtube', 'appleMusic', 'applePodcasts', 'amazon', 'tidal', 'deezer', 'ebu', 'netflix']) {
      expect(ids).toContain(id);
    }
  });
});
