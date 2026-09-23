/**
 * BS.1770-4 loudness kernels (M5). K-weighting seeds from the exact 48 kHz
 * table coefficients (libebur128/spec values) and derives ANY other rate
 * through an exact inverse-then-forward bilinear redesign — identity at
 * 48 kHz, correctly warped elsewhere (ADR 007). Blocks: 400 ms / 75%
 * overlap; gating: −70 LUFS absolute, then −10 LU relative. All arithmetic
 * in float64.
 */
import {
  LUFS_BLOCK_S,
  LUFS_GATE_ABS_LU,
  LUFS_GATE_REL_LU,
  LUFS_OVERLAP,
  LUFS_SHORT_TERM_S,
} from '../core/constants';

export interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

export interface LoudnessResult {
  integrated: number;
  momentaryMax: number;
  shortTermMax: number;
}

const OFFSET = -0.691;

function loudnessOfPower(totalPower: number): number {
  if (totalPower <= 0) return Number.NEGATIVE_INFINITY;
  return OFFSET + 10 * Math.log10(totalPower);
}

/** Exact BS.1770-4 48 kHz table coefficients (normalized, a0 = 1). */
const SHELF_48: Biquad = {
  b0: 1.53512485958697,
  b1: -2.69169618940638,
  b2: 1.19839281085285,
  a1: -1.69065929318241,
  a2: 0.73248077421585,
};
const RLB_48: Biquad = {
  b0: 0.9950299263000475,
  b1: -1.99004745483398,
  b2: 0.9950299263000475,
  a1: -1.99004745483398,
  a2: 0.9900722503662099,
};

/**
 * Redesign a digital biquad for `toSr` via inverse bilinear (at `fromSr`)
 * followed by forward bilinear (at `toSr`). Exact: at 48 kHz this is the
 * identity; at other rates the poles/zeros warp exactly as the transform
 * prescribes — no approximation beyond the (standard) bilinear mapping.
 */
