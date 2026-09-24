import { describe, expect, test } from 'vitest';
import { mulTable, type AutomationCurve } from '../../src/engine/automation';
import {
  chorusProcess,
  flangerProcess,
  phaserProcess,
  tremoloProcess,
  vibratoProcess,
  type ChorusParams,
  type FlangerParams,
  type PhaserParams,
  type TremoloParams,
  type VibratoParams,
} from '../../src/fx/modulation';
import {
  chorusProcessSwept,
  flangerProcessSwept,
  phaserProcessSwept,
  tremoloProcessSwept,
  vibratoProcessSwept,
} from '../../src/fx/modulationCurves';

const SR = 44100;
const TAU = 2 * Math.PI;
const LUT_N = 4096;
const COS_LUT = new Float64Array(LUT_N);
for (let k = 0; k < LUT_N; ++k) COS_LUT[k] = Math.cos((TAU * k) / LUT_N);
function lutCos(phaseRad: number): number {
  let pos = (phaseRad / TAU) % 1;
  if (pos < 0) pos += 1;
  const f = pos * LUT_N;
  const i0 = f | 0;
  const t = f - i0;
  const a = COS_LUT[i0] ?? 0;
  const b = COS_LUT[(i0 + 1) % LUT_N] ?? 0;
  return a + (b - a) * t;
}
function readCatmull(src: Float32Array, p: number): number {
  const i0 = Math.floor(p);
  const t = p - i0;
  const s0 = i0 - 1 >= 0 ? (src[i0 - 1] ?? 0) : 0;
  const s1 = i0 >= 0 && i0 < src.length ? (src[i0] ?? 0) : 0;
  const s2 = i0 + 1 < src.length ? (src[i0 + 1] ?? 0) : 0;
  const s3 = i0 + 2 < src.length ? (src[i0 + 2] ?? 0) : 0;
  const a1 = 0.5 * (s2 - s0);
  const a2 = s0 - 2.5 * s1 + 2 * s2 - 0.5 * s3;
  const a3 = 0.5 * (s3 - s0) + 1.5 * (s1 - s2);
  return ((a3 * t + a2) * t + a1) * t + s1;
}

function noise(n: number, seed = 12345): Float32Array {
  let s = seed;
  const out = new Float32Array(n);
  for (let i = 0; i < n; ++i) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out[i] = (s / 0x3fffffff - 1) * 0.5;
  }
  return out;
}
const curve = (from: number, to: number, n: number): AutomationCurve => [
  { at: 0, value: from },
  { at: n - 1, value: to },
];
const CH: ChorusParams = { baseMs: 20, depthMs: 4, rateHz: 0.8, mix: 0.5 };
const FL: FlangerParams = { baseMs: 2, depthMs: 4, rateHz: 0.15, feedback: 0.6, mix: 0.5 };
const PH: PhaserParams = { stages: 6, rateHz: 0.5, centerHz: 800, feedback: 0.6, mix: 0.5 };
const TR: TremoloParams = { rateHz: 5, depth: 0.5, shape: 0 };
const VI: VibratoParams = { rateHz: 2, depthMs: 3 };

// ---- per-sample references (verbatim static loops, table-driven values) ----

function refChorus(ch: Float32Array, p: ChorusParams, t: { base?: Float64Array; depth?: Float64Array; mix?: Float64Array }, offset = 0): Float32Array {
  const w = (TAU * p.rateHz) / SR;
  const phases = CHORUS_PHASES;
  const out = new Float32Array(ch.length);
  for (let i = 0; i < ch.length; ++i) {
    const abs = offset + i;
    const base = t.base ? (t.base[i]! * SR) / 1000 : (p.baseMs * SR) / 1000;
    const depth = t.depth ? (t.depth[i]! * SR) / 1000 : (p.depthMs * SR) / 1000;
    const mix = t.mix ? t.mix[i]! : p.mix;
    let acc = 0;
    for (let v = 0; v < 3; ++v) {
      const d = base + depth * (0.5 - 0.5 * lutCos(w * abs + (phases[v] ?? 0)));
      acc += readCatmull(ch, i - d);
    }
    out[i] = (ch[i] ?? 0) * (1 - mix) + (acc / 3) * mix;
  }
  return out;
}
const CHORUS_PHASES = [0, TAU / 3, (2 * TAU) / 3];

