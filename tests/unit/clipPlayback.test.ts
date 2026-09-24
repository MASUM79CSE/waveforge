import { describe, expect, test } from 'vitest';
import { ProjectPlayback } from '../../src/engine/projectPlayback';
import {
  expandClipPass,
  type ClipPlaybackTrack,
} from '../../src/engine/clipPlayback';
import type { AudioAsset } from '../../src/engine/clips';

// ---- fake ctx (pattern: projectPlayback.test.ts) + duration capture ----

interface FakeNode {
  kind: string;
  gain?: { value: number; setTargetAtTime: (v: number, t: number, tau: number) => void };
  connects: Array<{ dest: FakeNode | unknown; out: number; in_: number }>;
  stopped: boolean;
  onended: (() => void) | null;
  buffer?: { channels: Float32Array[] };
  startArgs?: { when: number; offset: number; duration?: number };
}

function makeFakeCtx() {
  const nodes: FakeNode[] = [];
  const makeNode = (kind: string, withGain: boolean): FakeNode => {
    const node: FakeNode = { kind, connects: [], stopped: false, onended: null };
    if (withGain) {
      node.gain = {
        value: 1,
        setTargetAtTime: (v: number) => {
          node.gain!.value = v;
        },
      };
    }
    (node as unknown as Record<string, unknown>).connect = (dest: unknown, out = 0, in_ = 0): unknown => {
      node.connects.push({ dest, out, in_ });
      return dest;
    };
    (node as unknown as Record<string, unknown>).disconnect = (): void => {};
    (node as unknown as Record<string, unknown>).start = (when = 0, offset = 0, duration?: number): void => {
      node.startArgs = { when, offset, duration };
    };
    (node as unknown as Record<string, unknown>).stop = (): void => {
      node.stopped = true;
    };
    nodes.push(node);
    return node;
  };
  const ctx = {
    currentTime: 5,
    destination: { kind: 'destination' },
    createBufferSource: () => makeNode('source', false),
    createGain: () => makeNode('gain', true),
    createChannelSplitter: () => makeNode('splitter', false),
    createChannelMerger: () => makeNode('merger', false),
    createBuffer: (ch: number, len: number) => {
      const channels = Array.from({ length: ch }, () => new Float32Array(len));
      return { channels, getChannelData: (c: number) => channels[c]! };
    },
  };
  return { ctx, nodes };
}

const SR = 1000; // 1 sample == 1 ms for trivial math

function asset(id: string, length: number, fill = 0.5, channels = 1): AudioAsset {
  return {
    id,
    sampleRate: SR,
    channels: Array.from({ length: channels }, () => new Float32Array(length).fill(fill)),
  };
}

function clipTrack(
  assets: AudioAsset[],
  clips: Array<{ start: number; duration: number; offset?: number; assetId?: string }>,
  opts: Partial<Pick<ClipPlaybackTrack, 'gain' | 'pan' | 'mute' | 'solo'>> = {},
): ClipPlaybackTrack {
  return {
    clips: clips.map((c, i) => ({
      id: `c${i}`,
      assetId: c.assetId ?? assets[0]!.id,
      start: c.start,
      offset: c.offset ?? 0,
      duration: c.duration,
    })),
    assets: new Map(assets.map((a) => [a.id, a])),
    gain: opts.gain ?? 1,
    pan: opts.pan ?? 0,
    mute: opts.mute ?? false,
    solo: opts.solo ?? false,
  };
}

function sources(fake: ReturnType<typeof makeFakeCtx>): FakeNode[] {
  return fake.nodes.filter((n) => n.kind === 'source');
}

// ---- pure expansion kernel ----

