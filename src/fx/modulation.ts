/**
 * E3 modulation kernels (effects v2 plan §E3, ADR 009): chorus, flanger,
 * phaser, tremolo, vibrato. Design rules:
 *  - every LFO is a function of ABSOLUTE sample time (no phase
 *    accumulators) — chunked processing reproduces one-shot bit-exactly;
 *  - delay reads use Catmull-Rom 4-tap interpolation (fractional delay
 *    accurate to ≪ 0.02 samples at audio frequencies);
 *  - the LFO cosine reads a 4096-entry table built once (deterministic
 *    across platforms, no Math.random anywhere);
 *  - feedback paths (flanger, phaser) carry explicit state so streaming
 *    (future worker route) is bit-identical to single-shot.
 * Pure — no AudioContext anywhere.
 */

const TAU = 2 * Math.PI;
const LUT_N = 4096;
const COS_LUT = new Float64Array(LUT_N);
for (let k = 0; k < LUT_N; ++k) COS_LUT[k] = Math.cos((TAU * k) / LUT_N);

/** Deterministic cosine via table lookup + linear interpolation. */
/** Exported for the swept variants (modulationCurves.ts) — same package contract. */
export function lutCos(phaseRad: number): number {
  let pos = (phaseRad / TAU) % 1;
  if (pos < 0) pos += 1;
  const f = pos * LUT_N;
  const i0 = f | 0;
  const t = f - i0;
  const a = COS_LUT[i0] ?? 0;
  const b = COS_LUT[(i0 + 1) % LUT_N] ?? 0;
  return a + (b - a) * t;
}

