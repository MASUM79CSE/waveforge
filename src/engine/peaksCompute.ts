/**
 * Peak computation — pure kernels (ADR 001; design adopted from peaks.js).
 * The peaks worker applies these to its owned channel copies; tests run them
 * directly. Kernel interior mutates locally-owned arrays (ADR 004 exception).
 */

export interface PeakMip {
  mins: Float32Array;
  maxs: Float32Array;
}

/** Min/max per `level`-sample bucket. */
export function buildMip(data: Float32Array, level: number): PeakMip {
  const n = data.length;
  const buckets = Math.max(0, Math.ceil(n / level));
  const mins = new Float32Array(buckets);
  const maxs = new Float32Array(buckets);
  for (let b = 0; b < buckets; ++b) {
    const s = b * level;
    const e = Math.min(n, s + level);
    let mn = data[s] ?? 0;
    let mx = mn;
    for (let i = s + 1; i < e; ++i) {
      const v = data[i] ?? 0;
      if (v < mn) mn = v;
      else if (v > mx) mx = v;
    }
    mins[b] = mn;
    maxs[b] = mx;
  }
  return { mins, maxs };
}

export interface TileSlice {
  mins: Float32Array;
  maxs: Float32Array;
  count: number;
}

/** Slice one tile of `tileSize` buckets out of a mip; null beyond the data. */
export function sliceTile(mip: PeakMip, tile: number, tileSize: number): TileSlice | null {
  const startBucket = tile * tileSize;
  if (startBucket >= mip.mins.length) return null;
  const count = Math.min(tileSize, mip.mins.length - startBucket);
  const end = startBucket + count;
  return {
    mins: mip.mins.slice(startBucket, end),
    maxs: mip.maxs.slice(startBucket, end),
    count,
  };
}
