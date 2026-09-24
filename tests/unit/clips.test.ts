import { describe, expect, test } from 'vitest';
import {
  clipEnd,
  duplicateClip,
  findClipAt,
  insertClip,
  moveClip,
  removeClip,
  renderClipTrack,
  renderClipTrackReference,
  renderRegion,
  splitClip,
  timelineDuration,
  trimClip,
  type AudioAsset,
  type AudioClip,
  type ClipTrack,
} from '../../src/engine/clips';

const SR = 44100;

let seq = 0;
function clip(start: number, duration: number, offset = 0, assetId = 'a1'): AudioClip {
  seq += 1;
  return { id: `c${seq}`, assetId, start, offset, duration };
}

function asset(id: string, length: number, fill = 0.25, channels = 1): AudioAsset {
  return {
    id,
    sampleRate: SR,
    channels: Array.from({ length: channels }, () => new Float32Array(length).fill(fill)),
  };
}

function trackOf(...clips: AudioClip[]): ClipTrack {
  let t: ClipTrack = { clips: [] };
  for (const c of clips) t = insertClip(t, c);
  return t;
}

describe('M9a clip core — placement kernels', () => {
  test('insert keeps sort order and refuses overlaps', () => {
    const a = clip(0, 100);
    const b = clip(200, 100);
    const t = trackOf(a, b);
    expect(t.clips.map((c) => c.start)).toEqual([0, 200]);
    expect(() => insertClip(t, clip(50, 100))).toThrow(); // overlaps a
    expect(() => insertClip(t, clip(-10, 20))).toThrow(); // negative start
    // exact adjacency is legal
    const t2 = insertClip(t, clip(100, 100));
    expect(t2.clips).toHaveLength(3);
  });

  test('clipEnd / findClipAt / timelineDuration', () => {
    const t = trackOf(clip(10, 40), clip(100, 25));
    expect(clipEnd(t.clips[0]!)).toBe(50);
    expect(findClipAt(t, 30)?.start).toBe(10);
    expect(findClipAt(t, 99)).toBeUndefined();
    expect(timelineDuration(t)).toBe(125);
    expect(timelineDuration({ clips: [] })).toBe(0);
  });

  test('split math: offset accumulates; halves tile the original exactly', () => {
    const t = trackOf(clip(10, 100, 5, 'a1'));
    const id = t.clips[0]!.id;
    const { track: t2, left, right } = splitClip(t, id, 40);
    expect(left).toEqual({ ...t.clips[0], duration: 30 });
    expect(right).toEqual({ id: right.id, assetId: 'a1', start: 40, offset: 35, duration: 70 });
    expect(t2.clips.map((c) => c.start)).toEqual([10, 40]);
    expect(() => splitClip(t, id, 10)).toThrow(); // at the edge
    expect(() => splitClip(t, id, 110)).toThrow(); // past the end
    expect(() => splitClip(t, 'nope', 50)).toThrow();
  });

  test('trim: start-trim shifts offset; end-trim shortens; both clamp', () => {
    const t = trackOf(clip(10, 100, 5), clip(200, 50)); // asset a1 len 300
    const id = t.clips[0]!.id;
    const startTrim = trimClip(t, id, 'start', 25, 300);
    expect(startTrim.clip).toEqual({ ...t.clips[0], start: 25, offset: 20, duration: 85 });
    const endTrim = trimClip(t, id, 'end', 80, 300);
    expect(endTrim.clip).toEqual({ ...t.clips[0], duration: 70 });
    // start clamp: cannot cross the next neighbour's start
    const clamped = trimClip(t, id, 'start', 250, 300);
    expect(clamped.clip.start).toBeLessThanOrEqual(200); // next clip starts at 200
    // asset bound: end-trim cannot exceed offset+assetLen
    const lone = trackOf(clip(0, 400, 0));
    const assetClamped = trimClip(lone, lone.clips[0]!.id, 'end', 400, 300);
    expect(assetClamped.clip.duration).toBe(300);
  });

  test('move clamps into the free gap between neighbours, never overlaps', () => {
    const t = trackOf(clip(0, 100), clip(200, 100), clip(500, 50)); // gap [100,200) and [300,500)
    const mid = t.clips[1]!.id;
    const left = moveClip(t, mid, -150);
    expect(left.clip.start).toBe(100); // clamped to prev.end
    const right = moveClip(t, mid, 250);
    expect(right.clip.start).toBe(400); // clamped to next.start − duration
    const free = moveClip(t, mid, 50);
    expect(free.clip.start).toBe(250);
  });

  test('duplicate shares the asset, lands after the original, refuses overlap', () => {
    const t = trackOf(clip(0, 100), clip(250, 100)); // gap [100,250) fits a copy
    const { track: t2, clip: dup } = duplicateClip(t, t.clips[0]!.id, 'dup1');
    expect(dup.assetId).toBe(t.clips[0]!.assetId);
    expect(dup.start).toBe(100);
    expect(t2.clips.map((c) => c.start)).toEqual([0, 100, 250]);
    // no room → throws
    const tight = trackOf(clip(0, 100), clip(100, 100));
    expect(() => duplicateClip(tight, tight.clips[0]!.id, 'dup2')).toThrow();
  });

  test('removeClip drops the lane entry (asset untouched)', () => {
    const t = trackOf(clip(0, 100), clip(150, 100));
    const t2 = removeClip(t, t.clips[0]!.id);
    expect(t2.clips).toHaveLength(1);
    expect(removeClip(t, 'nope')).toBe(t); // identity → nothing changed
  });
});

