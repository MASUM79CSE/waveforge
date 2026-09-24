/**
 * E6b de-esser (effects v2 plan §E6): Linkwitz-Riley 4th-order 2-way
 * crossover (two cascaded Butterworth sections per band with the 4th-order
 * Q pair [0.5412, 1.3066] — that pair is what puts each band at −3.01 dB
 * at fc and makes the complement sum flat; two Q=0.7071 sections would
 * land at −6 dB), sine-peak-calibrated HF RMS detector
 * (20·log10(rms·√2), so a 0 dBFS sine reads 0 dB) and a static downward
 * ratio curve on the HF band only. Pure, length-preserving.
 */

import { designBiquad, processBiquad } from './biquad';

/**
 * LR4 = Butterworth-2 squared: two cascaded Q = 0.7071 sections per band.
 * (The 4th-order Butterworth Q pair [0.5412, 1.3066] — right for the E2
 * 24 dB/oct slopes — is the WRONG prototype here: it puts the bands at
 * −3.01 dB in phase at fc and the complement sums +3 dB hot. The squared
 * Butterworth is what makes LR4 complementary: each band −6.02 dB at fc,
 * Σ bands exactly flat — plan gate value corrected accordingly.)
 */
const LR4_SECTION_Q = Math.SQRT1_2;

export interface DeesserParams {
  crossoverHz: number;
  thresholdDb: number;
  ratio: number;
}

const ENVELOPE_TAU_SEC = 0.01;
const ENVELOPE_FLUSH = 1e-24;

/**
 * Split each channel into [low, high] through the LR4 crossover.
 * Exported for the analytic crossover anchors (bands and summed flatness).
 */
export function deesserSplit(
  channels: Float32Array[],
  sampleRate: number,
  crossoverHz: number,
): [Float32Array[], Float32Array[]] {
  const lpCoefs = [LR4_SECTION_Q, LR4_SECTION_Q].map((q) =>
    designBiquad('lpf', crossoverHz, 0, q, sampleRate),
  );
  const hpCoefs = [LR4_SECTION_Q, LR4_SECTION_Q].map((q) =>
    designBiquad('hpf', crossoverHz, 0, q, sampleRate),
  );
  const low = channels.map((ch) => {
    const band = ch.slice();
    for (const c of lpCoefs) processBiquad(band, c);
    return band;
  });
  const high = channels.map((ch) => {
    const band = ch.slice();
    for (const c of hpCoefs) processBiquad(band, c);
    return band;
  });
  return [low, high];
}

/**
 * Compress only the HF band: envelope = one-pole of x², detector dB =
 * 20·log10(rms·√2) (sine-peak calibration), GR = (1 − 1/R)·(level − T)
 * for level > T. Denormal-safe (envelope flushes to 0 below 1e-24).
 */
export function deesserProcess(
  channels: Float32Array[],
  sampleRate: number,
  params: DeesserParams,
): Float32Array[] {
  const ratio = params.ratio;
  if (ratio <= 1) return channels.map((ch) => ch.slice()); // no-op: bit-exact
  const [low, high] = deesserSplit(channels, sampleRate, params.crossoverHz);
  const k = 1 - Math.exp(-1 / (ENVELOPE_TAU_SEC * sampleRate));
  const threshold = params.thresholdDb;
  const grPerDb = 1 - 1 / ratio;

  return channels.map((_, c) => {
    const lo = low[c]!;
    const hi = high[c]!;
    const out = new Float32Array(channels[c]!.length);
    let env = 0;
    for (let i = 0; i < out.length; ++i) {
      const h = hi[i] ?? 0;
      env += k * (h * h - env);
      if (env < ENVELOPE_FLUSH) env = 0;
      let gain = 1;
      if (env > 0) {
        const levelDb = 10 * Math.log10(2 * env); // 20·log10(rms·√2)
        if (levelDb > threshold) {
          gain = Math.pow(10, (-grPerDb * (levelDb - threshold)) / 20);
        }
      }
      out[i] = (lo[i] ?? 0) + h * gain;
    }
    return out;
  });
}
