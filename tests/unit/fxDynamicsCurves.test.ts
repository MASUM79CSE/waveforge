import { describe, expect, test } from 'vitest';
import { mulTable, type AutomationCurve } from '../../src/engine/automation';
import { compressKernel, compressKernelSwept, compressorGainDb, type CompressorParams } from '../../src/fx/compressor';
import { noiseGate, noiseGateSwept, type GateParams } from '../../src/fx/gate';
import { truePeakLimit, truePeakLimitSwept, type LimitParams } from '../../src/fx/mastering';

const SR = 44100;

function noise(n: number, seed = 12345): Float32Array {
  let s = seed;
  const out = new Float32Array(n);
  for (let i = 0; i < n; ++i) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out[i] = (s / 0x3fffffff - 1) * 0.5;
  }
  return out;
}

const COMP: CompressorParams = {
  thresholdDb: -24,
  ratio: 4,
  kneeDb: 6,
  attackMs: 10,
  releaseMs: 150,
  makeupDb: 0,
};
const GATE: GateParams = { thresholdDb: -50, ratio: 2.5, attackMs: 5, releaseMs: 100 };
const LIMIT: LimitParams = { ceilingDb: -1, lookaheadMs: 5, releaseMs: 60 };

const rms = (a: Float32Array, from: number, to: number): number => {
  let sum = 0;
  for (let i = from; i < to; ++i) sum += a[i]! * a[i]!;
  return Math.sqrt(sum / (to - from));
};

/** Test-local compressor reference: per-sample values from tables. */
function refCompress(
  ch: Float32Array,
  p: CompressorParams,
  t: { threshold?: Float64Array; ratio?: Float64Array; knee?: Float64Array; makeup?: Float64Array },
): Float32Array {
  const window = Math.max(1, Math.round(SR * 0.010));
  const attackCoef = p.attackMs <= 0 ? 1 : 1 - Math.exp(-1 / Math.max(1e-4, (SR * p.attackMs) / 1000));
  const releaseCoef = 1 - Math.exp(-1 / Math.max(1e-4, (SR * p.releaseMs) / 1000));
  const out = new Float32Array(ch.length);
  let sum = 0;
  let gr = 0;
  for (let i = 0; i < ch.length; ++i) {
    const v = ch[i] ?? 0;
    sum += v * v;
    if (i >= window) sum -= (ch[i - window] ?? 0) ** 2;
    const count = Math.min(i + 1, window);
    const levelDb = 10 * Math.log10(Math.max(sum / count, 1e-12));
    const thr = t.threshold ? t.threshold[i]! : p.thresholdDb;
    const rat = t.ratio ? t.ratio[i]! : p.ratio;
    const knee = t.knee ? t.knee[i]! : p.kneeDb;
    const target = compressorGainDb(levelDb, thr, rat, knee);
    const coef = target >= gr ? attackCoef : releaseCoef;
    gr += (target - gr) * coef;
    const makeup = t.makeup ? Math.pow(10, t.makeup[i]! / 20) : Math.pow(10, p.makeupDb / 20);
    out[i] = v * Math.pow(10, -gr / 20) * makeup;
  }
  return out;
}

/** Test-local gate reference: per-sample threshold/ratio. */
function refGate(ch: Float32Array, p: GateParams, t: { threshold?: Float64Array; ratio?: Float64Array }): Float32Array {
  const len = ch.length;
  const attackCoef = 1 - Math.exp(-1 / Math.max(1e-4, (SR * p.attackMs) / 1000));
  const releaseCoef = 1 - Math.exp(-1 / Math.max(1e-4, (SR * p.releaseMs) / 1000));
  const gains = new Float32Array(len); // the kernel f32-rounds g per sample
  let env = 0;
  let g = 0;
  for (let i = 0; i < len; ++i) {
    const peak = Math.abs(ch[i] ?? 0);
    const coef = peak > env ? attackCoef : releaseCoef;
    env = coef * peak + (1 - coef) * env;
    const thr = t.threshold ? Math.pow(10, t.threshold[i]! / 20) : Math.pow(10, p.thresholdDb / 20);
    const rat = t.ratio ? t.ratio[i]! : p.ratio;
    const target = env >= thr ? 1 : Math.pow(env / thr, rat);
    const gCoef = target > g ? attackCoef : releaseCoef;
    g = gCoef * target + (1 - gCoef) * g;
    gains[i] = g;
  }
  const out = new Float32Array(len);
  for (let i = 0; i < len; ++i) out[i] = (ch[i] ?? 0) * (gains[i] ?? 0);
  return out;
}