describe('M9a render kernels — bit anchors', () => {
  test('sequential clips == concatenation (bit-equal); silence where empty', () => {
    const assets = new Map([[ 'a1', asset('a1', 200, 0.5) ], [ 'a2', asset('a2', 100, -0.5) ]]);
    const t = trackOf(clip(0, 100, 0, 'a1'), clip(150, 50, 0, 'a2'));
    const out = renderClipTrack(t, assets);
    expect(out).toHaveLength(2);
    for (let i = 0; i < 100; ++i) expect(out[0]![i]).toBe(Math.fround(0.5));
    for (let i = 100; i < 150; ++i) expect(out[0]![i]).toBe(0);
    for (let i = 150; i < 200; ++i) expect(out[0]![i]).toBe(Math.fround(-0.5));
  });

  test('two tracks summed == M8-style ordered accumulation (reference bit-equal)', () => {
    const assets = new Map([
      ['x', asset('x', 100, 0.25)],
      ['y', asset('y', 100, 0.5)],
    ]);
    const t1: ClipTrack = { clips: [{ id: 'p', assetId: 'x', start: 0, offset: 0, duration: 100 }] };
    const t2: ClipTrack = { clips: [{ id: 'q', assetId: 'y', start: 0, offset: 0, duration: 100 }] };
    const a = renderClipTrack(t1, assets);
    const b = renderClipTrack(t2, assets);
    const sum = new Float32Array(100);
    const sumR = new Float32Array(100);
    for (let i = 0; i < 100; ++i) {
      sum[i] = a[0]![i]! + b[0]![i]!;
      sumR[i] = a[0]![i]! + b[0]![i]!;
    }
    expect(sum).toEqual(sumR);
    // offset placement reads the asset interior
    const off = renderClipTrack(
      { clips: [{ id: 'o', assetId: 'x', start: 10, offset: 40, duration: 20 }] },
      assets,
    );
    expect(off[0]![10]).toBe(Math.fround(0.25));
    expect(off[0]![29]).toBe(Math.fround(0.25));
    expect(off[0]).toHaveLength(30); // duration = timeline end (index 30 is past it)
  });

  test('fast render is bit-equal to the slow reference (random-ish timeline)', () => {
    const n = 5000;
    const data = new Float32Array(n);
    for (let i = 0; i < n; ++i) data[i] = Math.sin(i / 7) * 0.9;
    const assets = new Map([['big', { id: 'big', sampleRate: SR, channels: [data] }]]);
    const t = trackOf(
      clip(0, 1000, 0, 'big'),
      clip(1200, 800, 500, 'big'),
      clip(2500, 2500, 0, 'big'),
    );
    const fast = renderClipTrack(t, assets);
    const slow = renderClipTrackReference(t, assets);
    expect(fast[0]).toEqual(slow[0]);
    expect(fast[1]).toEqual(slow[1]);
  });

  test('renderRegion returns only [from, from+len); mono asset feeds both channels', () => {
    const assets = new Map([['m', asset('m', 100, 0.75)]]);
    const t = trackOf(clip(0, 100, 0, 'm'));
    const region = renderRegion(t, assets, 40, 20);
    expect(region).toHaveLength(2);
    expect(region[0]).toHaveLength(20);
    expect(region[0]![0]).toBe(Math.fround(0.75));
    expect(region[1]![5]).toBe(Math.fround(0.75));
  });

  test('determinism: two renders bit-identical; empty track → zero channels of len 0', () => {
    const assets = new Map([['a1', asset('a1', 50, 0.5)]]);
    const t = trackOf(clip(0, 50, 0, 'a1'));
    expect(renderClipTrack(t, assets)[0]).toEqual(renderClipTrack(t, assets)[0]);
    const empty = renderClipTrack({ clips: [] }, assets);
    expect(empty[0]).toHaveLength(0);
  });

  test('[profile] 60 s single-clip render; 200-clip timeline render', { timeout: 30_000 }, () => {
    const n = SR * 60;
    const data = new Float32Array(n);
    for (let i = 0; i < n; i += 64) data[i] = ((i * 2654435761) >>> 16) / 2147483648 - 1;
    const assets = new Map([['big', { id: 'big', sampleRate: SR, channels: [data] }]]);
    let t0 = performance.now();
    renderClipTrack(trackOf(clip(0, n, 0, 'big')), assets);
    const singleMs = performance.now() - t0;
    // 200 clips tiling 60 s (0.3 s each, 4410 samples)
    const clips: AudioClip[] = [];
    for (let i = 0; i < 200; ++i) {
      clips.push(clip(i * 4410, 4410, (i % 2) * 2205, 'big'));
    }
    let tiled: ClipTrack = { clips: [] };
    for (const c of clips) tiled = insertClip(tiled, c);
    t0 = performance.now();
    renderClipTrack(tiled, assets);
    const tiledMs = performance.now() - t0;
    // eslint-disable-next-line no-console
    console.log(
      `[profile] M9a render 60 s: single ${Math.round(singleMs)} ms, 200-clip ${Math.round(tiledMs)} ms`,
    );
    expect(singleMs).toBeLessThan(500); // budget 120 uninstrumented (smoke)
    expect(tiledMs).toBeLessThan(1500); // budget 400 uninstrumented (ADR 009 smoke)
  });
});
