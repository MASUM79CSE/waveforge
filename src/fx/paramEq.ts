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
