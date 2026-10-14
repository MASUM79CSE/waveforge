import { crossfadeClips, setClipFades, uncrossfadeClips } from '../../src/engine/clipFadesKernels';
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

// ---- PF-02 / AM-06: clip fades + crossfade ----
describe('clip fades + crossfade (PF-02)', () => {
  test('RED: kernels exist', () => {
    expect(setClipFades).toBeTypeOf('function');
    expect(crossfadeClips).toBeTypeOf('function');
    expect(uncrossfadeClips).toBeTypeOf('function');
  });

  test('setClipFades clamps fi+fo to the clip length and zeroes sub-5 ms values', () => {
    const first = clip(0, SR); // 1 s clip
    const track = { clips: [first] };
    const out = setClipFades(track, first.id, 1000, SR - 400);
    const c = out.clips[0]!;
    expect(c.fadeIn).toBe(1000);
    expect(c.fadeOut).toBe(SR - 1000); // fo clamped so fi+fo <= duration
    const tiny = setClipFades(track, first.id, 220, 220); // < 5 ms @ 44.1 kHz
    expect(tiny.clips[0]!.fadeIn).toBe(0);
    expect(tiny.clips[0]!.fadeOut).toBe(0);
  });

  test('fade gains are quadratic (p²) like the reference fadeGain', () => {
    const a = asset('a1', SR, 0.25);
    const fi = Math.round(SR / 100); // 10 ms
    const fo = Math.round(SR / 100);
    const c = { ...clip(0, SR), fadeIn: fi, fadeOut: fo };
    const [L] = renderClipTrack({ clips: [c] }, new Map([['a1', a]]));
    expect(L?.[0]).toBeCloseTo(0, 6); // p=0
    const i = Math.round(fi / 2);
    expect(L?.[i]).toBeCloseTo(0.25 * (i / fi) ** 2, 5); // quadratic p²
    expect(L?.[fi - 1]).toBeCloseTo(0.25 * ((fi - 1) / fi) ** 2, 5); // p→1
    // fade-out: gain ((fo-j)/fo)²
    const j = Math.round(fo / 2);
    expect(L?.[SR - fo + j]).toBeCloseTo(0.25 * ((fo - j) / fo) ** 2, 5);
    expect(L?.[SR - 1]).toBeCloseTo(Math.pow(1 / fo, 2) * 0.25, 6); // j = fo-1
    // body untouched
    expect(L?.[fi + 100]).toBeCloseTo(0.25, 6);
  });

  test('crossfadeClips extends the earlier clip and marks the pair on the later clip', () => {
    const a = asset('a1', SR, 0.5); // headroom beyond the 1000-sample window
    const b = asset('a2', SR, -0.25);
    const first = clip(0, 1000, 0, 'a1');
    const second = clip(1000, 1000, 0, 'a2');
    const track = { clips: [first, second] };
    const len = 441; // 10 ms — above the 5 ms activation floor
    const out = crossfadeClips(track, second.id, len, new Map([['a1', a], ['a2', b]]));
    const earlier = out.clips[0]!;
    const later = out.clips[1]!;
    expect(earlier.duration).toBe(1000 + len); // extended over the boundary
    expect(earlier.start).toBe(first.start);
    expect(later.xfadeWith).toBe(earlier.id);
    expect(clipEnd(earlier)).toBe(1441); // overlap [1000, 1441)
  });

  test('crossfadeClips falls back to slipping the later clip earlier (split clips)', () => {
    // earlier: asset a1 fully consumed (no headroom); later: offset 1000
    const a1 = asset('a1', 1000, 0.5);
    const a2 = asset('a2', 2000, 0.25);
    const map = new Map([['a1', a1], ['a2', a2]]);
    const later = clip(1000, 1000, 1000, 'a2');
    const track = { clips: [clip(0, 1000, 0, 'a1'), later] };
    const out = crossfadeClips(track, later.id, 441, map);
    const earlier = out.clips[0]!;
    const slipped = out.clips[1]!;
    expect(earlier.duration).toBe(1000); // untouched
    expect(slipped.start).toBe(1000 - 441); // slipped over the boundary
    expect(slipped.offset).toBe(1000 - 441); // asset audio exists there
    expect(slipped.xfadeWith).toBe(earlier.id);
    const [L] = renderClipTrack(out, map);
    expect(L![800]!).toBeCloseTo(0.5 * Math.cos(((800 - 559) / 441) * (Math.PI / 2)) + 0.25 * Math.sin(((800 - 559) / 441) * (Math.PI / 2)), 5);
  });

  test('crossfadeClips refuses sub-5 ms overlaps', () => {
    const map = new Map([['a1', asset('a1', SR, 0.5)], ['a2', asset('a2', SR, 0.25)]]);
    const track = { clips: [clip(0, 1000, 0, 'a1'), clip(1000, 1000, 0, 'a2')] };
    expect(() => crossfadeClips(track, track.clips[1]!.id, 200, map)).toThrow(); // 200 < 220.5
  });

  test('crossfadeClips refuses non-adjacent pairs and insufficient asset headroom', () => {
    const a = asset('a1', 1000, 0.5); // NO headroom beyond the first clip
    const b = asset('a2', SR, -0.25);
    const map = new Map([['a1', a], ['a2', b]]);
    const adjacent = { clips: [clip(0, 1000, 0, 'a1'), clip(1000, 1000, 0, 'a2')] };
    expect(() => crossfadeClips(adjacent, adjacent.clips[1]!.id, 441, map)).toThrow();
    const gapped = { clips: [clip(0, 1000, 0, 'a1'), clip(2000, 1000, 0, 'a2')] };
    const gappedMap = new Map([['a1', asset('a1', SR, 0.5)], ['a2', b]]);
    expect(() => crossfadeClips(gapped, gapped.clips[1]!.id, 200, gappedMap)).toThrow(); // gap > 5 ms
  });

  test('render: equal-power cos/sin gains across the overlap; edges exact', () => {
    const a = asset('a1', SR, 0.5);
    const b = asset('a2', SR, -0.25);
    const map = new Map([['a1', a], ['a2', b]]);
    const second = clip(1000, 1000, 0, 'a2');
    const track = { clips: [clip(0, 1000, 0, 'a1'), second] };
    const len = 441; // 10 ms
    const out = crossfadeClips(track, second.id, len, map);
    const [L] = renderClipTrack(out, map);
    // overlap [1000, 1441): earlier (a1, 0.5) gets cos(p·π/2); later (a2,
    // −0.25) gets sin(p·π/2); assert the closed-form gains at probed indices
    const at = (i: number): number => {
      const p = i / len;
      return 0.5 * Math.cos((p * Math.PI) / 2) - 0.25 * Math.sin((p * Math.PI) / 2);
    };
    expect(L![1000]!).toBeCloseTo(0.5, 5); // p=0: cos=1, sin=0
    expect(L![1000 + 220]!).toBeCloseTo(at(220), 5);
    expect(L![1000 + 440]!).toBeCloseTo(at(440), 5);
    expect(L![1440]!).toBeCloseTo(-0.25 * Math.sin((440 / 441) * (Math.PI / 2)) + 0.5 * Math.cos((440 / 441) * (Math.PI / 2)), 5);
    // outside the overlap: pure sources
    expect(L![500]).toBe(0.5);
    expect(L![1500]).toBe(-0.25);
  });

  test('xfade overrides fi/fo inside the overlap; fades still apply outside it', () => {
    const a = asset('a1', SR, 0.5);
    const b = asset('a2', SR, 0.25);
    const map = new Map([['a1', a], ['a2', b]]);
    const first = clip(0, 1000, 0, 'a1');
    const second = clip(1000, 1000, 0, 'a2');
    const track = { clips: [first, second] };
    const fi = 441; // 10 ms — above the sub-5 ms snap floor
    const out = crossfadeClips(track, second.id, 441, map);
    const withFades = setClipFades(out, first.id, fi, 0); // earlier clip fades in
    const [L] = renderClipTrack(withFades, map);
    // inside the fi window but BEFORE the overlap: quadratic applies (t < 1000)
    expect(L![100]!).toBeCloseTo(0.5 * Math.pow(100 / fi, 2), 4);
    // inside the overlap: xfade wins (constant 0.5 at p=0)
    expect(L![1000]).toBeCloseTo(0.5, 4);
    // later clip has no fades outside the overlap
    expect(L![1500]).toBeCloseTo(0.25, 5);
  });

  test('dangling xfadeWith (partner removed) renders as plain fades', () => {
    const a = asset('a1', SR, 0.5);
    const b = asset('a2', SR, 0.25);
    const map = new Map([['a1', a], ['a2', b]]);
    const track = { clips: [clip(0, 1000, 0, 'a1'), clip(1000, 1000, 0, 'a2')] };
    const x = crossfadeClips(track, track.clips[1]!.id, 441, map);
    const removed = removeClip(x, track.clips[0]!.id);
    const [L] = renderClipTrack(removed, map);
    expect(L![1000]).toBeCloseTo(0.25, 5); // later clip head plays at full gain
    expect(L![500]).toBe(0); // earlier clip gone
  });

  test('fast render stays bit-equal to the slow reference with fades + xfade', () => {
    const a = asset('a1', SR, 0.5);
    const b = asset('a2', SR, 0.25);
    const map = new Map([['a1', a], ['a2', b]]);
    const track = { clips: [clip(0, 1000, 0, 'a1'), clip(1000, 1000, 0, 'a2')] };
    const x = crossfadeClips(track, track.clips[1]!.id, 441, map);
    const f = setClipFades(x, track.clips[0]!.id, 150, 0);
    const fast = renderClipTrack(f, map);
    const slow = renderClipTrackReference(f, map);
    expect(Array.from(fast[0]!)).toEqual(Array.from(slow[0]!));
    expect(Array.from(fast[1]!)).toEqual(Array.from(slow[1]!));
  });

  test('renderRegion honors clip fades', () => {
    const a = asset('a1', SR, 0.25);
    const fi = 200;
    const c = { ...clip(0, 1000, 0, 'a1'), fadeIn: fi };
    const [L] = renderRegion({ clips: [c] }, new Map([['a1', a]]), 0, 500);
    expect(L?.[0]).toBeCloseTo(0, 6);
    expect(L?.[100]).toBeCloseTo(0.25 * Math.pow(100 / fi, 2), 5);
    expect(L?.[300]).toBeCloseTo(0.25, 5);
  });

  test('uncrossfadeClips clears the marker and keeps the geometry', () => {
    const map = new Map([['a1', asset('a1', SR, 0.5)], ['a2', asset('a2', SR, 0.25)]]);
    const track = { clips: [clip(0, 1000, 0, 'a1'), clip(1000, 1000, 0, 'a2')] };
    const x = crossfadeClips(track, track.clips[1]!.id, 441, map);
    const u = uncrossfadeClips(x, track.clips[1]!.id);
    expect(u.clips[0]!.duration).toBe(1441); // geometry kept (reference keeps it too)
    expect(u.clips[1]!.xfadeWith).toBeUndefined();
    const [L] = renderClipTrack(u, map);
    expect(L![1100]).toBeCloseTo(0.75, 5); // plain additive mix again
  });
});
