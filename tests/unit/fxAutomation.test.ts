import { describe, expect, test } from 'vitest';
import { buildGraph } from '../../src/fx/graphs';
import { scheduleFxAuto, type GraphAutoTarget } from '../../src/fx/fxCurves';
import type { AutomationCurve } from '../../src/engine/automation';

// ---- recording fake (pattern: fxGraphs.test.ts) ----

interface Call {
  method: 'setValueAtTime' | 'linearRampToValueAtTime' | 'cancelScheduledValues';
  value: number;
  time: number;
}

class RecParam {
  value = 0;
  readonly calls: Call[] = [];
  setValueAtTime(v: number, t: number): void {
    this.value = v;
    this.calls.push({ method: 'setValueAtTime', value: v, time: t });
  }
  linearRampToValueAtTime(v: number, t: number): void {
    this.calls.push({ method: 'linearRampToValueAtTime', value: v, time: t });
  }
  cancelScheduledValues(t: number): void {
    this.calls.push({ method: 'cancelScheduledValues', value: 0, time: t });
  }
}

class FakeNode {
  connections: FakeNode[] = [];
  gain = new RecParam();
  frequency = new RecParam();
  Q = new RecParam();
  delayTime = new RecParam();
  curve: Float32Array | null = null;
  oversample = 'none';
  buffer: { channels: Float32Array[] } | null = null;
  type = '';
  connect(node: FakeNode): void {
    this.connections.push(node);
  }
}

class FakeContext {
  sampleRate = 44100;
  destination = new FakeNode();
  gains: FakeNode[] = [];
  biquads: FakeNode[] = [];
  delays: FakeNode[] = [];
  convolvers: FakeNode[] = [];
  shapers: FakeNode[] = [];
  buffers: Array<{ channels: Float32Array[] }> = [];
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
  createBuffer(ch: number, len: number): { channels: Float32Array[]; getChannelData(c: number): Float32Array } {
    const channels = Array.from({ length: ch }, () => new Float32Array(len));
    const buf = { channels, getChannelData: (c: number): Float32Array => channels[c]! };
    this.buffers.push(buf);
    return buf;
  }
}

/** All scheduling calls across a target's handles, in order. */
function targetCalls(t: GraphAutoTarget): Call[] {
  return t.params.flatMap((p) => (p.param as RecParam).calls);
}

const SR = 44100;

describe('A6a — buildGraph exposes automatable AudioParams', () => {
  test('delay: time, feedback, mix (wet/dry equal-power law, exact endpoints)', () => {
    const ctx = new FakeContext();
    const g = buildGraph(ctx as unknown as never, 'delay', { time: 0.3, feedback: 0.35, mix: 0.3 }, { channels: 2 });
    expect(g.auto).toBeDefined();
    expect(Object.keys(g.auto ?? []).sort()).toEqual(['feedback', 'mix', 'time']);
    const mix = g.auto!.mix!;
    expect(mix.min).toBe(0);
    expect(mix.max).toBe(1);
    expect(mix.params).toHaveLength(2); // wet + dry
    // endpoints EXACT (sin law — cos(π/2) ≈ 6e-17 must not leak in)
    expect(mix.params[0]!.apply(0)).toBe(0); // wet(0)
    expect(mix.params[0]!.apply(1)).toBe(1); // wet(1)
    expect(mix.params[1]!.apply(0)).toBe(1); // dry(0)
    expect(mix.params[1]!.apply(1)).toBe(0); // dry(1)
    // law: wet(m) = sin(m·π/2), dry(m) = sin((1−m)·π/2) — midpoint
    expect(mix.params[0]!.apply(0.5)).toBeCloseTo(Math.SQRT1_2, 12);
    // domains mirror the specs
    expect(g.auto!.time!.max).toBe(2);
    expect(g.auto!.feedback!.max).toBeCloseTo(0.95, 9);
  });

  test('reverb: mix only (time/decay/reverse shape the IR — not automatable)', () => {
    const ctx = new FakeContext();
    const g = buildGraph(ctx as unknown as never, 'reverb', { time: 1.8, decay: 2.5, mix: 0.35, reverse: false }, { channels: 2 });
    expect(Object.keys(g.auto ?? []).sort()).toEqual(['mix']);
  });

  test('pgeq: 3 shelf gains + midFreq + midQ on the biquad params', () => {
    const ctx = new FakeContext();
    const g = buildGraph(
      ctx as unknown as never,
      'pgeq',
      { lowGainDb: 0, midGainDb: 0, midFreq: 1000, midQ: 1, highGainDb: 0 },
      { channels: 2 },
    );
    expect(Object.keys(g.auto ?? []).sort()).toEqual(['highGainDb', 'lowGainDb', 'midFreq', 'midGainDb', 'midQ']);
    expect(g.auto!.midFreq!.min).toBe(200);
    expect(g.auto!.midFreq!.max).toBe(5000);
  });

  test('geq10/geq20: band{i} gains; distortion: NO auto (WaveShaper attribute)', () => {
    const ctx = new FakeContext();
    const params: Record<string, number> = {};
    for (let i = 0; i < 10; ++i) params[`band${i}`] = 0;
    const g10 = buildGraph(ctx as unknown as never, 'geq10', params, { channels: 2 });
    expect(Object.keys(g10.auto ?? [])).toHaveLength(10);
    expect(g10.auto!.band3!.min).toBe(-12);
    expect(g10.auto!.band3!.max).toBe(12);
    const gD = buildGraph(ctx as unknown as never, 'distortion', { amount: 20 }, { channels: 2 });
    expect(gD.auto ?? {}).toEqual({});
  });
});

