/**
 * A6d — swept modulation kernels (docs/automation-plan.md A6 addendum).
 * The static kernels in modulation.ts keep their absolute-time LFOs; these
 * variants add per-sample AUDIO-SHAPING curves. Scope rule (A6c, anchored):
 * the LFO time-base (rateHz) and structural params (shape, stages) are NOT
 * sweepable — curves under those keys are ignored. Constant curves are
 * BIT-IDENTICAL to the static path (same formulas, per-sample converts of
 * the same doubles); no curves → exactly the static function.
 */
import { fxTable } from './fxCurves';
import type { AutomationCurve } from '../engine/automation';
import {
  CHORUS_PHASES,
  CHORUS_PHASES_R,
  createDelayStates,
  createPhaserStates,
  chorusProcess,
  flangerProcess,
  lutCos,
  phaserProcess,
  readCatmull,
  tremoloProcess,
  vibratoProcess,
  type ChorusParams,
  type DelayState,
  type FlangerParams,
  type PhaserChannelState,
  type PhaserParams,
  type TremoloParams,
  type VibratoParams,
} from './modulation';

const TAU = 2 * Math.PI;

/** ms curve table converted to samples per call site. */
function msTable(
  curves: Record<string, AutomationCurve>,
  key: string,
  len: number,
  sampleRate: number,
): Float64Array | null {
  const t = fxTable(curves, key, len);
  if (!t) return null;
  const out = new Float64Array(len);
  for (let i = 0; i < len; ++i) out[i] = (t[i]! * sampleRate) / 1000;
  return out;
}

/** True when ANY of the given keys carries a non-empty curve. */
function hasCurves(curves: Record<string, AutomationCurve>, keys: string[]): boolean {
  return keys.some((k) => (curves[k]?.length ?? 0) > 0);
}

/**
 * Chorus with per-sample baseMs / depthMs / mix curves. rateHz is the LFO
 * TIME-BASE — deliberately not sweepable (curves under it ignored), matching
 * the A6c rule that time-base/detector params stay static.
 */
export function chorusProcessSwept(
  channels: Float32Array[],
  sampleRate: number,
  params: ChorusParams,
  curves: Record<string, AutomationCurve>,
  offset = 0,
): Float32Array[] {
  if (!hasCurves(curves, ['baseMs', 'depthMs', 'mix'])) return chorusProcess(channels, sampleRate, params, offset);
  const len = channels[0]?.length ?? 0;
  const base = msTable(curves, 'baseMs', len, sampleRate);
  const depth = msTable(curves, 'depthMs', len, sampleRate);
  const mix = fxTable(curves, 'mix', len);
  const w = (TAU * params.rateHz) / sampleRate;
  return channels.map((ch, c) => {
    const phases = c === 1 ? CHORUS_PHASES_R : CHORUS_PHASES;
    const out = new Float32Array(ch.length);
    for (let i = 0; i < ch.length; ++i) {
      const t = offset + i;
      const b = base ? base[i]! : (params.baseMs * sampleRate) / 1000;
      const d = depth ? depth[i]! : (params.depthMs * sampleRate) / 1000;
      const mx = mix ? mix[i]! : params.mix;
      let acc = 0;
      for (let v = 0; v < 3; ++v) {
        const del = b + d * (0.5 - 0.5 * lutCos(w * t + (phases[v] ?? 0)));
        acc += readCatmull(ch, i - del);
      }
      out[i] = (ch[i] ?? 0) * (1 - mx) + (acc / 3) * mx;
    }
    return out;
  });
}

/** Vibrato with a per-sample depthMs curve (rateHz stays static). */
export function vibratoProcessSwept(
  channels: Float32Array[],
  sampleRate: number,
  params: VibratoParams,
  curves: Record<string, AutomationCurve>,
  offset = 0,
): Float32Array[] {
  const len0 = channels[0]?.length ?? 0;
  const depth = msTable(curves, 'depthMs', len0, sampleRate);
  if (!hasCurves(curves, ['depthMs']) || !depth) return vibratoProcess(channels, sampleRate, params, offset);
  const w = (TAU * params.rateHz) / sampleRate;
  return channels.map((ch) => {
    const out = new Float32Array(ch.length);
    for (let i = 0; i < ch.length; ++i) {
      const d = depth[i]! * (0.5 - 0.5 * lutCos(w * (offset + i)));
      out[i] = readCatmull(ch, i - d);
    }
    return out;
  });
}

/**
 * Tremolo with a per-sample depth curve (rateHz and shape stay static —
 * shape is structural). depth 0 at a sample → bit-exact gain 1.
 */
