/**
 * Pure numeric generators for effects (ADR 005 §4). Deterministic — the
 * reverb IR uses a seeded PRNG instead of Math.random so golden tests and
 * repeat applies are reproducible.
 *
 * Deltas from the reference design (documented in ADR 005): the distortion curve is
 * scaled x3 so 0% drive = unity (the reference editor attenuates by 1/3 at zero);
 * delay/reverb mix uses equal-power crossfade (the reference editor's linear map sums
 * to +6 dB at center).
 */
import { FX_CURVE_SAMPLES } from '../core/constants';

/** Seeded 32-bit PRNG (mulberry32) — tiny, fast, deterministic. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEG = Math.PI / 180;

/**
 * WaveShaper curve (reference formula, scaled x3 for unity at zero drive):
 * f(x) = (3 + g) * x * 20deg / (PI + g*|x|) with g = round(amount).
 * Index mapping follows the WaveShaper spec: x = 2i/(n-1) - 1 (the reference editor
 * generated with 2i/n, which misses the +1 endpoint by 2/n — inaudible,
 * but spec-correct mapping also gives exact mirror symmetry).
 */
export function distortionCurve(amount: number, n = FX_CURVE_SAMPLES): Float32Array<ArrayBuffer> {
  const gain = Math.max(0, Math.round(amount));
  const curve = new Float32Array(n);
  const denom = Math.max(1, n - 1);
  for (let i = 0; i < n; ++i) {
    const x = (i * 2) / denom - 1;
    curve[i] = ((3 + gain) * x * 20 * DEG) / (Math.PI + gain * Math.abs(x)) * 3;
  }
  return curve;
}

/**
 * Noise impulse response for the convolver reverb:
 * ir[i] = (rand*2 - 1) * pow(1 - n/len, decay), n reversed when `reverse`.
 */
export function reverbImpulse(
  channels: number,
  time: number,
  decay: number,
  reverse: boolean,
  sampleRate: number,
  seed: number,
): Float32Array<ArrayBuffer>[] {
  const length = Math.max(1, Math.round(sampleRate * time));
  const rand = mulberry32(seed);
  const out: Float32Array<ArrayBuffer>[] = [];
  for (let ch = 0; ch < channels; ++ch) {
    const data = new Float32Array(length);
    for (let i = 0; i < length; ++i) {
      const n = reverse ? length - i : i;
      data[i] = (rand() * 2 - 1) * Math.pow(1 - n / length, decay);
    }
    out.push(data);
  }
  return out;
}

/** Equal-power dry/wet gains for mix in [0,1] (constant total power). */
export function equalPowerMix(mix: number): { dry: number; wet: number } {
  const m = Math.max(0, Math.min(1, mix));
  // dry via sin((1-m)*PI/2) so endpoints are exact 1/0 (cos(PI/2) is ~6e-17)
  return { dry: Math.sin((1 - m) * (Math.PI / 2)), wet: Math.sin(m * (Math.PI / 2)) };
}