describe('M9c expandClipPass — pure per-clip schedule math', () => {
  test('from 0: one entry per clip with exact when/offset/dur', () => {
    const a = asset('a', 2000);
    const t = clipTrack([a], [
      { start: 0, duration: 2000 }, // 0..2 s
      { start: 500, duration: 500, assetId: 'a' }, // 0.5..1 s
    ]);
    const list = expandClipPass([t], SR, 0, 0, 2);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ trackIndex: 0, when: 0, offset: 0, dur: 2 });
    expect(list[1]).toMatchObject({ trackIndex: 0, when: 0.5, offset: 0, dur: 0.5 });
  });

  test('mid-clip seek maps into per-clip offsets (integer-sample exact)', () => {
    const a = asset('a', 2000);
    const t = clipTrack([a], [
      { start: 0, duration: 2000 },
      { start: 500, duration: 500 },
    ]);
    // pass starts at 0.3 s: first clip plays [0.3,2) → offset 0.3 dur 1.7;
    // second starts 0.2 s from now
    const list = expandClipPass([t], SR, 0.3, 0.3, 2);
    expect(list[0]).toMatchObject({ when: 0, offset: 0.3, dur: 1.7 });
    expect(list[1]).toMatchObject({ when: 0.2, offset: 0, dur: 0.5 });
  });

  test('loop window clips both sides; pass inside window anchors when', () => {
    const a = asset('a', 2000);
    const t = clipTrack([a], [{ start: 0, duration: 2000 }]);
    // window [0.2, 0.8), pass starts at 0.2 → offset 0.2, dur 0.6
    expect(expandClipPass([t], SR, 0.2, 0.2, 0.8)[0]).toMatchObject({
      when: 0,
      offset: 0.2,
      dur: 0.6,
    });
    // entering mid-window: pass 0.5, window [0, 0.8) → when clamps to 0,
    // offset jumps to 0.5, only 0.3 s remains
    expect(expandClipPass([t], SR, 0.5, 0, 0.8)[0]).toMatchObject({
      when: 0,
      offset: 0.5,
      dur: 0.3,
    });
  });

  test('clips outside the window are skipped; offset within clip is preserved', () => {
    const a = asset('a', 2000);
    const t = clipTrack([a], [
      { start: 0, duration: 400 },
      { start: 400, duration: 1200, offset: 100 }, // 0.4..1.6 s, asset offset 100
    ]);
    const list = expandClipPass([t], SR, 0.5, 0.5, 2);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ when: 0, offset: 0.2, dur: 1.1 }); // 100 + 100 samples
  });

  test('muted and solo-shadowed tracks skip scheduling; soloed still plays', () => {
    const a = asset('a', 1000);
    const b = asset('b', 1000);
    const muted = clipTrack([a], [{ start: 0, duration: 1000 }], { mute: true });
    const shadowed = clipTrack([b], [{ start: 0, duration: 1000 }], { gain: 0.8 });
    const soloed = clipTrack([b], [{ start: 0, duration: 1000 }], { solo: true });
    const list = expandClipPass([muted, shadowed, soloed], SR, 0, 0, 1);
    expect(list.map((c) => c.trackIndex)).toEqual([2]);
    // both soloed → nothing shadowed
    const soloBoth = clipTrack([b], [{ start: 0, duration: 1000 }], { solo: true });
    expect(expandClipPass([soloed, soloBoth], SR, 0, 0, 1)).toHaveLength(2);
  });

  test('unknown asset throws (library view contract)', () => {
    const t = clipTrack([asset('a', 100)], [{ start: 0, duration: 100, assetId: 'ghost' }]);
    expect(() => expandClipPass([t], SR, 0, 0, 0.1)).toThrow(/unknown asset/);
  });
});

// ---- graph: startClips schedules one source per clip ----