export function tremoloProcessSwept(
  channels: Float32Array[],
  sampleRate: number,
  params: TremoloParams,
  curves: Record<string, AutomationCurve>,
  offset = 0,
): Float32Array[] {
  if (!hasCurves(curves, ['depth'])) return tremoloProcess(channels, sampleRate, params, offset);
  const len = channels[0]?.length ?? 0;
  const depth = fxTable(curves, 'depth', len);
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
      const dv = depth ? depth[i]! : d;
      out[i] = (ch[i] ?? 0) * (1 - (dv / 2) * (1 - lfo));
    }
    return out;
  });
}

/**
 * Flanger with per-sample baseMs / depthMs / feedback / mix curves (rateHz
 * time-base static). State handling mirrors flangerProcess — chunked runs
 * stitch bit-identically.
 */
export function flangerProcessSwept(
  channels: Float32Array[],
  sampleRate: number,
  params: FlangerParams,
  curves: Record<string, AutomationCurve>,
  states: DelayState[] = createDelayStates(channels.length),
): Float32Array[] {
  if (!hasCurves(curves, ['baseMs', 'depthMs', 'feedback', 'mix'])) {
    return flangerProcess(channels, sampleRate, params, states);
  }
  const len = channels[0]?.length ?? 0;
  const base = msTable(curves, 'baseMs', len, sampleRate);
  const depth = msTable(curves, 'depthMs', len, sampleRate);
  const feedback = fxTable(curves, 'feedback', len);
  const mix = fxTable(curves, 'mix', len);
  const w = (TAU * params.rateHz) / sampleRate;

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
      const b = base ? base[i]! : (params.baseMs * sampleRate) / 1000;
      const d = depth ? depth[i]! : (params.depthMs * sampleRate) / 1000;
      const del = b + d * (0.5 - 0.5 * lutCos(w * abs));
      const y = readCatmull(buf, abs - del);
      const fb = feedback ? feedback[i]! : params.feedback;
      const mx = mix ? mix[i]! : params.mix;
      buf[abs] = (ch[i] ?? 0) + fb * y;
      out[i] = (ch[i] ?? 0) * (1 - mx) + y * mx;
    }
    state.written = need;
    return out;
  });
}

/**
 * Phaser with per-sample centerHz / feedback / mix curves (rateHz and the
 * structural stage count stay static). Center curves move the sweep span;
 * the ±1 octave spread and APF coefficients recompute per sample exactly
 * like the static kernel. State handling mirrors phaserProcess.
 */
export function phaserProcessSwept(
  channels: Float32Array[],
  sampleRate: number,
  params: PhaserParams,
  curves: Record<string, AutomationCurve>,
  states: PhaserChannelState[] = createPhaserStates(channels.length, Math.round(params.stages)),
): Float32Array[] {
  if (!hasCurves(curves, ['centerHz', 'feedback', 'mix'])) {
    return phaserProcess(channels, sampleRate, params, states);
  }
  const len = channels[0]?.length ?? 0;
  const center = fxTable(curves, 'centerHz', len);
  const feedback = fxTable(curves, 'feedback', len);
  const mix = fxTable(curves, 'mix', len);
  const K = Math.max(2, Math.min(8, Math.round(params.stages)));
  const w = (TAU * params.rateHz) / sampleRate;

  return channels.map((ch, c) => {
    const state = states[c] ?? createPhaserStates(1, K)[0]!;
    const out = new Float32Array(ch.length);
    let yPrev = state.yPrev;
    for (let i = 0; i < ch.length; ++i) {
      const abs = i + state.written;
      const sweep = 0.5 - 0.5 * lutCos(w * abs); // 0..1
      const x = ch[i] ?? 0;
      const fb = feedback ? feedback[i]! : params.feedback;
      let v = x + fb * yPrev;
      let y = v;
      for (let k = 0; k < K; ++k) {
        const spread = K === 1 ? 0 : (k / (K - 1)) * 2 - 1;
        const c0 = center ? center[i]! : params.centerHz;
        const f = Math.max(20, Math.min(20000, c0 * Math.pow(2, spread * sweep)));
        const w0 = Math.min(Math.PI * 0.999, (TAU * f) / sampleRate);
        const cw = Math.cos(w0);
        const alpha = Math.sin(w0) / 2;
        const a0 = 1 + alpha;
        const b0 = (1 - alpha) / a0;
        const b1 = (-2 * cw) / a0;
        const a1 = b1;
        const a2 = (1 - alpha) / a0;
        const s1i = state.s1[k] ?? 0;
        const s2i = state.s2[k] ?? 0;
        const yi = b0 * v + s1i;
        state.s1[k] = b1 * v - a1 * yi + s2i;
        state.s2[k] = 1 * v - a2 * yi;
        y = yi;
        v = yi; // cascade
      }
      yPrev = y;
      const mx = mix ? mix[i]! : params.mix;
      out[i] = x * (1 - mx) + y * mx;
    }
    state.yPrev = yPrev;
    state.written = state.written + ch.length;
    return out;
  });
}
