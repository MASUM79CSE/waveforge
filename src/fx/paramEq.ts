/**
 * E2 8-band parametric EQ (effects v2 plan §E2, ADR 009). Bands are the
 * user model; the registry layer speaks flat numeric params (4 per band)
 * so the generic validation/apply plumbing works unchanged. HPF/LPF offer
 * 12/24 dB-oct slopes (1 or 2 Butterworth sections). Zero-gain peaking
 * bands are skipped → bit-exact bypass.
 */
import {
  BUTTERWORTH_Q_24DB,
  biquadMagnitudeDb,
  designBiquad,
  processBiquad,
  type BiquadKind,
} from './biquad';
import { mulTable, type AutomationCurve } from '../engine/automation';

export const EQ_TYPES: BiquadKind[] = [
  'peaking',
  'lowshelf',
  'highshelf',
  'notch',
  'hpf',
  'lpf',
];

export const EQ_BAND_COUNT = 8;
export const EQ_FREQ_MIN = 20;
export const EQ_FREQ_MAX = 20000;
export const EQ_GAIN_MIN = -18;
export const EQ_GAIN_MAX = 18;
export const EQ_Q_MIN = 0.1;
export const EQ_Q_MAX = 16;

export interface EqBand {
  type: BiquadKind;
  freq: number;
  gainDb: number;
  q: number;
  /** Octave slope for HPF/LPF (12 or 24 dB/oct); ignored by other kinds. */
  slope: 12 | 24;
}

/** Default centre frequencies: log-spaced 40 Hz → 16 kHz. */
export function defaultBandFreq(index: number): number {
  return Math.round(40 * Math.pow(EQ_FREQ_MAX / 40, index / (EQ_BAND_COUNT - 1)));
}

export function defaultBand(index: number): EqBand {
  return { type: 'peaking', freq: defaultBandFreq(index), gainDb: 0, q: 1, slope: 12 };
}

/** Parse a band type param value (0–5 enum) with clamping. */
function typeFromIndex(value: number): BiquadKind {
  return EQ_TYPES[Math.max(0, Math.min(EQ_TYPES.length - 1, Math.round(value)))] ?? 'peaking';
}

/** Read the 8 bands from flat validated params (b{I}Type/Freq/Gain/Q). */
export function eqBandsFromParams(params: Record<string, number | boolean>): EqBand[] {
  const bands: EqBand[] = [];
  for (let i = 0; i < EQ_BAND_COUNT; ++i) {
    bands.push({
      type: typeFromIndex(Number(params[`b${i}Type`] ?? 0)),
      freq: Number(params[`b${i}Freq`] ?? defaultBandFreq(i)),
      gainDb: Number(params[`b${i}Gain`] ?? 0),
      q: Number(params[`b${i}Q`] ?? 1),
      slope: Number(params[`b${i}Slope`] ?? 12) >= 24 ? 24 : 12,
    });
  }
  return bands;
}

/** Write bands back to the flat param shape (for preview/apply). */
export function bandsToParams(bands: EqBand[]): Record<string, number> {
  const params: Record<string, number> = {};
  bands.forEach((band, i) => {
    params[`b${i}Type`] = Math.max(0, EQ_TYPES.indexOf(band.type));
    params[`b${i}Freq`] = band.freq;
    params[`b${i}Gain`] = band.gainDb;
    params[`b${i}Q`] = band.q;
    params[`b${i}Slope`] = band.slope;
  });
  return params;
}

/** A band participates in processing when it does something. */
function isActive(band: EqBand): boolean {
  switch (band.type) {
    case 'peaking':
    case 'lowshelf':
    case 'highshelf':
      return Math.abs(band.gainDb) > 0.01;
    case 'notch':
    case 'hpf':
    case 'lpf':
      return true; // cuts always act; slope/gain unused for these
  }
}

/** Sections for one band (HPF/LPF 24 dB/oct cascade 2 Butterworth stages). */
function bandSections(band: EqBand, sampleRate: number) {
  if ((band.type === 'hpf' || band.type === 'lpf') && band.slope === 24) {
    return BUTTERWORTH_Q_24DB.map((q) => designBiquad(band.type, band.freq, 0, q, sampleRate));
  }
  return [designBiquad(band.type, band.freq, band.gainDb, band.q, sampleRate)];
}

/** Process all channels through the active bands, in place semantics. */
export function processParamEq(
  channels: Float32Array[],
  sampleRate: number,
  bands: EqBand[],
): Float32Array[] {
  const sections = bands.filter(isActive).flatMap((band) => bandSections(band, sampleRate));
  if (sections.length === 0) {
    return channels.map((ch) => ch.slice()); // bypass — fresh copies, bit-exact content
  }
  return channels.map((ch) => {
    const out = Float32Array.from(ch);
    for (const coeffs of sections) processBiquad(out, coeffs);
    return out;
  });
}

