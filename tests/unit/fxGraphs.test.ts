import { describe, expect, test } from 'vitest';
import { buildGraph } from '../../src/fx/graphs';
import type { Params } from '../../src/fx/types';

// ---- recording fake AudioContext ----

class FakeParam {
  constructor(public value = 0) {}
  setValueAtTime(): void {}
  linearRampToValueAtTime(): void {}
}

class FakeNode {
  connections: FakeNode[] = [];
  gain = new FakeParam(1);
  frequency = new FakeParam(0);
  Q = new FakeParam(0);
  delayTime = new FakeParam(0);
  threshold = new FakeParam(0);
  knee = new FakeParam(0);
  ratio = new FakeParam(0);
  attack = new FakeParam(0);
  release = new FakeParam(0);
  curve: Float32Array | null = null;
  oversample = 'none';
  buffer: FakeBuffer | null = null;
  type = '';
  connect(node: FakeNode): void {
    this.connections.push(node);
  }
}

class FakeBuffer {
  data: Float32Array[];
  constructor(
    public numberOfChannels: number,
    public length: number,
    public sampleRate: number,
  ) {
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(ch: number): Float32Array {
    return this.data[ch] ?? new Float32Array(0);
  }
}

class FakeContext {
  sampleRate = 44100;
  destination = new FakeNode();
  gains: FakeNode[] = [];
  biquads: FakeNode[] = [];
  dynamics: FakeNode[] = [];
  delays: FakeNode[] = [];
  convolvers: FakeNode[] = [];
  shapers: FakeNode[] = [];
  buffers: FakeBuffer[] = [];
  createGain(): FakeNode {
    const n = new FakeNode();
    this.gains.push(n);
    return n;
  }
  createBiquadFilter(): FakeNode {
    const n = new FakeNode();
    this.biquads.push(n);
    return n;
  }
  createDynamicsCompressor(): FakeNode {
    const n = new FakeNode();
    this.dynamics.push(n);
    return n;
  }
  createDelay(): FakeNode {
    const n = new FakeNode();
    this.delays.push(n);
    return n;
  }
  createConvolver(): FakeNode {
    const n = new FakeNode();
    this.convolvers.push(n);
    return n;
  }
  createWaveShaper(): FakeNode {
    const n = new FakeNode();
    this.shapers.push(n);
    return n;
  }
  createBuffer(ch: number, len: number, sr: number): FakeBuffer {
    const b = new FakeBuffer(ch, len, sr);
    this.buffers.push(b);
    return b;
  }
}

function must<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('expected a node');
  return value;
}

function wired(from: unknown, to: unknown): boolean {
  return must(from as FakeNode).connections.includes(to as FakeNode);
}

const G10 = Object.fromEntries(
  [31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].map((_, i) => [
    `band${i}`,
    [3, -2, 1, 0, 0, -1, 2, 0, 4, -3][i],
  ]),
) as Params;

