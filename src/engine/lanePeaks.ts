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

// ---- M8g: coarse envelope buckets (interactive zoom/pan cost) ----

export const LANE_BUCKET = 256;

export interface LaneBuckets {
  min: Float32Array;
  max: Float32Array;
  bucket: number;
  total: number;
  /** Kept for the zoomed-in direct path (not enumerable in tests). */
  channels?: Float32Array[];
}

/** Fixed-size min/max buckets over the whole track — built once per edit. */
export function laneBuckets(channels: Float32Array[], bucket = LANE_BUCKET): LaneBuckets {
  let total = 0;
  for (const ch of channels) total = Math.max(total, ch.length);
  const n = Math.ceil(total / bucket);
  const min = new Float32Array(n);
  const max = new Float32Array(n);
  for (let b = 0; b < n; ++b) {
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    const s = b * bucket;
    const e = Math.min(total, s + bucket);
    for (const ch of channels) {
      const end = Math.min(ch.length, e);
      for (let i = s; i < end; ++i) {
        const v = ch[i]!;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    min[b] = lo === Number.POSITIVE_INFINITY ? 0 : lo;
    max[b] = hi === Number.NEGATIVE_INFINITY ? 0 : hi;
  }
  return { min, max, bucket, total, channels };
}

/**
 * Per-column peaks from precomputed buckets. Zoomed-in views (spp < bucket)
 * scan the (small) visible sample range directly; zoomed-out views aggregate
 * covered buckets — O(width × spp/bucket) instead of O(width × spp).
 */
export function lanePeaksFromBuckets(
  buckets: LaneBuckets,
  spp: number,
  start: number,
  width: number,
): LanePeaks {
  const min = new Float32Array(width);
  const max = new Float32Array(width);
  if (width <= 0 || spp <= 0) return { min, max };
  if (spp < buckets.bucket) {
    // zoomed in: direct scan of the visible window (bounded by width×spp)
    const channels = buckets.channels;
    if (!channels) return { min, max };
    return lanePeaks(channels, spp, start, width);
  }
  for (let x = 0; x < width; ++x) {
    const from = start + x * spp;
    const to = from + spp;
    if (from >= buckets.total) continue;
    const b0 = Math.max(0, Math.floor(from / buckets.bucket));
    const b1 = Math.min(buckets.min.length, Math.ceil(to / buckets.bucket));
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (let b = b0; b < b1; ++b) {
      if (buckets.min[b]! < lo) lo = buckets.min[b]!;
      if (buckets.max[b]! > hi) hi = buckets.max[b]!;
    }
    if (lo !== Number.POSITIVE_INFINITY) min[x] = lo;
    if (hi !== Number.NEGATIVE_INFINITY) max[x] = hi;
  }
  return { min, max };
}