function refFlanger(ch: Float32Array, p: FlangerParams, t: { depth?: Float64Array; feedback?: Float64Array; mix?: Float64Array }): Float32Array {
  const base = (p.baseMs * SR) / 1000;
  const w = (TAU * p.rateHz) / SR;
  const buf = new Float32Array(ch.length);
  const out = new Float32Array(ch.length);
  for (let i = 0; i < ch.length; ++i) {
    const depth = t.depth ? (t.depth[i]! * SR) / 1000 : (p.depthMs * SR) / 1000;
    const fb = t.feedback ? t.feedback[i]! : p.feedback;
    const mix = t.mix ? t.mix[i]! : p.mix;
    const d = base + depth * (0.5 - 0.5 * lutCos(w * i));
    const y = readCatmull(buf, i - d);
    buf[i] = (ch[i] ?? 0) + fb * y;
    out[i] = (ch[i] ?? 0) * (1 - mix) + y * mix;
  }
  return out;
}

function refPhaser(ch: Float32Array, p: PhaserParams, t: { center?: Float64Array; feedback?: Float64Array; mix?: Float64Array }): Float32Array {
  const K = Math.max(2, Math.min(8, Math.round(p.stages)));
  const w = (TAU * p.rateHz) / SR;
  const s1 = new Float64Array(K);
  const s2 = new Float64Array(K);
  const out = new Float32Array(ch.length);
  let yPrev = 0;
  for (let i = 0; i < ch.length; ++i) {
    const center = t.center ? t.center[i]! : p.centerHz;
    const fb = t.feedback ? t.feedback[i]! : p.feedback;
    const mix = t.mix ? t.mix[i]! : p.mix;
    const sweep = 0.5 - 0.5 * lutCos(w * i);
    const x = ch[i] ?? 0;
    let v = x + fb * yPrev;
    let y = v;
    for (let k = 0; k < K; ++k) {
      const spread = K === 1 ? 0 : (k / (K - 1)) * 2 - 1;
      const f = Math.max(20, Math.min(20000, center * Math.pow(2, spread * sweep)));
      const w0 = Math.min(Math.PI * 0.999, (TAU * f) / SR);
      const cw = Math.cos(w0);
      const alpha = Math.sin(w0) / 2;
      const a0 = 1 + alpha;
      const b0 = (1 - alpha) / a0;
      const b1 = (-2 * cw) / a0;
      const a1 = b1;
      const a2 = (1 - alpha) / a0;
      const yi = b0 * v + s1[k]!;
      s1[k] = b1 * v - a1 * yi + s2[k]!;
      s2[k] = 1 * v - a2 * yi;
      y = yi;
      v = yi;
    }
    yPrev = y;
    out[i] = x * (1 - mix) + y * mix;
  }
  return out;
}

describe('A6d — chorus curves', () => {
  test('constant curves == chorusProcess BIT-FOR-BIT (baseMs/depthMs/mix)', () => {
    const ch = [noise(256)];
    const staticOut = chorusProcess(ch, SR, CH)[0]!;
    const swept = chorusProcessSwept(ch, SR, CH, {
      baseMs: [{ at: 0, value: 20 }],
      depthMs: [
        { at: 0, value: 4 },
        { at: 255, value: 4 },
      ],
      mix: [{ at: 0, value: 0.5 }],
    })[0]!;
    expect(swept).toEqual(staticOut);
  });

  test('depth sweep matches the per-sample reference exactly', () => {
    const ch = [noise(300)];
    const c = curve(0, 15, 300);
    const out = chorusProcessSwept(ch, SR, CH, { depthMs: c })[0]!;
    expect(out).toEqual(refChorus(ch[0]!, CH, { depth: mulTable(c, 300) }));
  });

  test('mix sweep matches the reference; offset continuity holds', () => {
    const ch = [noise(200)];
    const c = curve(0, 1, 200);
    const out = chorusProcessSwept(ch, SR, CH, { mix: c }, 5)[0]!;
    expect(out).toEqual(refChorus(ch[0]!, CH, { mix: mulTable(c, 200) }, 5));
  });

  test('rateHz curve is IGNORED (LFO time-base stays static)', () => {
    const ch = [noise(128)];
    const staticOut = chorusProcess(ch, SR, CH)[0]!;
    const out = chorusProcessSwept(ch, SR, CH, { rateHz: curve(0.05, 5, 128) })[0]!;
    expect(out).toEqual(staticOut);
  });

  test('physics: mix 0 → 1 sweeps from exact passthrough to full wet', () => {
    const ch = [noise(600)];
    // hold dry for the first half, then sweep — the head is EXACTLY passthrough
    const hold: AutomationCurve = [
      { at: 0, value: 0 },
      { at: 300, value: 0 },
      { at: 599, value: 1 },
    ];
    const out = chorusProcessSwept(ch, SR, CH, { mix: hold })[0]!;
    // head: mix=0 → dry=1 → EXACT passthrough
    for (let i = 0; i < 8; ++i) expect(out[i]).toBe(ch[0]![i]);
    // tail is the modulated wet path — must differ from passthrough
    let diff = 0;
    for (let i = 550; i < 600; ++i) if (out[i] !== ch[0]![i]) ++diff;
    expect(diff).toBeGreaterThan(40);
  });
});