const curve = (from: number, to: number, n: number): AutomationCurve => [
  { at: 0, value: from },
  { at: n - 1, value: to },
];

describe('A6c — compressor curves', () => {
  test('constant curves == compressKernel BIT-FOR-BIT (threshold/ratio/knee/makeup)', () => {
    const ch = [noise(256)];
    const staticOut = compressKernel(ch, SR, COMP)[0]!;
    const swept = compressKernelSwept(ch, SR, COMP, {
      thresholdDb: [{ at: 0, value: -24 }],
      ratio: [
        { at: 0, value: 4 },
        { at: 255, value: 4 },
      ],
      kneeDb: [{ at: 0, value: 6 }],
      makeupDb: [{ at: 0, value: 0 }],
    })[0]!;
    expect(swept).toEqual(staticOut);
  });

  test('threshold sweep matches the per-sample reference exactly', () => {
    const ch = [noise(300)];
    const c = curve(0, -36, 300); // open → compressing hard
    const out = compressKernelSwept(ch, SR, COMP, { thresholdDb: c })[0]!;
    expect(out).toEqual(refCompress(ch[0]!, COMP, { threshold: mulTable(c, 300) }));
  });

  test('ratio sweep matches the reference (ratio → 1 releases control)', () => {
    const ch = [noise(200)];
    const c = curve(4, 1, 200);
    const out = compressKernelSwept(ch, SR, COMP, { ratio: c })[0]!;
    expect(out).toEqual(refCompress(ch[0]!, COMP, { ratio: mulTable(c, 200) }));
  });

  test('makeup sweep matches the reference', () => {
    const ch = [noise(150)];
    const c = curve(0, 12, 150);
    const out = compressKernelSwept(ch, SR, COMP, { makeupDb: c })[0]!;
    expect(out).toEqual(refCompress(ch[0]!, COMP, { makeup: mulTable(c, 150) }));
  });

  test('knee sweep matches the reference', () => {
    const ch = [noise(150)];
    const c = curve(24, 0, 150);
    const out = compressKernelSwept(ch, SR, COMP, { kneeDb: c })[0]!;
    expect(out).toEqual(refCompress(ch[0]!, COMP, { knee: mulTable(c, 150) }));
  });

  test('time-domain params (attackMs) are NOT sweepable — curve ignored, still static-exact', () => {
    const ch = [noise(128)];
    const staticOut = compressKernel(ch, SR, COMP)[0]!;
    const out = compressKernelSwept(ch, SR, COMP, { attackMs: curve(1, 50, 128) })[0]!;
    expect(out).toEqual(staticOut);
  });

  test('physics: threshold sweeping 0 → −36 compresses the tail', () => {
    const ch = [noise(600)];
    const out = compressKernelSwept(ch, SR, COMP, { thresholdDb: curve(0, -36, 600) })[0]!;
    // with makeup fixed at 0 dB, heavy GR later must pull the tail DOWN
    expect(rms(out, 450, 600)).toBeLessThan(rms(out, 0, 150) * 0.9);
  });
});

describe('A6c — gate curves', () => {
  test('constant curves == noiseGate BIT-FOR-BIT', () => {
    const ch = [noise(256)];
    const staticOut = noiseGate(ch, SR, GATE)[0]!;
    const swept = noiseGateSwept(ch, SR, GATE, {
      thresholdDb: [{ at: 0, value: -50 }],
      ratio: [{ at: 0, value: 2.5 }],
    })[0]!;
    expect(swept).toEqual(staticOut);
  });

  test('threshold + ratio sweeps match the per-sample reference', () => {
    const ch = [noise(200)];
    const tc = curve(-10, -80, 200);
    const rc = curve(1.5, 5, 200);
    const out = noiseGateSwept(ch, SR, GATE, { thresholdDb: tc, ratio: rc })[0]!;
    expect(out).toEqual(
      refGate(ch[0]!, GATE, { threshold: mulTable(tc, 200), ratio: mulTable(rc, 200) }),
    );
  });

  test('physics: threshold sweep closing over 1 s gates the quiet tail', () => {
    // peaks ≈ −58 dB; the linear-in-time threshold (−100 → −40 dB) rises
    // above the envelope ~30% in, and the 100 ms release has plenty of
    // runway before the measured tail window
    const quiet = noise(44100, 99).map((v) => v * 0.001);
    const out = noiseGateSwept([quiet], SR, GATE, { thresholdDb: curve(-100, -40, 44100) })[0]!;
    expect(rms(out, 38000, 44100)).toBeLessThan(rms(out, 0, 15000) * 0.2);
  });
});