export function redesignBiquad(f: Biquad, fromSr: number, toSr: number): Biquad {
  if (fromSr === toSr) return f;
  const d = 0.5 / fromSr; // T/2 of the source rate
  // analog form: (n2 + n1 s + n0 s²) / (d2c + d1 s + d0 s²)
  const n0 = d * d * (f.b0 - f.b1 + f.b2);
  const n1 = 2 * d * (f.b0 - f.b2);
  const n2 = f.b0 + f.b1 + f.b2;
  const d0 = d * d * (1 - f.a1 + f.a2);
  const d1 = 2 * d * (1 - f.a2);
  const d2c = 1 + f.a1 + f.a2;

  const e = 0.5 / toSr; // T/2 of the target rate; s = (1/e)(1-u)/(1+u)
  const wn0 = n0 / (e * e);
  const wn1 = n1 / e;
  const wd0 = d0 / (e * e);
  const wd1 = d1 / e;
  // (1+u)²·N(s(u)) with (1-u)², (1-u²), (1+u)² multipliers:
  //   u⁰ = wn0 + wn1 + n2 · u¹ = -2wn0 + 2n2 · u² = wn0 - wn1 + n2
  // (verified: the composition is the identity when e === d)
  const b0 = wn0 + wn1 + n2;
  const b1 = -2 * wn0 + 2 * n2;
  const b2 = wn0 - wn1 + n2;
  const a0 = wd0 + wd1 + d2c;
  const a1 = -2 * wd0 + 2 * d2c;
  const a2 = wd0 - wd1 + d2c;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function designShelf(sampleRate: number): Biquad {
  return redesignBiquad(SHELF_48, 48000, sampleRate);
}

function designRlb(sampleRate: number): Biquad {
  return redesignBiquad(RLB_48, 48000, sampleRate);
}

function applyBiquad(data: Float32Array | Float64Array, f: Biquad): Float64Array {
  const out = new Float64Array(data.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < data.length; ++i) {
    const x0 = data[i] ?? 0;
    const y0 = f.b0 * x0 + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}

/** Channel mean-square values for one [start, start+block) window. */
function windowPower(
  filtered: Float64Array[],
  start: number,
  block: number,
): number {
  let sum = 0;
  for (const channel of filtered) {
    let acc = 0;
    for (let i = start; i < start + block; ++i) {
      const v = channel[i] ?? 0;
      acc += v * v;
    }
    sum += acc / block;
  }
  return sum;
}

/** Filter channels and emit block powers (start index → power). */
function channelPowers(
  channels: Float32Array[],
  sampleRate: number,
): { powers: Map<number, number>; block: number; hop: number; frames: number } {
  const shelf = designShelf(sampleRate);
  const rlb = designRlb(sampleRate);
  const filtered = channels.map((ch) => applyBiquad(applyBiquad(ch, shelf), rlb));
  const frames = filtered[0]?.length ?? 0;
  const block = Math.round(sampleRate * LUFS_BLOCK_S);
  const hop = Math.round(sampleRate * LUFS_BLOCK_S * (1 - LUFS_OVERLAP));
  const powers = new Map<number, number>();
  for (let start = 0; start + block <= frames; start += hop) {
    powers.set(start, windowPower(filtered, start, block));
  }
  return { powers, block, hop, frames };
}

/** Full BS.1770-4 analysis of a program (any channel count ≥ 1). */
export function integrateLoudness(
  channels: Float32Array[],
  sampleRate: number,
): LoudnessResult {
  const { powers, block, hop } = channelPowers(channels, sampleRate);
  const starts = [...powers.keys()].sort((a, b) => a - b);
  if (starts.length === 0) {
    return { integrated: Number.NEGATIVE_INFINITY, momentaryMax: Number.NEGATIVE_INFINITY, shortTermMax: Number.NEGATIVE_INFINITY };
  }

  // momentary = raw 400 ms block loudness
  let momentaryMax = Number.NEGATIVE_INFINITY;
  for (const start of starts) {
    momentaryMax = Math.max(momentaryMax, loudnessOfPower(powers.get(start) ?? 0));
  }

  // short-term = 3 s windows on the same hop (sliding, not block-aligned)
  let shortTermMax = momentaryMax;
  const shortBlock = Math.round(sampleRate * LUFS_SHORT_TERM_S);
  if (shortBlock > block) {
    const shelf = designShelf(sampleRate);
    const rlb = designRlb(sampleRate);
    const filtered = channels.map((ch) => applyBiquad(applyBiquad(ch, shelf), rlb));
    const frames = filtered[0]?.length ?? 0;
    for (let start = 0; start + shortBlock <= frames; start += hop) {
      shortTermMax = Math.max(shortTermMax, loudnessOfPower(windowPower(filtered, start, shortBlock)));
    }
  }

  // gating stage 1: absolute
  const survivors1 = starts.filter((start) => loudnessOfPower(powers.get(start) ?? 0) > LUFS_GATE_ABS_LU);
  if (survivors1.length === 0) {
    return { integrated: Number.NEGATIVE_INFINITY, momentaryMax, shortTermMax };
  }
  let power1 = 0;
  for (const start of survivors1) power1 += powers.get(start) ?? 0;
  const relative = loudnessOfPower(power1 / survivors1.length) + LUFS_GATE_REL_LU;

  // gating stage 2: relative
  let count2 = 0;
  let power2 = 0;
  for (const start of survivors1) {
    const loudness = loudnessOfPower(powers.get(start) ?? 0);
    if (loudness > relative) {
      count2 += 1;
      power2 += powers.get(start) ?? 0;
    }
  }
  const integrated =
    count2 > 0 ? loudnessOfPower(power2 / count2) : loudnessOfPower(power1 / survivors1.length);

  return { integrated, momentaryMax, shortTermMax };
}

/** Momentary loudness per 400 ms block (for meter tracks/plots). */
export function momentaryTrack(channels: Float32Array[], sampleRate: number): number[] {
  const { powers, block, frames } = channelPowers(channels, sampleRate);
  void block;
  void frames;
  const starts = [...powers.keys()].sort((a, b) => a - b);
  return starts.map((start) => loudnessOfPower(powers.get(start) ?? 0));
}
