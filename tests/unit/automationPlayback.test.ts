import { describe, expect, test } from 'vitest';
import { ProjectPlayback } from '../../src/engine/projectPlayback';
import type { ClipPlaybackTrack } from '../../src/engine/clipPlayback';
import type { AutomationCurve } from '../../src/engine/automation';

const SR = 44100;

// ---- recording fake: every gain-param method call is captured in order ----

type Method = 'setValueAtTime' | 'linearRampToValueAtTime' | 'cancelScheduledValues' | 'setTargetAtTime';
export interface ParamCall {
  nodeIndex: number;
  method: Method;
  value: number;
  time: number;
}

class FakeParam {
  value = 1;
  constructor(
    private readonly nodeIndex: number,
    private readonly sink: ParamCall[],
  ) {}
  private rec(method: Method, value: number, time: number): void {
    this.sink.push({ nodeIndex: this.nodeIndex, method, value, time });
  }
  setValueAtTime(v: number, t: number): void {
    this.value = v;
    this.rec('setValueAtTime', v, t);
  }
  linearRampToValueAtTime(v: number, t: number): void {
    this.rec('linearRampToValueAtTime', v, t);
  }
  cancelScheduledValues(t: number): void {
    this.rec('cancelScheduledValues', 0, t);
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setTargetAtTime(v: number, t: number, _tau: number): void {
    this.value = v;
    this.rec('setTargetAtTime', v, t);
  }
}

function makeRecordingCtx() {
  const allCalls: ParamCall[] = [];
  let nodeIndex = 0;
  const makeNode = (kind: string, withGain: boolean): Record<string, unknown> => {
    const idx = nodeIndex++;
    const node: Record<string, unknown> = { kind, nodeIndex: idx };
    if (withGain) {
      node.gain = new FakeParam(idx, allCalls);
    }
    node.connect = (dest: unknown): unknown => dest;
    node.disconnect = (): void => {};
    node.start = (): void => {};
    node.stop = (): void => {};
    let ended: (() => void) | null = null;
    Object.defineProperty(node, 'onended', {
      set: (fn: (() => void) | null): void => {
        ended = fn;
      },
      get: (): (() => void) | null => ended,
    });
    return node;
  };
  const ctx = {
    currentTime: 5,
    destination: {},
    createBufferSource: (): Record<string, unknown> => makeNode('source', false),
    createGain: (): Record<string, unknown> => makeNode('gain', true),
    createChannelSplitter: (): Record<string, unknown> => makeNode('splitter', false),
    createChannelMerger: (): Record<string, unknown> => makeNode('merger', false),
    createBuffer: (ch: number, len: number): unknown => ({
      getChannelData: (c: number): Float32Array => new Float32Array(len).fill(c === 0 ? 0.5 : -0.5),
      channels: ch,
    }),
  };
  return { ctx, calls: allCalls, nodeIndex: (): number => nodeIndex };
}

function clipTrack(opts: {
  automation?: Record<string, AutomationCurve>;
  gain?: number;
  pan?: number;
}): ClipPlaybackTrack {
  const asset = {
    id: 'a1',
    sampleRate: SR,
    channels: [new Float32Array(SR).fill(0.5), new Float32Array(SR).fill(-0.5)],
  };
  return {
    clips: [{ id: 'c1', assetId: 'a1', start: 0, offset: 0, duration: SR }],
    assets: new Map([['a1', asset]]),
    gain: opts.gain ?? 1,
    pan: opts.pan ?? 0,
    mute: false,
    solo: false,
    automation: opts.automation,
  };
}

describe('A3 — startClips leg automation', () => {
  test('no curves → zero param scheduling calls (existing behavior untouched)', () => {
    const f = makeRecordingCtx();
    const pb = new ProjectPlayback(f.ctx as never, SR);
    pb.startClips([clipTrack({})]);
    expect(f.calls).toHaveLength(0);
  });

  test('volume curve stamps setValueAtTime anchor + linearRamp knots on both legs', () => {
    const f = makeRecordingCtx();
    const pb = new ProjectPlayback(f.ctx as never, SR);
    pb.startClips([
      clipTrack({
        automation: {
          volume: [
            { at: 0, value: 0 },
            { at: SR, value: 1 },
          ],
        },
      }),
    ]);
    // ctx.currentTime = 5, passStart = 0 → knot at timeline s lands at 5 + s/SR
    // per leg: cancel(fresh param no-op but uniform) + anchor + ramp
    const lCalls = f.calls.filter((c) => c.nodeIndex === 1);
    const rCalls = f.calls.filter((c) => c.nodeIndex === 2);
    expect(f.calls).toHaveLength(6); // 2 legs × (cancel + anchor + ramp)
    for (const leg of [lCalls, rCalls]) {
      expect(leg[0]).toMatchObject({ method: 'cancelScheduledValues', time: 5 });
      expect(leg[1]).toMatchObject({ method: 'setValueAtTime', value: 0, time: 5 });
      expect(leg[2]).toMatchObject({ method: 'linearRampToValueAtTime', value: 1, time: 6 });
    }
  });

  test('knots map sample domain → ctx time exactly (midpoint at SR/2 → +0.5 s)', () => {
    const f = makeRecordingCtx();
    const pb = new ProjectPlayback(f.ctx as never, SR);
    pb.startClips([
      clipTrack({
        automation: {
          volume: [
            { at: 0, value: 1 },
            { at: SR / 2, value: 0.5 },
            { at: SR, value: 1 },
          ],
        },
      }),
    ]);
    const l = f.calls.filter((c) => c.nodeIndex === 1);
    expect(l.map((c) => c.time)).toEqual([5, 5, 5.5, 6]);
    expect(l.map((c) => c.method)).toEqual([
      'cancelScheduledValues',
      'setValueAtTime',
      'linearRampToValueAtTime',
      'linearRampToValueAtTime',
    ]);
    expect(l[2]!.value).toBeCloseTo(0.5, 12);
  });

  test('knots beyond the pass end are not scheduled; value holds after last knot', () => {
    const f = makeRecordingCtx();
    const pb = new ProjectPlayback(f.ctx as never, SR);
    pb.startClips([
      clipTrack({
        automation: {
          volume: [
            { at: 0, value: 1 },
            { at: SR / 2, value: 0 },
            { at: SR * 4, value: 1 }, // beyond the 1 s pass — ignored
          ],
        },
      }),
    ]);
    const l = f.calls.filter((c) => c.nodeIndex === 1);
    expect(l).toHaveLength(3); // cancel + anchor + ramp at 5.5 only
    expect(l[2]).toMatchObject({ method: 'linearRampToValueAtTime', value: 0, time: 5.5 });
  });

  test('pan curve hard-L: right leg ramps to EXACT zero, left to law value', () => {
    const f = makeRecordingCtx();
    const pb = new ProjectPlayback(f.ctx as never, SR);
    pb.startClips([clipTrack({ automation: { pan: [{ at: 0, value: -1 }] } })]);
    const l = f.calls.filter((c) => c.nodeIndex === 1);
    const r = f.calls.filter((c) => c.nodeIndex === 2);
    expect(l[1]).toMatchObject({ method: 'setValueAtTime', value: 1 }); // gl(−1) = 1
    expect(r[1]).toMatchObject({ method: 'setValueAtTime', value: 0 }); // gr(−1) = 0 EXACT
  });

  test('pan sweep −1→1 follows the balance law on both legs', () => {
    const f = makeRecordingCtx();
    const pb = new ProjectPlayback(f.ctx as never, SR);
    pb.startClips([
      clipTrack({
        automation: {
          pan: [
            { at: 0, value: -1 },
            { at: SR, value: 1 },
          ],
        },
      }),
    ]);
    const l = f.calls.filter((c) => c.nodeIndex === 1);
    const r = f.calls.filter((c) => c.nodeIndex === 2);
    expect(l[1]!.value).toBe(1); // gl(−1) = 1
    expect(l[2]!.value).toBe(0); // gl(1) = 1 − 1 = 0 (hard R kills the LEFT leg)
    expect(r[1]!.value).toBe(0); // gr(−1) = 0
    expect(r[2]!.value).toBe(1); // gr(1) = 1
  });

  test('volume × pan curves compose: knots merged, leg value = law × curve', () => {
    const f = makeRecordingCtx();
    const pb = new ProjectPlayback(f.ctx as never, SR);
    pb.startClips([
      clipTrack({
        automation: {
          volume: [
            { at: 0, value: 0.5 },
            { at: SR, value: 1 },
          ],
          pan: [{ at: 0, value: -1 }], // hard L
        },
      }),
    ]);
    const l = f.calls.filter((c) => c.nodeIndex === 1);
    const r = f.calls.filter((c) => c.nodeIndex === 2);
    // L: gl = 1 · vol 0.5 → 1 ; R: gr = 0 · vol — exactly 0 at both knots
    expect(l.slice(1).map((c) => c.value)).toEqual([0.5, 1]);
    expect(r.slice(1).map((c) => c.value)).toEqual([0, 0]);
  });

  test('loop restart re-stamps legs: cancel + re-anchor at the loop start', () => {
    const f = makeRecordingCtx();
    const pb = new ProjectPlayback(f.ctx as never, SR);
    pb.startClips(
      [
        clipTrack({
          automation: {
            volume: [
              { at: 0, value: 0 },
              { at: SR, value: 1 },
            ],
          },
        }),
      ],
      { loop: { start: 0, end: 1 } },
    );
    const l = f.calls.filter((c) => c.nodeIndex === 1);
    expect(l).toHaveLength(3); // first pass: cancel + anchor + ramp

    // fire the pass-end → next pass re-stamps (cancel + anchor + ramp)
    const pbAny = pb as unknown as { handlePassEnded: () => void };
    f.ctx.currentTime = 6;
    pbAny.handlePassEnded();
    const l2 = f.calls.filter((c) => c.nodeIndex === 1).slice(3);
    expect(l2[0]).toMatchObject({ method: 'cancelScheduledValues', time: 6 });
    expect(l2[1]).toMatchObject({ method: 'setValueAtTime', value: 0, time: 6 }); // eval(loop.start = 0)
    expect(l2[2]).toMatchObject({ method: 'linearRampToValueAtTime', value: 1, time: 7 });
  });

  test('updateMix does not fight active automation (skips automated legs)', () => {
    const f = makeRecordingCtx();
    const pb = new ProjectPlayback(f.ctx as never, SR);
    const track = clipTrack({ automation: { volume: [{ at: 0, value: 1 }] } });
    pb.startClips([track]);
    const before = f.calls.length;
    pb.updateMix([track]); // the automation-carrying view, as playbackViews() passes it
    expect(f.calls.length).toBe(before); // automation owns the legs until restart
  });

  test('updateMix still ramps legs of tracks WITHOUT automation', () => {
    const f = makeRecordingCtx();
    const pb = new ProjectPlayback(f.ctx as never, SR);
    pb.startClips([clipTrack({}), clipTrack({ gain: 1, pan: 0 })]);
    const before = f.calls.length;
    pb.updateMix([
      { gain: 0.1, pan: 0, mute: false, solo: false },
      { gain: 0.2, pan: 0, mute: false, solo: false },
    ]);
    const after = f.calls.slice(before);
    expect(after.filter((c) => c.method === 'setTargetAtTime')).toHaveLength(4); // 2 tracks × L/R
  });
});
