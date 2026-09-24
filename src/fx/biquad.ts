/**
 * RBJ biquad engine (effects v2 plan §E2, ADR 009): cookbook coefficient
 * design (Audio EQ Cookbook §1–§5) in float64, DF2T recurrence with
 * per-channel state, and the analytic magnitude |H(e^{jω})| used both by
 * the dialog curve and the tests. Pure — no AudioContext anywhere.
 *
 * Note (M5 lesson disarmed): the BS.1770 dead-end was BS.1770-specific
 * constants in an RBJ formula; the cookbook specs below ARE the correct
 * designs for general EQ and are anchor-tested against probe sines.
 */

export type BiquadKind = 'peaking' | 'lowshelf' | 'highshelf' | 'notch' | 'hpf' | 'lpf';

export interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number; // normalized by a0
}

/** Butterworth Q pairs for cascaded 24 dB/oct sections. */
export const BUTTERWORTH_Q_24DB = [0.5411961, 1.306563];

export function shelfAlpha(sampleRate: number, freqHz: number): number {
  const w0 = (2 * Math.PI * freqHz) / sampleRate;
  return (Math.sin(w0) / 2) * Math.SQRT2; // shelf slope S = 1
}

/** Design one RBJ section (normalized by a0). */
export function designBiquad(
  kind: BiquadKind,
  freqHz: number,
  gainDb: number,
  q: number,
  sampleRate: number,
): BiquadCoeffs {
  const w0 = Math.min(Math.PI * 0.999, (2 * Math.PI * freqHz) / sampleRate);
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);

  let b0: number;
  let b1: number;
  let b2: number;
  let a0: number;
  let a1: number;
  let a2: number;

  switch (kind) {
    case 'peaking': {
      const A = Math.pow(10, gainDb / 40);
      const alpha = sin / (2 * q);
      b0 = 1 + alpha * A;
      b1 = -2 * cos;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cos;
      a2 = 1 - alpha / A;
      break;
    }
    case 'lowshelf': {
      const A = Math.pow(10, gainDb / 40);
      const alpha = shelfAlpha(sampleRate, freqHz);
      const sq = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 - (A - 1) * cos + sq);
      b1 = 2 * A * (A - 1 - (A + 1) * cos);
      b2 = A * (A + 1 - (A - 1) * cos - sq);
      a0 = A + 1 + (A - 1) * cos + sq;
      a1 = -2 * (A - 1 + (A + 1) * cos);
      a2 = A + 1 + (A - 1) * cos - sq;
      break;
    }
    case 'highshelf': {
      const A = Math.pow(10, gainDb / 40);
      const alpha = shelfAlpha(sampleRate, freqHz);
      const sq = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 + (A - 1) * cos + sq);
      b1 = -2 * A * (A - 1 + (A + 1) * cos);
      b2 = A * (A + 1 + (A - 1) * cos - sq);
      a0 = A + 1 - (A - 1) * cos + sq;
      a1 = 2 * (A - 1 - (A + 1) * cos);
      a2 = A + 1 - (A - 1) * cos - sq;
      break;
    }
    case 'notch': {
      const alpha = sin / (2 * q);
      b0 = 1;
      b1 = -2 * cos;
      b2 = 1;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    }
    case 'hpf': {
      const alpha = sin / (2 * q);
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = (1 + cos) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    }
    case 'lpf': {
      const alpha = sin / (2 * q);
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = (1 - cos) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    }
  }

  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** DF2T in-place processing over one channel; state resets per call. */
export function processBiquad(ch: Float32Array, c: BiquadCoeffs): void {
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < ch.length; ++i) {
    const x = ch[i] ?? 0;
    const y = c.b0 * x + s1;
    s1 = c.b1 * x - c.a1 * y + s2;
    s2 = c.b2 * x - c.a2 * y;
    ch[i] = y;
  }
}

/**
 * Analytic magnitude at a frequency (Hz): |H(e^{jω})| in dB for the
 * normalized coefficients. This is exactly what the audio will do.
 */
export function biquadMagnitudeDb(c: BiquadCoeffs, freqHz: number, sampleRate: number): number {
  const w = (2 * Math.PI * freqHz) / sampleRate;
  const cw1 = Math.cos(w);
  const cw2 = Math.cos(2 * w);
  const sw1 = Math.sin(w);
  const sw2 = Math.sin(2 * w);
  const numRe = c.b0 + c.b1 * cw1 + c.b2 * cw2;
  const numIm = -(c.b1 * sw1 + c.b2 * sw2);
  const denRe = 1 + c.a1 * cw1 + c.a2 * cw2;
  const denIm = -(c.a1 * sw1 + c.a2 * sw2);
  const num = Math.hypot(numRe, numIm);
  const den = Math.hypot(denRe, denIm);
  return 20 * Math.log10(Math.max(1e-12, num / den));
}