describe('A6d — vibrato curves', () => {
  test('constant depth == vibratoProcess bit-for-bit; depth 0 → EXACT passthrough', () => {
    const ch = [noise(200)];
    const staticOut = vibratoProcess(ch, SR, VI)[0]!;
    const swept = vibratoProcessSwept(ch, SR, VI, { depthMs: [{ at: 0, value: 3 }] })[0]!;
    expect(swept).toEqual(staticOut);
    const zero = vibratoProcessSwept(ch, SR, VI, { depthMs: [{ at: 0, value: 0 }] })[0]!;
    expect(zero).toEqual(ch[0]); // d = 0 reads src[i] exactly
  });

  test('depth sweep matches the reference', () => {
    const ch = [noise(240)];
    const c = curve(0.2, 8, 240);
    const out = vibratoProcessSwept(ch, SR, VI, { depthMs: c })[0]!;
    expect(out).toEqual(
      (() => {
        const w = (TAU * VI.rateHz) / SR;
        const table = mulTable(c, 240);
        const ref = new Float32Array(240);
        for (let i = 0; i < 240; ++i) {
          const d = ((table[i]! * SR) / 1000) * (0.5 - 0.5 * lutCos(w * i));
          ref[i] = readCatmull(ch[0]!, i - d);
        }
        return ref;
      })(),
    );
  });
});

describe('A6d — tremolo curves', () => {
  test('constant depth == tremoloProcess bit-for-bit; shape curve ignored', () => {
    const ch = [noise(256)];
    const staticOut = tremoloProcess(ch, SR, TR)[0]!;
    const swept = tremoloProcessSwept(ch, SR, TR, { depth: [{ at: 0, value: 0.5 }] })[0]!;
    expect(swept).toEqual(staticOut);
    const ignored = tremoloProcessSwept(ch, SR, TR, { shape: curve(0, 1, 256) })[0]!;
    expect(ignored).toEqual(staticOut);
  });

  test('depth sweep matches the reference (sine LFO, absolute time)', () => {
    const ch = [noise(300)];
    const c = curve(0, 1, 300);
    const table = mulTable(c, 300);
    const w = (TAU * TR.rateHz) / SR;
    const ref = new Float32Array(300);
    for (let i = 0; i < 300; ++i) ref[i] = (ch[0]![i] ?? 0) * (1 - (table[i]! / 2) * (1 - lutCos(w * i)));
    expect(tremoloProcessSwept(ch, SR, TR, { depth: c })[0]).toEqual(ref);
  });

  test('physics: depth 0 → 1 grows the modulation depth (tail peak-to-peak)', () => {
    const tone = new Float32Array(600).fill(0.5);
    const out = tremoloProcessSwept([tone], SR, TR, { depth: curve(0, 1, 600) })[0]!;
    // head: depth=0 → out == tone exactly
    for (let i = 0; i < 4; ++i) expect(out[i]).toBe(0.5);
    // tail: depth=1 → gain ∈ [0.5, 1.5] → values leave 0.5
    let excursions = 0;
    for (let i = 500; i < 600; ++i) if (out[i] !== 0.5) ++excursions;
    expect(excursions).toBeGreaterThan(80);
  });
});

