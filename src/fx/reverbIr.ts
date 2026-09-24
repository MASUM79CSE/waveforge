/**
 * E4 seeded IR synthesis (effects v2 plan §E4): deterministic reverb
 * impulse responses that replace the legacy `curves.ts` noise IR.
 * Envelope g(n) = 10^(−3n/(RT60·Fs)) — exactly −60 dB at n = RT60·Fs —
 * carries the exponential decay for plate/room/hall tails. The spring
 * uses three PARALLEL feedback combs (series combs at equal T60 would
 * convolve into a t²·e^(−at) ramp and miss the ±5 % Schroeder gate);
 * each comb's per-iteration feedback is c = 10^(−3·D_sec/RT60) so a comb
 * with delay D individually decays to −60 dB at exactly RT60.
 * Determinism: mulberry32 integer PRNG only — no Math.random, no Gaussian
 * draws (Box–Muller trig is platform-variable; bit-identical IRs are a
 * verified contract).
 */

/** PRNG types: 0 plate, 1 room, 2 hall, 3 spring. */
export type ReverbType = 0 | 1 | 2 | 3;

export interface IrSpec {
  type: ReverbType;
  rt60Sec: number;
  /** 0–100 %, HF damping of the stochastic tail (one-pole k). */
  damping: number;
  seed: number;
}

export interface SynthesizedIr {
  channels: Float64Array[];
  /** Early-reflection tap positions in ms (room/hall; empty otherwise). */
  erTapTimesMs: number[];
  /** Comb delays in ms (spring; empty otherwise). */
  combDelaysMs: number[];
}

/** Deterministic 32-bit PRNG (integer-only state, uniform [0,1) output). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Exponential decay envelope: exactly −60 dB at n = RT60·Fs. */
export function envelopeGain(n: number, rt60Sec: number, sampleRate: number): number {
  return 10 ** ((-3 * n) / (rt60Sec * sampleRate));
}

/** One-pole HF damping coefficient from a 0–100 % damping amount. */
function dampingK(damping: number): number {
  return 1 - 0.98 * Math.min(1, Math.max(0, damping / 100));
}

/** Normalize total (cross-channel) L2 energy to 1 so wet loudness is
 * independent of RT60/type at mix time. */
function normalizeEnergy(channels: Float64Array[]): void {
  let energy = 0;
  for (const ch of channels) for (const v of ch) energy += v * v;
  if (energy <= 0) return;
  const scale = 1 / Math.sqrt(energy);
  for (const ch of channels) {
    for (let i = 0; i < ch.length; ++i) ch[i] = ch[i]! * scale;
  }
}

/** White stochastic tail × envelope, HF-damped, 5 ms diffusion ramp in. */
function stochasticTail(
  rt60Sec: number,
  damping: number,
  seed: number,
  sampleRate: number,
  numChannels: number,
): Float64Array[] {
  const n = Math.max(1, Math.round(rt60Sec * sampleRate));
  const k = dampingK(damping);
  const rampLen = Math.min(n, Math.round(0.005 * sampleRate));
  return Array.from({ length: numChannels }, (_, c) => {
    const rnd = mulberry32(seed + c * 7919 + 1);
    const ch = new Float64Array(n);
    let y = 0;
    for (let i = 0; i < n; ++i) {
      y += k * (rnd() * 2 - 1 - y);
      const ramp = i < rampLen ? i / rampLen : 1;
      ch[i] = y * envelopeGain(i, rt60Sec, sampleRate) * ramp;
    }
    return ch;
  });
}

/** Room/hall: seeded early-reflection taps (exponential density) over a
 * stochastic tail. Room: 8–16 taps in 5–35 ms; hall: 16–24 in 20–80 ms. */