describe('M9c startClips — graph + loop restart (fake ctx)', () => {
  test('N clips → N sources; start(when+ctx, offset, dur); span buffers; leg parity', () => {
    const fake = makeFakeCtx();
    const pb = new ProjectPlayback(fake.ctx as never, SR);
    const a = asset('a', 2000, 0.5, 2); // stereo
    const b = asset('b', 500, 0.25); // mono
    const t1 = clipTrack([a], [{ start: 0, duration: 2000 }]);
    const t2 = clipTrack([b], [{ start: 500, duration: 500 }], { gain: 0.5, pan: -1 });
    pb.startClips([t1, t2], { from: 0.3 });

    const srcs = sources(fake);
    expect(srcs).toHaveLength(2);
    // clip A visible [0.3, 2): starts now, 1.7 s
    expect(srcs[0]!.startArgs).toEqual({ when: 5, offset: 0.3, duration: 1.7 });
    // clip B visible [0.5, 1): starts 0.2 s from now
    expect(srcs[1]!.startArgs).toEqual({ when: 5.2, offset: 0, duration: 0.5 });
    // buffers copy the CLIP's asset span (A: 2000 stereo, B: 500 mono→stereo)
    expect(srcs[0]!.buffer!.channels).toHaveLength(2);
    expect(srcs[0]!.buffer!.channels[0]!.length).toBe(2000);
    expect(srcs[1]!.buffer!.channels[0]!.length).toBe(500);
    expect(srcs[1]!.buffer!.channels[0]![0]).toBe(0.25);
    expect(srcs[1]!.buffer!.channels[1]![0]).toBe(0.25); // mono → both legs
    // legs: t1 (1,1); t2 gain .5 pan −1 → (.5, 0)
    const gains = fake.nodes.filter((n) => n.kind === 'gain').map((n) => n.gain!.value);
    expect(gains.sort((x, y) => x - y)).toEqual([0, 0.5, 1, 1]);
    expect(pb.playing).toBe(true);
  });

  test('natural end: max-end source carries onended; firing stops + notifies once', () => {
    const fake = makeFakeCtx();
    const pb = new ProjectPlayback(fake.ctx as never, SR);
    const a = asset('a', 1000);
    const t1 = clipTrack([a], [{ start: 0, duration: 1000 }]);
    const t2 = clipTrack([a], [{ start: 0, duration: 400 }]); // shorter
    let ended = 0;
    pb.onEnded = () => {
      ended += 1;
    };
    pb.startClips([t1, t2]);
    const enders = sources(fake).filter((s) => s.onended !== null);
    expect(enders).toHaveLength(1);
    enders[0]!.onended!();
    expect(ended).toBe(1);
    expect(pb.playing).toBe(false);
    for (const s of sources(fake)) expect(s.stopped).toBe(true);
    pb.stop(); // idempotent
  });

  test('loop: pass over the region; onended restarts a fresh pass (restart-on-loop)', () => {
    const fake = makeFakeCtx();
    const pb = new ProjectPlayback(fake.ctx as never, SR);
    const a = asset('a', 2000);
    const t = clipTrack([a], [{ start: 0, duration: 2000 }]);
    pb.startClips([t], { from: 0, loop: { start: 0, end: 0.8 } });
    expect(sources(fake)).toHaveLength(1);
    expect(sources(fake)[0]!.startArgs!.duration).toBeCloseTo(0.8, 9);

    sources(fake)[0]!.onended!(); // pass finished → restart
    const pass2 = sources(fake);
    expect(pass2).toHaveLength(2); // fresh source, old torn down
    expect(pb.playing).toBe(true);
    expect(pass2[1]!.startArgs).toEqual({ when: 5, offset: 0, duration: 0.8 });
    expect(pb.position()).toBe(0); // restart anchored at loop start, ctx time unchanged

    pass2[1]!.onended!();
    expect(sources(fake)).toHaveLength(3); // third pass
  });

  test('loop over an empty gap does not hang: no sources → not playing', () => {
    const fake = makeFakeCtx();
    const pb = new ProjectPlayback(fake.ctx as never, SR);
    const t = clipTrack([asset('a', 500)], [{ start: 0, duration: 500 }]); // ends 0.5 s
    pb.startClips([t], { loop: { start: 1.5, end: 2.5 } }); // gap loop
    expect(sources(fake)).toHaveLength(0);
    expect(pb.playing).toBe(false);
  });

  test('position math unchanged: seek + drift-free via start bookkeeping', () => {
    const fake = makeFakeCtx();
    const pb = new ProjectPlayback(fake.ctx as never, SR);
    const t = clipTrack([asset('a', 5000)], [{ start: 0, duration: 5000 }]);
    pb.startClips([t], { from: 2 });
    expect(pb.position()).toBe(2); // started at ctx 5, no time elapsed
    (fake.ctx as { currentTime: number }).currentTime = 6.5;
    expect(pb.position()).toBeCloseTo(3.5, 9);
    expect(pb.playing).toBe(true);
  });
});