describe('A6d — flanger curves', () => {
  test('constant curves == flangerProcess BIT-FOR-BIT (baseMs/depthMs/feedback/mix)', () => {
    const ch = [noise(256)];
    const staticOut = flangerProcess(ch, SR, FL)[0]!;
    const swept = flangerProcessSwept(ch, SR, FL, {
      baseMs: [{ at: 0, value: 2 }],
      depthMs: [{ at: 0, value: 4 }],
      feedback: [{ at: 0, value: 0.6 }],
      mix: [{ at: 0, value: 0.5 }],
    })[0]!;
    expect(swept).toEqual(staticOut);
  });

  test('feedback sweep matches the stateful reference exactly', () => {
    const ch = [noise(300)];
    const c = curve(0, 0.9, 300);
    const out = flangerProcessSwept(ch, SR, FL, { feedback: c })[0]!;
    expect(out).toEqual(refFlanger(ch[0]!, FL, { feedback: mulTable(c, 300) }));
  });

  test('depth + mix sweeps match the reference', () => {
    const ch = [noise(240)];
    const dc = curve(0.5, 6, 240);
    const mc = curve(0, 1, 240);
    const out = flangerProcessSwept(ch, SR, FL, { depthMs: dc, mix: mc })[0]!;
    expect(out).toEqual(refFlanger(ch[0]!, FL, { depth: mulTable(dc, 240), mix: mulTable(mc, 240) }));
  });

  test('rateHz curve is IGNORED', () => {
    const ch = [noise(128)];
    const staticOut = flangerProcess(ch, SR, FL)[0]!;
    expect(flangerProcessSwept(ch, SR, FL, { rateHz: curve(0.05, 3, 128) })[0]).toEqual(staticOut);
  });
});

describe('A6d — phaser curves', () => {
  test('constant curves == phaserProcess BIT-FOR-BIT (centerHz/feedback/mix)', () => {
    const ch = [noise(256)];
    const staticOut = phaserProcess(ch, SR, PH)[0]!;
    const swept = phaserProcessSwept(ch, SR, PH, {
      centerHz: [{ at: 0, value: 800 }],
      feedback: [{ at: 0, value: 0.6 }],
      mix: [{ at: 0, value: 0.5 }],
    })[0]!;
    expect(swept).toEqual(staticOut);
  });

  test('centerHz + feedback sweeps match the reference', () => {
    const ch = [noise(300)];
    const cc = curve(200, 3000, 300);
    const fc = curve(0, 0.85, 300);
    const out = phaserProcessSwept(ch, SR, PH, { centerHz: cc, feedback: fc })[0]!;
    expect(out).toEqual(refPhaser(ch[0]!, PH, { center: mulTable(cc, 300), feedback: mulTable(fc, 300) }));
  });

  test('physics: mix 0 → 1 sweeps from exact passthrough into the all-pass sweep', () => {
    const ch = [noise(600)];
    const hold: AutomationCurve = [
      { at: 0, value: 0 },
      { at: 300, value: 0 },
      { at: 599, value: 1 },
    ];
    const out = phaserProcessSwept(ch, SR, PH, { mix: hold })[0]!;
    for (let i = 0; i < 8; ++i) expect(out[i]).toBe(ch[0]![i]);
    let diff = 0;
    for (let i = 550; i < 600; ++i) if (out[i] !== ch[0]![i]) ++diff;
    expect(diff).toBeGreaterThan(40);
  });
});

describe('A6d — reverb2 mix curves', () => {
  test('constant mix == reverb2Process BIT-FOR-BIT (synth IR, stereo)', async () => {
    const mod = await import('../../src/fx/reverb2');
    const ch = [noise(300), noise(300, 7)];
    const p = {
      type: 1 as 0 | 1 | 2 | 3,
      rt60Sec: 0.8,
      damping: 30,
      predelayMs: 20,
      mix: 0.25,
      seed: 1234,
    };
    const reverb2Process = mod.reverb2Process;
    const reverb2ProcessSwept = mod.reverb2ProcessSwept;
    const staticOut = reverb2Process(ch, SR, p);
    const swept = reverb2ProcessSwept(ch, SR, p, { mix: [{ at: 0, value: 0.25 }] });
    expect(swept).toEqual(staticOut);
  });

  test('mix 0 curve → EXACT passthrough; mix 1 → exact wet path', async () => {
    const mod = await import('../../src/fx/reverb2');
    const ch = [noise(300)];
    const p = {
      type: 0 as 0 | 1 | 2 | 3,
      rt60Sec: 0.5,
      damping: 30,
      predelayMs: 0,
      mix: 0.25,
      seed: 99,
    };
    const zero = mod.reverb2ProcessSwept(ch, SR, p, { mix: [{ at: 0, value: 0 }] })[0]!;
    expect(zero).toEqual(ch[0]);
    const one = mod.reverb2ProcessSwept(ch, SR, p, { mix: [{ at: 0, value: 1 }] })[0]!;
    const wet = mod.reverb2Process(ch, SR, { ...p, mix: 1 })[0]!;
    expect(one).toEqual(wet);
  });

  test('no curves → static path', async () => {
    const mod = await import('../../src/fx/reverb2');
    const ch = [noise(200)];
    const p = {
      type: 2 as 0 | 1 | 2 | 3,
      rt60Sec: 1.2,
      damping: 50,
      predelayMs: 10,
      mix: 0.3,
      seed: 7,
    };
    const reverb2Process = mod.reverb2Process;
    const reverb2ProcessSwept = mod.reverb2ProcessSwept;
    expect(reverb2ProcessSwept(ch, SR, p, {})).toEqual(reverb2Process(ch, SR, p));
  });
});

