import { describe, expect, test } from 'vitest';
import { ProjectPlayback, type PlaybackTrack } from '../../src/engine/projectPlayback';

// ---- recording fake AudioContext (pattern: fxGraphs.test.ts) ----

interface FakeNode {
  kind: string;
  gain?: { value: number; setTargetAtTime: (v: number, t: number, tau: number) => void };
  connects: Array<{ dest: FakeNode | unknown; out: number; in_: number }>;
  stopped: boolean;
  loop?: boolean;
  loopStart?: number;
  loopEnd?: number;
  onended: (() => void) | null;
  buffer?: { channels: Float32Array[] };
  startArgs?: { when: number; offset: number };
}

function makeFakeCtx(nChannels: number, samples: number) {
  const nodes: FakeNode[] = [];
  const setCalls: Array<{ node: FakeNode; v: number; tau: number }> = [];

  const makeNode = (kind: string, withGain: boolean): FakeNode => {
    const node: FakeNode = {
      kind,
      connects: [],
      stopped: false,
      onended: null,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
    };
    if (withGain) {
      node.gain = {
        value: 1,
        setTargetAtTime: (v: number, _t: number, tau: number) => {
          node.gain!.value = v;
          setCalls.push({ node, v, tau });
        },
      };
    }
    (node as unknown as Record<string, unknown>).connect = (
      dest: unknown,
      out = 0,
      in_ = 0,
    ): unknown => {
      node.connects.push({ dest, out, in_ });
      return dest;
    };
    (node as unknown as Record<string, unknown>).disconnect = (): void => {};
    (node as unknown as Record<string, unknown>).start = (when = 0, offset = 0): void => {
      node.startArgs = { when, offset };
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
      const buf = {
        channels,
        getChannelData: (c: number) => channels[c]!,
      };
      return buf;
    },
  };

  // wire connect()
  return { ctx: ctx as unknown, nodes, setCalls, samples, nChannels };
}

function track(
  channels: Float32Array[],
  opts: Partial<Pick<PlaybackTrack, 'gain' | 'pan' | 'mute' | 'solo'>> = {},
): PlaybackTrack {
  return { channels, gain: opts.gain ?? 1, pan: opts.pan ?? 0, mute: opts.mute ?? false, solo: opts.solo ?? false };
}

function stereo(n: number, l: number, r: number): Float32Array[] {
  return [new Float32Array(n).fill(l), new Float32Array(n).fill(r)];
}

function sources(fake: ReturnType<typeof makeFakeCtx>): FakeNode[] {
  return fake.nodes.filter((n) => n.kind === 'source');
}

function legGains(fake: ReturnType<typeof makeFakeCtx>): FakeNode[] {
  return fake.nodes.filter((n) => n.kind === 'gain');
}