/**
 * A6b: per-sample swept band stage — coefficients recomputed EVERY sample
 * from the current curve values via the SAME designBiquad, and the SAME TDF
 * recursion as processBiquad with (s1, s2) carried ACROSS coefficient
 * updates (the standard slowly-varying-filter approach). Constant curves
 * reproduce the static coefficients sample-for-sample → bit-identical
 * audio. Curve values come from mulTable (A1 semantics: on-point owns the
 * sample, endpoint clamps) so the swept values == evalCurve exactly.
 * Domains (20..20000 Hz etc.) are enforced where curves are authored —
 * designBiquad additionally guards w0 ≤ 0.999π.
 */
function sweepStage(
  ch: Float32Array,
  sampleRate: number,
  band: EqBand,
  freq: Float64Array | null,
  gainDb: Float64Array | null,
  q: Float64Array | null,
): Float32Array {
  const cascade = (band.type === 'hpf' || band.type === 'lpf') && band.slope === 24;
  const sections = cascade ? 2 : 1;
  const out = Float32Array.from(ch);
  const states = Array.from({ length: sections }, () => ({ s1: 0, s2: 0 }));
  for (let i = 0; i < out.length; ++i) {
    let x = out[i]!;
    const f = freq ? freq[i]! : band.freq;
    const g = gainDb ? gainDb[i]! : band.gainDb;
    const qv = q ? q[i]! : band.q;
    for (let j = 0; j < sections; ++j) {
      const coeffs = designBiquad(band.type, f, g, cascade ? BUTTERWORTH_Q_24DB[j]! : qv, sampleRate);
      const st = states[j]!;
      const y = coeffs.b0 * x + st.s1;
      st.s1 = coeffs.b1 * x - coeffs.a1 * y + st.s2;
      st.s2 = coeffs.b2 * x - coeffs.a2 * y;
      // section boundaries round to f32 exactly like the static path's
      // per-section array stores — constant curves stay BIT-identical
      x = Math.fround(y);
    }
    out[i] = x;
  }
  return out;
}

/**
 * A6b: processParamEq with per-band automation curves keyed `b{I}Freq` /
 * `b{I}Gain` / `b{I}Q` (region-relative samples). Bands without curves ride
 * the EXACT static section path (bit-identical); no curves at all
 * degenerates to processParamEq. Chain order and per-band state resets
 * match processParamEq's section chain.
 */
export function processParamEqSwept(
  channels: Float32Array[],
  sampleRate: number,
  bands: EqBand[],
  curves: Record<string, AutomationCurve>,
): Float32Array[] {
  const len = channels[0]?.length ?? 0;
  interface Stage {
    band: EqBand;
    freq: Float64Array | null;
    gainDb: Float64Array | null;
    q: Float64Array | null;
  }
  const stages: Array<Stage | null> = bands.map((band, i) => {
    const freqC = curves[`b${i}Freq`];
    const gainC = curves[`b${i}Gain`];
    const qC = curves[`b${i}Q`];
    const hasCurve = !!(freqC || gainC || qC);
    // a curve opts the band IN (a gain sweep can leave the 0 dB bypass)
    if (!isActive(band) && !hasCurve) return null;
    if (!hasCurve) return { band, freq: null, gainDb: null, q: null };
    return {
      band,
      freq: freqC && freqC.length > 0 ? mulTable(freqC, len) : null,
      gainDb: gainC && gainC.length > 0 ? mulTable(gainC, len) : null,
      q: qC && qC.length > 0 ? mulTable(qC, len) : null,
    };
  });
  if (!stages.some((s) => s && (s.freq || s.gainDb || s.q))) {
    return processParamEq(channels, sampleRate, bands);
  }
  return channels.map((ch) => {
    let cur: Float32Array = Float32Array.from(ch);
    for (const stage of stages) {
      if (!stage) continue;
      if (stage.freq || stage.gainDb || stage.q) {
        cur = sweepStage(cur, sampleRate, stage.band, stage.freq, stage.gainDb, stage.q);
      } else {
        for (const coeffs of bandSections(stage.band, sampleRate)) processBiquad(cur, coeffs);
      }
    }
    return cur;
  });
}

/** Analytic magnitude of one band in dB (dialog curve + tests). */
export function bandMagnitudeDb(band: EqBand, freqHz: number, sampleRate: number): number {
  return bandSections(band, sampleRate).reduce(
    (sum, coeffs) => sum + biquadMagnitudeDb(coeffs, freqHz, sampleRate),
    0,
  );
}

/** Analytic curve of the whole EQ at the given frequencies (Hz). */
export function eqCurveDb(bands: EqBand[], freqs: number[], sampleRate: number): Float64Array {
  const out = new Float64Array(freqs.length);
  for (let k = 0; k < freqs.length; ++k) {
    out[k] = bands.reduce((sum, band) => sum + bandMagnitudeDb(band, freqs[k] ?? 20, sampleRate), 0);
  }
  return out;
}