describe('buildGraph (construction contracts)', () => {
  test('distortion: WaveShaper carries the generated curve', () => {
    const ctx = new FakeContext();
    const { output } = buildGraph(
      ctx as unknown as BaseAudioContext,
      'distortion',
      { amount: 40 },
      { channels: 1 },
    );
    expect(ctx.shapers).toHaveLength(1);
    const shaper = must(ctx.shapers[0]);
    const curve = must(shaper.curve);
    expect(curve).toHaveLength(44100);
    // x = 0 maps between samples for even n: the curve must pass through ~0
    expect(Math.abs(must(curve[Math.floor(44100 / 2)]))).toBeLessThan(0.001);
    expect(shaper.oversample).toBe('2x');
    expect(output).toBe(shaper);
  });

  test('delay: feedback loop wired, equal-power dry/wet from mix', () => {
    const ctx = new FakeContext();
    const { input, output } = buildGraph(
      ctx as unknown as BaseAudioContext,
      'delay',
      { time: 0.3, feedback: 0.35, mix: 0.3 },
      { channels: 2 },
    );
    expect(ctx.delays).toHaveLength(1);
    const delay = must(ctx.delays[0]);
    expect(delay.delayTime.value).toBeCloseTo(0.3, 6);
    // identify gains by their values
    const fb = must(ctx.gains.find((g) => g.gain.value === 0.35));
    const dry = must(
      ctx.gains.find((g) => Math.abs(g.gain.value - Math.sin(0.7 * (Math.PI / 2))) < 1e-6),
    );
    const wet = must(
      ctx.gains.find((g) => Math.abs(g.gain.value - Math.sin(0.3 * (Math.PI / 2))) < 1e-6),
    );
    // feedback loop: delay -> fb -> delay
    expect(wired(delay, fb)).toBe(true);
    expect(wired(fb, delay)).toBe(true);
    // paths: input -> dry -> output and input -> delay -> wet -> output
    expect(wired(input, dry)).toBe(true);
    expect(wired(dry, output)).toBe(true);
    expect(wired(delay, wet)).toBe(true);
    expect(wired(wet, output)).toBe(true);
  });

  test('reverb: convolver gets a generated stereo IR sized to time * sampleRate', () => {
    const ctx = new FakeContext();
    const time = 1.2;
    buildGraph(
      ctx as unknown as BaseAudioContext,
      'reverb',
      { time, decay: 2.5, mix: 0.35, reverse: false },
      { channels: 2 },
    );
    expect(ctx.convolvers).toHaveLength(1);
    expect(ctx.buffers).toHaveLength(1);
    const ir = must(ctx.buffers[0]);
    expect(ir.numberOfChannels).toBe(2);
    expect(ir.length).toBe(Math.round(44100 * time));
    // IR content was written into the buffer
    expect(Math.max(...Array.from(ir.getChannelData(0).slice(0, 100)))).toBeGreaterThan(0);
  });

  test('pgeq: lowshelf -> peaking -> highshelf chain with params', () => {
    const ctx = new FakeContext();
    const { input, output } = buildGraph(
      ctx as unknown as BaseAudioContext,
      'pgeq',
      { lowGainDb: 3, midGainDb: -2, midFreq: 900, midQ: 1.5, highGainDb: 6 },
      { channels: 1 },
    );
    expect(ctx.biquads).toHaveLength(3);
    const low = must(ctx.biquads[0]);
    const mid = must(ctx.biquads[1]);
    const high = must(ctx.biquads[2]);
    expect(low.type).toBe('lowshelf');
    expect(low.frequency.value).toBe(120);
    expect(low.gain.value).toBe(3);
    expect(mid.type).toBe('peaking');
    expect(mid.frequency.value).toBe(900);
    expect(mid.Q.value).toBe(1.5);
    expect(mid.gain.value).toBe(-2);
    expect(high.type).toBe('highshelf');
    expect(high.frequency.value).toBe(3800);
    expect(high.gain.value).toBe(6);
    expect(input).toBe(low); // the shelf chain IS the graph path
    expect(wired(low, mid)).toBe(true);
    expect(wired(mid, high)).toBe(true);
    expect(output).toBe(high);
  });

  test('geq10: ten peaking biquads at ISO octave centers, chained in order', () => {
    const ctx = new FakeContext();
    const { input, output } = buildGraph(
      ctx as unknown as BaseAudioContext,
      'geq10',
      G10,
      { channels: 2 },
    );
    expect(ctx.biquads).toHaveLength(10);
    const centers = [31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    ctx.biquads.forEach((b, i) => {
      const band = must(b);
      expect(band.type).toBe('peaking');
      expect(band.frequency.value).toBe(centers[i]);
      expect(band.Q.value).toBeCloseTo(1.41, 5);
      expect(band.gain.value).toBe(G10[`band${i}`]);
    });
    expect(input).toBe(ctx.biquads[0]); // first band is the graph input
    for (let i = 1; i < 10; ++i) expect(wired(ctx.biquads[i - 1], ctx.biquads[i])).toBe(true);
    expect(output).toBe(ctx.biquads[9]); // last band is the output
  });

  test('geq20: twenty log-spaced bands, monotonic, audio-range', () => {
    const ctx = new FakeContext();
    const params = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`band${i}`, 0]),
    ) as Params;
    buildGraph(ctx as unknown as BaseAudioContext, 'geq20', params, { channels: 2 });
    expect(ctx.biquads).toHaveLength(20);
    const freqs = ctx.biquads.map((b) => must(b).frequency.value);
    for (let i = 1; i < 20; ++i) {
      expect(freqs[i] ?? 0).toBeGreaterThan(freqs[i - 1] ?? 0);
    }
    expect(freqs[0] ?? 0).toBeGreaterThanOrEqual(20);
    expect(freqs[19] ?? 1e9).toBeLessThanOrEqual(20000);
  });
});