describe('A6a — scheduleFxAuto (pure scheduler, region-relative samples)', () => {
  test('no curves → ZERO scheduling calls on every exposed param', () => {
    const ctx = new FakeContext();
    const g = buildGraph(ctx as unknown as never, 'delay', { time: 0.3, feedback: 0.35, mix: 0.3 }, { channels: 2 });
    scheduleFxAuto(g.auto ?? {}, {}, SR, 4 * SR);
    for (const key of ['time', 'feedback', 'mix']) {
      expect(targetCalls(g.auto![key]!)).toHaveLength(0);
    }
  });

  test('constant curve → single setValueAtTime (== the static .value path)', () => {
    const ctx = new FakeContext();
    const g = buildGraph(ctx as unknown as never, 'delay', { time: 0.3, feedback: 0.35, mix: 0.3 }, { channels: 2 });
    scheduleFxAuto(g.auto ?? {}, { time: [{ at: 0, value: 0.5 }] }, SR, 4 * SR);
    const calls = targetCalls(g.auto!.time!);
    // uniform cancel (no-op on a fresh param; clears ramps on live reuse)
    // + one setValueAtTime with the SAME value the static build set → the
    // offline render is identical to the `.value` path.
    expect(calls).toEqual([
      { method: 'cancelScheduledValues', value: 0, time: 0 },
      { method: 'setValueAtTime', value: 0.5, time: 0 },
    ]);
  });

  test('ramp: anchor at t=0 + linear knots at at/sr; law applied per knot', () => {
    const ctx = new FakeContext();
    const g = buildGraph(ctx as unknown as never, 'delay', { time: 0.3, feedback: 0.35, mix: 0.3 }, { channels: 2 });
    const curve: AutomationCurve = [
      { at: 0, value: 0 },
      { at: SR / 2, value: 0.5 },
      { at: 2 * SR, value: 1 },
    ];
    scheduleFxAuto(g.auto ?? {}, { mix: curve }, SR, 4 * SR);
    const calls = targetCalls(g.auto!.mix!);
    // cancel + anchor + 2 ramps, on EACH of the two handles (wet, dry)
    expect(calls).toHaveLength(8);
    const wet = (g.auto!.mix!.params[0]!.param as RecParam).calls;
    expect(wet[0]).toEqual({ method: 'cancelScheduledValues', value: 0, time: 0 });
    expect(wet[1]).toEqual({ method: 'setValueAtTime', value: 0, time: 0 }); // wet(0)
    expect(wet[2]).toEqual({ method: 'linearRampToValueAtTime', value: Math.sin(0.25 * Math.PI), time: 0.5 });
    expect(wet[3]).toEqual({ method: 'linearRampToValueAtTime', value: 1, time: 2 }); // wet(1)
    const dry = (g.auto!.mix!.params[1]!.param as RecParam).calls;
    expect(dry[1]).toEqual({ method: 'setValueAtTime', value: 1, time: 0 }); // dry(0)
    expect(dry[3]).toEqual({ method: 'linearRampToValueAtTime', value: 0, time: 2 }); // dry(1)
  });

  test('knots beyond the render window are ignored (hold after last)', () => {
    const ctx = new FakeContext();
    const g = buildGraph(ctx as unknown as never, 'delay', { time: 0.3, feedback: 0.35, mix: 0.3 }, { channels: 2 });
    scheduleFxAuto(
      g.auto ?? {},
      {
        time: [
          { at: 0, value: 0.1 },
          { at: SR, value: 0.2 },
          { at: 99 * SR, value: 1.9 }, // beyond the 4 s window
        ],
      },
      SR,
      4 * SR,
    );
    const calls = targetCalls(g.auto!.time!);
    expect(calls).toHaveLength(3); // cancel + anchor + 1 ramp
    expect(calls[2]).toEqual({ method: 'linearRampToValueAtTime', value: 0.2, time: 1 });
  });

  test('curve values clamp into the target domain', () => {
    const ctx = new FakeContext();
    const g = buildGraph(ctx as unknown as never, 'delay', { time: 0.3, feedback: 0.35, mix: 0.3 }, { channels: 2 });
    scheduleFxAuto(g.auto ?? {}, { feedback: [{ at: 0, value: 5 }] }, SR, SR); // 5 > 0.95
    const calls = targetCalls(g.auto!.feedback!);
    expect(calls[1]).toEqual({ method: 'setValueAtTime', value: 0.95, time: 0 });
  });
});