describe('A6d — plumbing', () => {
  test('no curves → all five swept functions equal the static path', () => {
    const ch = [noise(120)];
    expect(chorusProcessSwept(ch, SR, CH, {})[0]).toEqual(chorusProcess(ch, SR, CH)[0]);
    expect(vibratoProcessSwept(ch, SR, VI, {})[0]).toEqual(vibratoProcess(ch, SR, VI)[0]);
    expect(tremoloProcessSwept(ch, SR, TR, {})[0]).toEqual(tremoloProcess(ch, SR, TR)[0]);
    expect(flangerProcessSwept(ch, SR, FL, {})[0]).toEqual(flangerProcess(ch, SR, FL)[0]);
    expect(phaserProcessSwept(ch, SR, PH, {})[0]).toEqual(phaserProcess(ch, SR, PH)[0]);
  });

  test('defs route paramCurves for all five modulation effects (absent → static)', async () => {
    const { EFFECT_DEFS } = await import('../../src/fx/defs');
    const ch = [noise(200)];
    const dc = curve(0.5, 12, 200);

    const chorus = EFFECT_DEFS.find((d) => d.id === 'fx.chorus');
    expect(chorus && chorus.kind === 'kernel').toBe(true);
    const chParams = { baseMs: 20, depthMs: 4, rateHz: 0.8, mix: 0.5 };
    expect(chorus!.kind === 'kernel' && chorus!.process(ch, SR, chParams, { paramCurves: { depthMs: dc } })[0]).toEqual(
      chorusProcessSwept(ch, SR, CH, { depthMs: dc })[0],
    );
    expect(chorus!.kind === 'kernel' && chorus!.process(ch, SR, chParams)[0]).toEqual(chorusProcess(ch, SR, CH)[0]);

    const fl = EFFECT_DEFS.find((d) => d.id === 'fx.flanger');
    const flParams = { baseMs: 2, depthMs: 4, rateHz: 0.15, feedback: 0.6, mix: 0.5 };
    expect(fl!.kind === 'kernel' && fl!.process(ch, SR, flParams, { paramCurves: { feedback: curve(0, 0.9, 200) } })[0]).toEqual(
      flangerProcessSwept(ch, SR, FL, { feedback: curve(0, 0.9, 200) })[0],
    );

    const ph = EFFECT_DEFS.find((d) => d.id === 'fx.phaser');
    const phParams = { stages: 6, rateHz: 0.5, centerHz: 800, feedback: 0.6, mix: 0.5 };
    expect(ph!.kind === 'kernel' && ph!.process(ch, SR, phParams, { paramCurves: { centerHz: curve(200, 3000, 200) } })[0]).toEqual(
      phaserProcessSwept(ch, SR, PH, { centerHz: curve(200, 3000, 200) })[0],
    );

    const tr = EFFECT_DEFS.find((d) => d.id === 'fx.tremolo');
    const trParams = { rateHz: 5, depth: 0.5, shape: 0 };
    expect(tr!.kind === 'kernel' && tr!.process(ch, SR, trParams, { paramCurves: { depth: curve(0, 1, 200) } })[0]).toEqual(
      tremoloProcessSwept(ch, SR, TR, { depth: curve(0, 1, 200) })[0],
    );

    const vi = EFFECT_DEFS.find((d) => d.id === 'fx.vibrato');
    const viParams = { rateHz: 2, depthMs: 3 };
    expect(vi!.kind === 'kernel' && vi!.process(ch, SR, viParams, { paramCurves: { depthMs: curve(0.2, 8, 200) } })[0]).toEqual(
      vibratoProcessSwept(ch, SR, VI, { depthMs: curve(0.2, 8, 200) })[0],
    );
  });
});