/** Catmull-Rom read at a fractional (possibly negative) position. */
/** Exported for the swept variants (modulationCurves.ts). */
export function readCatmull(src: Float32Array, p: number): number {
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

/** Stateless fractional delay: out[i] = src[i − delaySamples]. */
export function catmullDelay(sig: Float32Array, delaySamples: number): Float32Array {
  const out = new Float32Array(sig.length);
  for (let i = 0; i < sig.length; ++i) out[i] = readCatmull(sig, i - delaySamples);
  return out;
}

// ---- chorus ----

export interface ChorusParams {
  baseMs: number;
  depthMs: number;
  rateHz: number;
  mix: number;
}

/** Exported for the swept variants (modulationCurves.ts). */
export const CHORUS_PHASES = [0, TAU / 3, (2 * TAU) / 3];
/** Right-channel voice phases: 60° offset — a disjoint phase SET (a pure
 * permutation of the left set is FP-commutative and would cancel width). */
/** Exported for the swept variants (modulationCurves.ts). */
export const CHORUS_PHASES_R = [TAU / 6, TAU / 2, (5 * TAU) / 6];

/**
 * 3-voice chorus; voices share the LFO rate but sit 120° apart. The right
 * channel runs a 60°-offset phase set for decorrelated width. `offset` is
 * the absolute sample position of channels[0][0] (chunk continuity).
 */
export function chorusProcess(
  channels: Float32Array[],
  sampleRate: number,
  params: ChorusParams,
  offset = 0,
): Float32Array[] {
  const base = (params.baseMs * sampleRate) / 1000;
  const depth = (params.depthMs * sampleRate) / 1000;
  const w = (TAU * params.rateHz) / sampleRate;
  const dry = 1 - params.mix;
  return channels.map((ch, c) => {
    const phases = c === 1 ? CHORUS_PHASES_R : CHORUS_PHASES;
    const out = new Float32Array(ch.length);
    for (let i = 0; i < ch.length; ++i) {
      const t = offset + i;
      let acc = 0;
      for (let v = 0; v < 3; ++v) {
        const d = base + depth * (0.5 - 0.5 * lutCos(w * t + (phases[v] ?? 0)));
        acc += readCatmull(ch, i - d);
      }
      const wet = acc / 3;
      out[i] = (ch[i] ?? 0) * dry + wet * params.mix;
    }
    return out;
  });
}

// ---- vibrato ----

export interface VibratoParams {
  rateHz: number;
  depthMs: number;
}

/** Pure pitch modulation: the signal is read through a wobbling delay. */
export function vibratoProcess(
  channels: Float32Array[],
  sampleRate: number,
  params: VibratoParams,
  offset = 0,
): Float32Array[] {
  const depth = (params.depthMs * sampleRate) / 1000;
  const w = (TAU * params.rateHz) / sampleRate;
  return channels.map((ch) => {
    const out = new Float32Array(ch.length);
    for (let i = 0; i < ch.length; ++i) {
      const d = depth * (0.5 - 0.5 * lutCos(w * (offset + i)));
      out[i] = readCatmull(ch, i - d);
    }
    return out;
  });
}

// ---- tremolo ----

export interface TremoloParams {
  rateHz: number;
  depth: number;
  shape: number; // 0 = sine, 1 = triangle
}

/** Amplitude modulation: y = x·(1 − d/2·(1 − lfo)); depth 0 is bit-exact. */
export function tremoloProcess(
  channels: Float32Array[],
  sampleRate: number,
  params: TremoloParams,
  offset = 0,
): Float32Array[] {
  const w = (TAU * params.rateHz) / sampleRate;
  const d = params.depth;
  const triangle = params.shape >= 0.5;
  return channels.map((ch) => {
    const out = new Float32Array(ch.length);
    for (let i = 0; i < ch.length; ++i) {
      const phase = w * (offset + i);
      const lfo = triangle
        ? 4 * Math.abs((((phase / TAU) % 1) + 1) % 1 - 0.5) - 1
        : lutCos(phase);
      out[i] = (ch[i] ?? 0) * (1 - (d / 2) * (1 - lfo));
    }
    return out;
  });
}

// ---- flanger (feedback comb, stateful for streaming) ----

export interface FlangerParams {
  baseMs: number;
  depthMs: number;
  rateHz: number;
  feedback: number;
  mix: number;
}

/** Carried feedback signal; `written` marks the absolute fill position. */
export interface DelayState {
  buf: Float32Array;
  written: number;
}

export function createDelayStates(count: number): DelayState[] {
  return Array.from({ length: count }, () => ({ buf: new Float32Array(0), written: 0 }));
}

/**
 * y[i] reads the feedback line s = x + fb·y at i − d(i) (modulated read),
 * out = dry + mix·y. States carry the line across chunks: chunked runs
 * stitch bit-identically to one-shot.
 */
export function flangerProcess(
  channels: Float32Array[],
  sampleRate: number,
  params: FlangerParams,
  states: DelayState[] = createDelayStates(channels.length),
): Float32Array[] {
  const base = (params.baseMs * sampleRate) / 1000;
  const depth = (params.depthMs * sampleRate) / 1000;
  const w = (TAU * params.rateHz) / sampleRate;
  const dry = 1 - params.mix;

  return channels.map((ch, c) => {
    const state = states[c] ?? createDelayStates(1)[0]!;
    const from = state.written;
    const need = from + ch.length;
    if (state.buf.length < need) {
      const grown = new Float32Array(need);
      grown.set(state.buf, 0);
      state.buf = grown;
    }
    const buf = state.buf;
    const out = new Float32Array(ch.length);
    for (let i = 0; i < ch.length; ++i) {
      const abs = from + i;
      const d = base + depth * (0.5 - 0.5 * lutCos(w * abs));
      const y = readCatmull(buf, abs - d);
      buf[abs] = (ch[i] ?? 0) + params.feedback * y;
      out[i] = (ch[i] ?? 0) * dry + y * params.mix;
    }
    state.written = need;
    return out;
  });
}

// ---- phaser (all-pass chain, stateful for streaming) ----

export interface PhaserParams {
  stages: number;
  rateHz: number;
  centerHz: number;
  feedback: number;
  mix: number;
}

export interface PhaserChannelState {
  s1: Float64Array;
  s2: Float64Array;
  yPrev: number;
  /** Absolute sample position of the next input (chunk continuity). */
  written: number;
}

export function createPhaserStates(count: number, stages = 8): PhaserChannelState[] {
  return Array.from({ length: count }, () => ({
    s1: new Float64Array(stages),
    s2: new Float64Array(stages),
    yPrev: 0,
    written: 0,
  }));
}

/**
 * K cascaded all-pass sections (RBJ APF, α = sin(ω0)/2) whose centre
 * frequencies sweep ±1 octave around the centre, spread across stages.
 * Feedback is v = x + fb·yPrev (one-sample loop delay); chunked runs
 * stitch bit-identically through the carried states.
 */
export function phaserProcess(
  channels: Float32Array[],
  sampleRate: number,
  params: PhaserParams,
  states: PhaserChannelState[] = createPhaserStates(channels.length, Math.round(params.stages)),
): Float32Array[] {
  const K = Math.max(2, Math.min(8, Math.round(params.stages)));
  const w = (TAU * params.rateHz) / sampleRate;
  const dry = 1 - params.mix;

  return channels.map((ch, c) => {
    const state = states[c] ?? createPhaserStates(1, K)[0]!;
    const out = new Float32Array(ch.length);
    let yPrev = state.yPrev;
    for (let i = 0; i < ch.length; ++i) {
      const abs = i + state.written;
      const sweep = 0.5 - 0.5 * lutCos(w * abs); // 0..1
      const x = ch[i] ?? 0;
      let v = x + params.feedback * yPrev;
      let y = v;
      for (let k = 0; k < K; ++k) {
        // stages span −1..+1 octaves around the centre, swept together
        const spread = K === 1 ? 0 : (k / (K - 1)) * 2 - 1;
        const f = Math.max(20, Math.min(20000, params.centerHz * Math.pow(2, spread * sweep)));
        const w0 = Math.min(Math.PI * 0.999, (TAU * f) / sampleRate);
        const cw = Math.cos(w0);
        const alpha = Math.sin(w0) / 2;
        const a0 = 1 + alpha;
        // RBJ APF: b = [1−α, −2cos, 1+α], a = [1+α, −2cos, 1−α]
        const b0 = (1 - alpha) / a0;
        const b1 = (-2 * cw) / a0;
        const a1 = b1;
        const b2 = 1;
        const a2 = (1 - alpha) / a0;
        const s1i = state.s1[k] ?? 0;
        const s2i = state.s2[k] ?? 0;
        const yi = b0 * v + s1i;
        state.s1[k] = b1 * v - a1 * yi + s2i;
        state.s2[k] = b2 * v - a2 * yi;
        y = yi;
        v = yi; // cascade
      }
      yPrev = y;
      out[i] = x * dry + y * params.mix;
    }
    state.yPrev = yPrev;
    state.written = state.written + ch.length;
    return out;
  });
}

