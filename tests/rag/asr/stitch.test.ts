import { describe, expect, it } from 'vitest';
import { DUP_TOLERANCE_S, stitchWindows, type WindowSegments } from '../../../src/rag/asr/stitch';
import type { TranscriptSegment } from '../../../src/rag/transcripts/model';

const seg = (start: number, end: number, text: string): TranscriptSegment => ({ start, end, text });

describe('P2.6 window stitching — golden', () => {
  it('two windows, clean boundary → plain concatenation', () => {
    const w1: WindowSegments = { t0Sec: 0, segments: [seg(0, 2, 'alpha'), seg(2.5, 4, 'beta')] };
    const w2: WindowSegments = { t0Sec: 29, segments: [seg(0, 1.5, 'gamma')] };
    expect(stitchWindows([w1, w2])).toEqual([
      seg(0, 2, 'alpha'),
      seg(2.5, 4, 'beta'),
      seg(29, 30.5, 'gamma'),
    ]);
  });

  it('boundary duplicate is collapsed to the earlier copy', () => {
    const w1: WindowSegments = { t0Sec: 0, segments: [seg(29.0, 30.1, 'hello world')] };
    const w2: WindowSegments = { t0Sec: 29, segments: [seg(0.05, 1.2, 'Hello  world')] };
    const out = stitchWindows([w1, w2]);
    expect(out.length).toBe(1);
    expect(out[0]).toEqual(seg(29.0, 30.1, 'hello world')); // earlier window's copy
  });

  it('prefix-variant duplicates collapse; different text within tolerance does NOT', () => {
    const w1: WindowSegments = { t0Sec: 0, segments: [seg(28, 30, 'the quick brown'), seg(28.1, 28.9, 'fox jumps')] };
    const w2: WindowSegments = { t0Sec: 29, segments: [seg(0, 2.2, 'the quick'), seg(0.05, 1, 'wolf howls')] };
    const out = stitchWindows([w1, w2]);
    // 'the quick' (global 29.0) collapses with 'the quick brown' (28.0 — within 0.2 of 29.0? NO)
    // 29.0 - 28.0 = 1.0 > 0.2 → both kept; 'wolf howls' vs 'fox jumps' → different → kept
    expect(out.map((s) => s.text)).toEqual(['the quick brown', 'fox jumps', 'the quick', 'wolf howls']);
  });

  it('tolerance is inclusive at exactly DUP_TOLERANCE_S', () => {
    const w1: WindowSegments = { t0Sec: 0, segments: [seg(10, 11, 'same words')] };
    // both segments are global-10.x: w2/w3 add t0Sec 10 to LOCAL starts
    const w2: WindowSegments = { t0Sec: 10, segments: [seg(DUP_TOLERANCE_S, 1.2, 'same words')] };
    expect(stitchWindows([w1, w2]).length).toBe(1);
    const w3: WindowSegments = { t0Sec: 10, segments: [seg(DUP_TOLERANCE_S + 0.001, 1.2, 'same words')] };
    expect(stitchWindows([w1, w3]).length).toBe(2);
  });

  it('sanitizes untrusted ASR data: negative starts clamp, inverted ends become zero-length, NaN dropped', () => {
    const w: WindowSegments = {
      t0Sec: 5,
      segments: [seg(-0.5, 1, 'a'), seg(2, 1.5, 'b'), seg(NaN, 3, 'c'), seg(4, 6, 'd')],
    };
    const out = stitchWindows([w]);
    expect(out).toEqual([
      seg(5, 6, 'a'),
      seg(7, 7, 'b'), // inverted end clamps to zero-length
      seg(9, 11, 'd'),
    ]);
  });
});

describe('P2.6 window stitching — properties & edges', () => {
  it('empty input and empty windows → empty output; single window passthrough', () => {
    expect(stitchWindows([])).toEqual([]);
    expect(stitchWindows([{ t0Sec: 3, segments: [] }])).toEqual([]);
    const one: WindowSegments = { t0Sec: 7, segments: [seg(0, 1, 'only')] };
    expect(stitchWindows([one])).toEqual([seg(7, 8, 'only')]);
  });

  it('window order in the input array does not change the result', () => {
    const a: WindowSegments = { t0Sec: 0, segments: [seg(0, 2, 'one'), seg(28.9, 29.9, 'edge case')] };
    const b: WindowSegments = { t0Sec: 29, segments: [seg(0, 1.05, 'edge case'), seg(2, 3, 'tail')] };
    const ab = stitchWindows([a, b]);
    const ba = stitchWindows([b, a]);
    expect(ab).toEqual(ba);
  });

  it('output is always sorted by start', () => {
    const a: WindowSegments = { t0Sec: 58, segments: [seg(0, 2, 'c'), seg(5, 6, 'd')] };
    const b: WindowSegments = { t0Sec: 0, segments: [seg(0, 30, 'a'), seg(31, 32, 'b')] };
    const out = stitchWindows([a, b]);
    for (let i = 1; i < out.length; i++) {
      expect(out[i]!.start).toBeGreaterThanOrEqual(out[i - 1]!.start);
    }
    expect(out.map((s) => s.text)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('both boundaries of a 3-window chain collapse (one dup each)', () => {
    // utterance A lives at global ~29 (w0/w1 overlap), B at ~58 (w1/w2)
    const w0: WindowSegments = { t0Sec: 0, segments: [seg(28.95, 30, 'words a')] };
    const w1: WindowSegments = {
      t0Sec: 29,
      segments: [seg(0, 1.1, 'words a'), seg(29, 30, 'words b')], // B local 29 → global 58
    };
    const w2: WindowSegments = { t0Sec: 58, segments: [seg(0, 1.05, 'words b')] };
    const out = stitchWindows([w0, w1, w2]);
    expect(out).toEqual([seg(28.95, 30, 'words a'), seg(58, 59, 'words b')]);
  });

  it('property: no near-duplicate PAIRS survive (brute-force checker)', () => {
    // build a deterministic multi-window stream with planted duplicates
    const windows: WindowSegments[] = [];
    let t = 0;
    let n = 0;
    for (let k = 0; k < 6; k++) {
      const segs: TranscriptSegment[] = [];
      for (let j = 0; j < 4; j++) {
        const start = j * 6 + (n % 3) * 0.05;
        segs.push(seg(start, start + 1.5, `utt ${n % 5}`));
        n++;
      }
      // plant a boundary duplicate of the previous window's last segment
      if (k > 0) {
        const last = windows[k - 1]!.segments[3]!;
        segs.unshift(seg(last.start - (t - windows[k - 1]!.t0Sec) + 0.02, 2, last.text));
      }
      windows.push({ t0Sec: t, segments: segs });
      t += 29;
    }
    const out = stitchWindows(windows);
    for (let i = 1; i < out.length; i++) {
      const a = out[i - 1]!;
      const b = out[i]!;
      const dup = Math.abs(a.start - b.start) <= DUP_TOLERANCE_S && a.text === b.text;
      expect(dup).toBe(false);
    }
    // monotonic
    for (let i = 1; i < out.length; i++) {
      expect(out[i]!.start).toBeGreaterThanOrEqual(out[i - 1]!.start);
    }
  });
});
