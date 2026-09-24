/**
 * Lane peak buckets (M8d): per-pixel-column min/max for a track lane —
 * the multitrack analogue of the doc renderer's raster, but pure and
 * allocation-light. Columns beyond the data are silent (0, 0).
 */
export interface LanePeaks {
  min: Float32Array;
  max: Float32Array;
}

/** Min/max per column over ALL channels (union → the lane shows the envelope). */
export function lanePeaks(
  channels: Float32Array[],
  spp: number,
  start: number,
  width: number,
): LanePeaks {
  const min = new Float32Array(width);
  const max = new Float32Array(width);
  if (width <= 0 || spp <= 0) return { min, max };
  const first = channels[0];
  if (!first) return { min, max };
  const total = channels.reduce((acc, ch) => Math.max(acc, ch.length), 0);

  for (let x = 0; x < width; ++x) {
    const from = start + x * spp;
    const to = from + spp;
    if (from >= total || to <= 0) continue; // stays 0,0 (silent)
    const s = Math.max(0, from);
    const e = Math.min(total, to);
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (const ch of channels) {
      const n = Math.min(ch.length, e);
      // union across channels; each channel only covers its own range
      for (let i = s; i < n; ++i) {
        const v = ch[i]!;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    if (lo !== Number.POSITIVE_INFINITY) min[x] = lo;
    if (hi !== Number.NEGATIVE_INFINITY) max[x] = hi;
  }
  return { min, max };
}