describe('A6c — limiter curves (true-peak ceiling)', () => {
  test('constant ceiling == truePeakLimit BIT-FOR-BIT', () => {
    const ch = [noise(300)];
    const staticOut = truePeakLimit(ch, SR, LIMIT)[0]!;
    const swept = truePeakLimitSwept(ch, SR, LIMIT, { ceilingDb: [{ at: 0, value: -1 }] })[0]!;
    expect(swept).toEqual(staticOut);
  });

  test('physics: ceiling sweep 0 → −12 dB pulls the tail peak down', () => {
    const ch = [noise(600)];
    const out = truePeakLimitSwept(ch, SR, LIMIT, { ceilingDb: curve(0, -12, 600) })[0]!;
    let peakTail = 0;
    for (let i = 460; i < 600; ++i) peakTail = Math.max(peakTail, Math.abs(out[i] ?? 0));
    let peakHead = 0;
    for (let i = 0; i < 100; ++i) peakHead = Math.max(peakHead, Math.abs(out[i] ?? 0));
    expect(peakTail).toBeLessThan(peakHead * 0.6);
  });
});

describe('A6c — plumbing', () => {
  test('no curves → swept functions equal the static path', () => {
    const ch = [noise(100)];
    expect(compressKernelSwept(ch, SR, COMP, {})[0]).toEqual(compressKernel(ch, SR, COMP)[0]);
    expect(noiseGateSwept(ch, SR, GATE, {})[0]).toEqual(noiseGate(ch, SR, GATE)[0]);
    expect(truePeakLimitSwept(ch, SR, LIMIT, {})[0]).toEqual(truePeakLimit(ch, SR, LIMIT)[0]);
  });

  test('defs route paramCurves: compressor / limiter / gate (absent → static)', async () => {
    const { EFFECT_DEFS } = await import('../../src/fx/defs');
    const ch = [noise(200)];
    const tc = curve(0, -36, 200);

    const comp = EFFECT_DEFS.find((d) => d.id === 'fx.compressor');
    expect(comp && comp.kind === 'kernel').toBe(true);
    const compParams = { thresholdDb: -24, ratio: 4, kneeDb: 6, attackMs: 10, releaseMs: 150, makeupDb: 0 };
    expect(comp!.kind === 'kernel' && comp!.process(ch, SR, compParams, { paramCurves: { thresholdDb: tc } })[0]).toEqual(
      compressKernelSwept(ch, SR, COMP, { thresholdDb: tc })[0],
    );
    expect(comp!.kind === 'kernel' && comp!.process(ch, SR, compParams)[0]).toEqual(
      compressKernel(ch, SR, COMP)[0],
    );

    const lim = EFFECT_DEFS.find((d) => d.id === 'fx.limiter');
    const limParams = { ceilingDb: -1, lookaheadMs: 5, releaseMs: 60 };
    expect(lim!.kind === 'kernel' && lim!.process(ch, SR, limParams, { paramCurves: { ceilingDb: curve(0, -12, 200) } })[0]).toEqual(
      truePeakLimitSwept(ch, SR, LIMIT, { ceilingDb: curve(0, -12, 200) })[0],
    );

    const gate = EFFECT_DEFS.find((d) => d.id === 'fx.gate');
    const gateParams = { thresholdDb: -50, ratio: 2.5, attackMs: 5, releaseMs: 100 };
    expect(gate!.kind === 'kernel' && gate!.process(ch, SR, gateParams, { paramCurves: { thresholdDb: curve(-10, -80, 200) } })[0]).toEqual(
      noiseGateSwept(ch, SR, GATE, { thresholdDb: curve(-10, -80, 200) })[0],
    );
  });
});
