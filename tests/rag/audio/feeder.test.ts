import { describe, expect, it } from 'vitest';
import { FeederPump, type FeedResult } from '../../../src/rag/audio/feeder';

/** Exact 16 kHz identity input: out[i] === in[i] when srcRate = dstRate. */
const R = 16_000;
const WIN = 480_000; // 30 s
const HOP = 464_000; // 29 s
const OV = 16_000; // 1 s

function ramp(n: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = ((i % 1000) / 1000) * 2 - 1;
  return out;
}

function dc(n: number, v: number): Float32Array {
  const out = new Float32Array(n);
  out.fill(v);
  return out;
}

function run(pump: FeederPump, blocks: Float32Array[][]): FeedResult[] {
  const results: FeedResult[] = [];
  for (const b of blocks) results.push(pump.push(b));
  results.push(pump.finish());
  return results;
}

describe('P2.2 feeder pump — window geometry (identity 16 kHz)', () => {
  it('61 s input → 3 windows (30 s, 30 s, 3 s tail) at t0 0/29/58', () => {
    const N = 976_000; // 61 s — tail = N − 2·HOP = 48,000 (3 s)
    const pump = new FeederPump({ srcRate: R, totalFrames: N });
    const rs = run(pump, [[ramp(N)]]);
    const mid = rs[0]!;
    const fin = rs[1]!;
    const wins = [...mid.windows, ...fin.windows];
    expect(wins.map((w) => w.index)).toEqual([0, 1, 2]);
    expect(wins.map((w) => w.t0)).toEqual([0, 29, 58]);
    expect(wins.map((w) => w.samples.length)).toEqual([WIN, WIN, 48_000]);
    expect(fin.done).toBe(true);
    expect(fin.progress).toBe(1);
  });

  it('window values are bitwise input slices; overlap is exactly 1 s', () => {
    const N = 976_000;
    const x = ramp(N);
    const pump = new FeederPump({ srcRate: R, totalFrames: N });
    const results = run(pump, [[x]]);
    const wins = [...results[0].windows, ...results[1].windows];
    expect(Array.from(wins[0]!.samples.subarray(0, 8))).toEqual(Array.from(x.subarray(0, 8)));
    expect(wins[1]!.samples[0]).toBe(x[HOP]);
    expect(wins[2]!.samples[0]).toBe(x[2 * HOP]);
    // windows 0 and 1 share the 1 s overlap region
    const a = wins[0]!.samples.subarray(WIN - OV);
    const b = wins[1]!.samples.subarray(0, OV);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('streamed odd-sized blocks (incl. 1-sample) match one push bitwise', () => {
    // small window (160/120) so several windows emit mid-stream
    const N = 3_000;
    const x = ramp(N);
    const opts = { srcRate: R, totalFrames: N, windowSec: 0.01, overlapSec: 0.0025 };
    const one = run(new FeederPump(opts), [[x]]);
    const pump = new FeederPump(opts);
    const sizes = [1, 3, 7, 64, 333];
    const blocks: Float32Array[][] = [];
    let pos = 0;
    let k = 0;
    while (pos < N) {
      const size = Math.min(sizes[k % sizes.length]!, N - pos);
      blocks.push([x.slice(pos, pos + size)]);
      pos += size;
      k++;
    }
    const many = run(pump, blocks);
    const flatten = (rs: FeedResult[]) =>
      rs.flatMap((r) => r.windows.flatMap((w) => Array.from(w.samples)));
    expect(one.flatMap((r) => r.windows.map((w) => w.index)).length).toBeGreaterThan(3);
    expect(flatten(many)).toEqual(flatten(one));
  });

  it('progress is monotonic in [0, 1) and 1 exactly at finish', () => {
    const N = 100_000;
    const pump = new FeederPump({ srcRate: R, totalFrames: N });
    const seen: number[] = [];
    for (let pos = 0; pos < N; pos += 10_000) {
      const r = pump.push([ramp(10_000)]);
      seen.push(r.progress);
      expect(r.done).toBe(false);
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThan(seen[i - 1]!);
    expect(seen.every((p) => p >= 0 && p < 1)).toBe(true);
    const fin = pump.finish();
    expect(fin.progress).toBe(1);
  });

  it('mixdown: stereo DC 0.1/0.3 → 0.2; three channels average', () => {
    const pump = new FeederPump({ srcRate: R, totalFrames: 100 });
    const r = run(pump, [[dc(100, 0.1), dc(100, 0.3)]]);
    const w = [...r[0]!.windows, ...r[1]!.windows][0]!;
    expect(w.samples[0]).toBeCloseTo(0.2, 6);
    expect(w.samples[50]).toBeCloseTo(0.2, 6);

    const pump3 = new FeederPump({ srcRate: R, totalFrames: 60 });
    const r3 = run(pump3, [[dc(60, 3), dc(60, 6), dc(60, 9)]]);
    const w3 = [...r3[0]!.windows, ...r3[1]!.windows][0]!;
    expect(w3.samples[10]).toBeCloseTo(6, 6);
  });

  it('short input (< 30 s) → one short window', () => {
    const pump = new FeederPump({ srcRate: R, totalFrames: 80_000 });
    const r = run(pump, [[ramp(80_000)]]);
    const wins = [...r[0]!.windows, ...r[1]!.windows];
    expect(wins.length).toBe(1);
    expect(wins[0]!.t0).toBe(0);
    expect(wins[0]!.samples.length).toBe(80_000);
  });

  it('empty input → no windows, done, progress 1', () => {
    const pump = new FeederPump({ srcRate: R, totalFrames: 0 });
    const fin = pump.finish();
    expect(fin.windows).toEqual([]);
    expect(fin.done).toBe(true);
    expect(fin.progress).toBe(1);
  });

  it('remainder ≤ overlap still yields a context window (documented contract)', () => {
    // N = 944,000: window 1 ends exactly at end; start of win 2 = 928,000
    // leaves a 16,000-sample pure-context window.
    const N = 944_000;
    const pump = new FeederPump({ srcRate: R, totalFrames: N });
    const r = run(pump, [[ramp(N)]]);
    const wins = [...r[0]!.windows, ...r[1]!.windows];
    expect(wins.map((w) => w.samples.length)).toEqual([WIN, WIN, OV]);
  });

  it('48 kHz source: windows tile the timeline with 1 s overlap (±1 sample)', () => {
    const src = 48_000;
    const seconds = 62;
    const N = src * seconds;
    const pump = new FeederPump({ srcRate: src, totalFrames: N });
    const r = run(pump, [[ramp(N)]]);
    const wins = [...r[0]!.windows, ...r[1]!.windows];
    expect(wins.map((w) => w.t0)).toEqual([0, 29, 58]);
    expect(Math.abs(wins[2]!.samples.length - 4 * R)).toBeLessThanOrEqual(1);
    // non-overlap concatenation covers ~the whole timeline: total span
    expect(wins[0]!.samples.length + wins[1]!.samples.length).toBeGreaterThanOrEqual(2 * HOP);
  });

  it('declared totalFrames below the real input → progress clamps, stays monotonic', () => {
    const pump = new FeederPump({ srcRate: R, totalFrames: 50 });
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) seen.push(pump.push([ramp(1_000)]).progress);
    expect(seen.every((p, i) => i === 0 || p >= seen[i - 1]!)).toBe(true);
    expect(seen.every((p) => p <= 0.999)).toBe(true);
    expect(pump.finish().progress).toBe(1);
  });

  it('channel length mismatch throws', () => {
    const pump = new FeederPump({ srcRate: R, totalFrames: 10 });
    expect(() => pump.push([dc(10, 0), dc(9, 0)])).toThrow(/mismatch/);
  });

  it('push after finish / double finish / finish-then-push throw', () => {
    const pump = new FeederPump({ srcRate: R, totalFrames: 10 });
    pump.push([dc(10, 0)]);
    pump.finish();
    expect(() => pump.push([dc(10, 0)])).toThrow(/finish/);
    expect(() => pump.finish()).toThrow(/twice/);
  });

  it('invalid options throw', () => {
    expect(() => new FeederPump({ srcRate: 0, totalFrames: 0 })).toThrow();
    expect(() => new FeederPump({ srcRate: R, totalFrames: -1 })).toThrow();
    expect(() => new FeederPump({ srcRate: R, totalFrames: 0, windowSec: 0 })).toThrow();
    expect(() => new FeederPump({ srcRate: R, totalFrames: 0, overlapSec: 30 })).toThrow();
  });
});
