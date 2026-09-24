/**
 * Iterative radix-2 Cooley–Tukey FFT (float64, in-place). Pure and
 * deterministic — the convolver (E4) and later spectral kernels (E6) build
 * on it. Tables are cached per size; sizes must be powers of two.
 */

interface FftTables {
  rev: Uint32Array;
  cos: Float64Array; // twiddle cosines, indexed by stage
  sin: Float64Array;
}

const TABLES = new Map<number, FftTables>();

function tablesFor(size: number): FftTables {
  const cached = TABLES.get(size);
  if (cached) return cached;
  const levels = Math.log2(size);
  if (!Number.isInteger(levels)) throw new Error(`Fft size must be a power of 2, got ${size}`);
  // bit-reversal permutation
  const rev = new Uint32Array(size);
  for (let i = 0; i < size; ++i) {
    let x = i;
    let r = 0;
    for (let b = 0; b < levels; ++b) {
      r = (r << 1) | (x & 1);
      x >>= 1;
    }
    rev[i] = r;
  }
  // twiddles for the full half-circle (per-stage stride indexes into it)
  const half = size >> 1;
  const cos = new Float64Array(half);
  const sin = new Float64Array(half);
  for (let i = 0; i < half; ++i) {
    cos[i] = Math.cos((2 * Math.PI * i) / size);
    sin[i] = Math.sin((2 * Math.PI * i) / size);
  }
  const tables: FftTables = { rev, cos, sin };
  TABLES.set(size, tables);
  return tables;
}

export class Fft {
  readonly size: number;
  private readonly t: FftTables;

  constructor(size: number) {
    this.size = size;
    this.t = tablesFor(size);
  }

  /** In-place forward transform (unnormalized). */
  forward(re: Float64Array, im: Float64Array): void {
    this.transform(re, im, false);
  }

  /** In-place inverse transform (scaled by 1/size). */
  inverse(re: Float64Array, im: Float64Array): void {
    this.transform(re, im, true);
  }

  private transform(re: Float64Array, im: Float64Array, inverse: boolean): void {
    const { size } = this;
    const { rev, cos, sin } = this.t;
    for (let i = 0; i < size; ++i) {
      const j = rev[i]!;
      if (j > i) {
        const tr = re[i]!;
        re[i] = re[j]!;
        re[j] = tr;
        const ti = im[i]!;
        im[i] = im[j]!;
        im[j] = ti;
      }
    }
    for (let span = 2; span <= size; span <<= 1) {
      const half = span >> 1;
      const step = size / span;
      for (let start = 0; start < size; start += span) {
        for (let k = 0, w = 0; k < half; ++k, w += step) {
          const i = start + k;
          const j = i + half;
          const wr = cos[w]!;
          // inverse uses the conjugate twiddle
          const wi = inverse ? sin[w]! : -sin[w]!;
          const xr = re[j]! * wr - im[j]! * wi;
          const xi = re[j]! * wi + im[j]! * wr;
          re[j] = re[i]! - xr;
          im[j] = im[i]! - xi;
          re[i] = re[i]! + xr;
          im[i] = im[i]! + xi;
        }
      }
    }
    if (inverse) {
      const inv = 1 / size;
      for (let i = 0; i < size; ++i) {
        re[i] = re[i]! * inv;
        im[i] = im[i]! * inv;
      }
    }
  }
}