function roomHall(
  spec: IrSpec,
  sampleRate: number,
  numChannels: number,
): { channels: Float64Array[]; erTapTimesMs: number[] } {
  const rnd = mulberry32(spec.seed + 17);
  const hall = spec.type === 2;
  const count = hall ? 16 + Math.floor(rnd() * 9) : 8 + Math.floor(rnd() * 9);
  const spanMs = hall ? 80 : 35;
  const minMs = hall ? 20 : 5;
  const meanMs = (spanMs - minMs) / (count + 1);
  const tapTimesMs: number[] = [];
  let t = minMs;
  for (let i = 0; i < count; ++i) {
    if (t > spanMs) break;
    tapTimesMs.push(t);
    t += Math.min(-Math.log(1 - rnd() * 0.999) * meanMs, spanMs / 5);
  }
  const channels = stochasticTail(
    spec.rt60Sec,
    spec.damping,
    spec.seed,
    sampleRate,
    numChannels,
  );
  channels.forEach((ch, c) => {
    const crnd = mulberry32(spec.seed + c * 7919 + 31);
    for (const ms of tapTimesMs) {
      const pos = Math.round((ms / 1000) * sampleRate);
      if (pos < ch.length) ch[pos] = (crnd() * 2 - 1) * Math.exp(-ms / (spanMs / 2));
    }
  });
  return { channels, erTapTimesMs: tapTimesMs };
}

/** Spring: three PARALLEL feedback combs (each individually decaying to
 * −60 dB at RT60) through two first-order all-passes (dispersion). */
function spring(
  spec: IrSpec,
  sampleRate: number,
  numChannels: number,
): { channels: Float64Array[]; combDelaysMs: number[] } {
  const n = Math.max(1, Math.round(spec.rt60Sec * sampleRate));
  const channels: Float64Array[] = [];
  let combDelaysMs: number[] = [];
  for (let chIdx = 0; chIdx < numChannels; ++chIdx) {
    const rnd = mulberry32(spec.seed + chIdx * 7919 + 53);
    combDelaysMs = [0, 1, 2].map(() => 3.5 + 5 * rnd());
    const dSamples = combDelaysMs.map((ms) => Math.max(1, Math.round((ms * sampleRate) / 1000)));
    const feedback = combDelaysMs.map((ms) => 10 ** ((-3 * (ms / 1000)) / spec.rt60Sec));
    const apA = [0.45 + 0.2 * rnd(), 0.45 + 0.2 * rnd()];
    const combs = dSamples.map((d) => new Float64Array(d));
    const out = new Float64Array(n);
    let apX1 = 0;
    let apY1 = 0;
    let apX2 = 0;
    let apY2 = 0;
    for (let i = 0; i < n; ++i) {
      const x = i === 0 ? 1 : 0;
      let acc = 0;
      for (let k = 0; k < 3; ++k) {
        const buf = combs[k]!;
        const d = dSamples[k]!;
        const head = buf[0] ?? 0;
        acc += 0.7 * head;
        for (let j = 0; j < d - 1; ++j) buf[j] = buf[j + 1]!;
        buf[d - 1] = x + feedback[k]! * head;
      }
      // first-order all-pass: y[n] = −a·x[n] + x[n−1] + a·y[n−1]
      const y1 = -apA[0]! * acc + apX1 + apA[0]! * apY1;
      apX1 = acc;
      apY1 = y1;
      const y2 = -apA[1]! * y1 + apX2 + apA[1]! * apY2;
      apX2 = y1;
      apY2 = y2;
      out[i] = y2;
    }
    channels.push(out);
  }
  return { channels, combDelaysMs };
}

/** Synthesize a deterministic IR for the given spec. */
export function synthesizeIr(
  spec: IrSpec,
  sampleRate: number,
  numChannels: number,
): SynthesizedIr {
  if (spec.type === 3) {
    const { channels, combDelaysMs } = spring(spec, sampleRate, numChannels);
    normalizeEnergy(channels);
    return { channels, erTapTimesMs: [], combDelaysMs };
  }
  if (spec.type === 1 || spec.type === 2) {
    const { channels, erTapTimesMs } = roomHall(spec, sampleRate, numChannels);
    normalizeEnergy(channels);
    return { channels, erTapTimesMs, combDelaysMs: [] };
  }
  const channels = stochasticTail(
    spec.rt60Sec,
    spec.damping,
    spec.seed,
    sampleRate,
    numChannels,
  );
  normalizeEnergy(channels);
  return { channels, erTapTimesMs: [], combDelaysMs: [] };
}

/** Imported-IR duration cap (effects v2 plan §E4): 15 s. */
export const IR_MAX_SECONDS = 15;

/** Truncate imported IR channels to maxSec·sr samples (quota guard). */
export function clampIrChannels(
  channels: Float32Array[],
  sampleRate: number,
  maxSec: number,
): Float32Array[] {
  const maxLen = Math.max(1, Math.round(maxSec * sampleRate));
  return channels.map((ch) => (ch.length > maxLen ? ch.slice(0, maxLen) : ch));
}
