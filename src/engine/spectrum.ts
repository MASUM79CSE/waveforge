/**
 * Spectrum band mapping (M5): groups AnalyserNode FFT bins into log-spaced
 * display bands (20 Hz – 20 kHz). Pure — unit-tested; the panel only draws.
 */

export const SPECTRUM_MIN_HZ = 20;
export const SPECTRUM_MAX_HZ = 20000;
export const SPECTRUM_BANDS = 48;

/**
 * Upper edge (in FFT bin index) of each band, ascending, log-spaced.
 * edges[i] is exclusive upper bound of band i; edges are strictly increasing
 * and the last edge equals binCount (clamped to the Nyquist window).
 */
export function bandBinEdges(
  bands: number,
  binCount: number,
  sampleRate: number,
): number[] {
  const nyquist = sampleRate / 2;
  const hzPerBin = nyquist / binCount;
  const minHz = Math.min(SPECTRUM_MIN_HZ, nyquist);
  const maxHz = Math.min(SPECTRUM_MAX_HZ, nyquist);
  const logMin = Math.log(minHz);
  const logMax = Math.log(maxHz);
  const edges: number[] = [];
  let prev = 0;
  for (let b = 1; b <= bands; ++b) {
    const hz = Math.exp(logMin + ((logMax - logMin) * b) / bands);
    // a band must contain at least one bin more than the previous band
    let bin = Math.max(prev + 1, Math.round(hz / hzPerBin));
    if (b === bands) bin = binCount;
    else bin = Math.min(bin, binCount - (bands - b));
    edges.push(bin);
    prev = bin;
  }
  return edges;
}

/** Mean magnitude (0–255 byte scale) of one band, or 0 for empty bands. */
export function bandLevel(
  data: Uint8Array,
  fromBin: number,
  toBin: number,
): number {
  let sum = 0;
  let n = 0;
  for (let i = fromBin; i < toBin && i < data.length; ++i) {
    sum += data[i] ?? 0;
    n += 1;
  }
  return n === 0 ? 0 : sum / n;
}