describe('M8b ProjectPlayback — graph + mixing parity', () => {
  test('two stereo tracks: 2 sources, per-track L/R gains = panGains × effectiveGain', () => {
    const fake = makeFakeCtx(2, 1000);
    const pb = new ProjectPlayback(fake.ctx as never, 44100);
    const a = track(stereo(1000, 0.3, -0.3)); // center, gain 1 → legs 1,1
    const b = track(stereo(1000, 0.5, 0.5), { gain: 0.5, pan: -1 }); // legs (1·0.5, 0·0.5)
    pb.start([a, b]);

    const srcs = sources(fake);
    expect(srcs).toHaveLength(2);
    // each source gets a 2-channel buffer copy
    for (const s of srcs) {
      expect(s.buffer!.channels).toHaveLength(2);
      expect(s.buffer!.channels[0]!.length).toBe(1000);
    }
    const gains = legGains(fake).filter((g) => (g.gain?.value ?? 0) !== 1 || true);
    // 4 leg gains total (2 per track); values: a: 1,1 — b: 0.5, 0
    const vals = legGains(fake)
      .map((g) => g.gain!.value)
      .sort((x, y) => x - y);
    expect(vals).toEqual([0, 0.5, 1, 1]);
    void gains;
  });

  test('mono track centers at unity (both legs = input); anySolo silences others', () => {
    const fake = makeFakeCtx(2, 500);
    const pb = new ProjectPlayback(fake.ctx as never, 44100);
    const mono = track([new Float32Array(500).fill(0.6)]);
    const other = track(stereo(500, 0.4, 0.4), { gain: 0.9 });
    pb.start([mono, other]);
    expect(sources(fake)).toHaveLength(2);
    // mono buffer duplicates into 2 channels (f32: 0.6 ≠ fround(0.6))
    const f6 = Math.fround(0.6);
    const monoSrc = sources(fake).find((s) => s.buffer!.channels[0]![0] === f6);
    expect(monoSrc).toBeDefined();
    expect(monoSrc!.buffer!.channels[1]![0]).toBe(f6);
    // solo on `other`? no — nothing soloed: legs are mono(1,1), other(0.9,0.9)
    // now solo the mono track: other legs → 0
    pb.updateMix([track([new Float32Array(500).fill(0.6)], { solo: true }), other]);
    const vals = legGains(fake)
      .map((g) => g.gain!.value)
      .sort((x, y) => x - y);
    expect(vals).toEqual([0, 0, 1, 1]);
  });

  test('updateMix ramps with τ=0.01 (setTargetAtTime)', () => {
    const fake = makeFakeCtx(2, 100);
    const pb = new ProjectPlayback(fake.ctx as never, 44100);
    const t = track(stereo(100, 0.1, 0.1), { gain: 0.5 });
    pb.start([t]);
    const before = fake.setCalls.length;
    pb.updateMix([track(stereo(100, 0.1, 0.1), { gain: 1, pan: 0.5 })]);
    const calls = fake.setCalls.slice(before);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const c of calls) expect(c.tau).toBe(0.01);
    const vals = calls.map((c) => c.v).sort((a, b) => a - b);
    expect(vals).toEqual([0.5, 1]); // gL = 1−0.5 = 0.5, gR = 1 (balance law)
  });

  test('start offset + loop region land on sources; only the longest track ends', () => {
    const fake = makeFakeCtx(2, 10);
    const pb = new ProjectPlayback(fake.ctx as never, 44100);
    const short = track([new Float32Array(100)]);
    const long = track(stereo(1000, 0, 0));
    let ended = 0;
    pb.onEnded = () => {
      ended += 1;
    };
    pb.start([short, long], { from: 0.5, loop: { start: 0, end: 0.8 } });
    const srcs = sources(fake);
    const withEnd = srcs.filter((s) => s.onended !== null);
    expect(withEnd).toHaveLength(1);
    withEnd[0]!.onended!(); // longest ends → playback stops, onEnded fires once
    expect(ended).toBe(1);
    expect(pb.playing).toBe(false);
    for (const s of srcs) expect(s.stopped).toBe(true);
  });

  test('looped sources carry loopStart/loopEnd; start(0, from) offset passes through', () => {
    const fake = makeFakeCtx(2, 10);
    const pb = new ProjectPlayback(fake.ctx as never, 44100);
    pb.start([track(stereo(4410, 0, 0))], { from: 0.25, loop: { start: 0.1, end: 0.09 } }); // degenerate loop ignored
    const src = sources(fake)[0]!;
    expect(src.loop).toBe(false); // region < MIN_LOOP_SECONDS → no loop
    pb.start([track(stereo(44100, 0, 0))], { from: 0.25, loop: { start: 0.1, end: 0.9 } });
    const src2 = sources(fake)[1]!;
    expect(src2.loop).toBe(true);
    expect(src2.loopStart).toBeCloseTo(0.1, 5);
    expect(src2.loopEnd).toBeCloseTo(0.9, 5);
    expect(src2.startArgs!.offset).toBeCloseTo(0.25, 5);
  });

  test('stop() is idempotent; position() uses transport math via start bookkeeping', () => {
    const fake = makeFakeCtx(2, 10);
    const pb = new ProjectPlayback(fake.ctx as never, 44100);
    pb.stop(); // no-op, no throw
    pb.start([track(stereo(44100 * 10, 0, 0))], { from: 1 });
    expect(pb.playing).toBe(true);
    // ctx.currentTime advances → position = from + (now − startedAt)
    (fake.ctx as { currentTime: number }).currentTime = 6.5; // started at 5, from 1
    expect(pb.position()).toBeCloseTo(2.5, 5);
    pb.stop();
    expect(pb.playing).toBe(false);
    pb.stop(); // idempotent
  });
});
