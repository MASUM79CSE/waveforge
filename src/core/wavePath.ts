/**
 * Batched lane geometry (UX-4.3, pure) — one pass over the visible columns
 * produces the path points for a single Path2D fill per lane (instead of
 * one fillRect per pixel) plus merged missing-runs for the progressive
 * tile loader. Consumed by waveDraw's batched branch (frame2 flag only).
 */

export interface LaneValue {
  min: number;
  max: number;
}

/** x → bucket value; null = tile missing at that column. */
export type LaneSample = (x: number) => LaneValue | null;

export interface LaneGeometry {
  /** [x, yMin(top of the min/max band), yMax] per sampled column */
  cols: Array<[number, number, number]>;
  /** inclusive inclusive missing runs [x0, x1] */
  missing: Array<[number, number]>;
}

/** Clamp helper mirrors waveDraw's lane bounds (1px padding). */
function clampY(y: number, y0: number, y1: number): number {
  return y < y0 + 1 ? y0 + 1 : y > y1 - 1 ? y1 - 1 : y;
}

export function lanePathPoints(
  width: number,
  sample: LaneSample,
  y0: number,
  mid: number,
  amp: number,
  /** amplitude transformer (e.g. the dB curve) applied before the linear y math */
  map?: (v: number) => number,
): LaneGeometry {
  if (width <= 0) return { cols: [], missing: [] };
  const y1 = y0 + (mid - y0) * 2; // symmetric lane bottom from edge/mid
  const cols: Array<[number, number, number]> = [];
  const missing: Array<[number, number]> = [];
  let runStart: number | null = null;

  for (let x = 0; x < width; ++x) {
    const v = sample(x);
    if (!v) {
      if (runStart === null) runStart = x;
      continue;
    }
    if (runStart !== null) {
      missing.push([runStart, x - 1]);
      runStart = null;
    }
    const hi = map ? map(v.max) : v.max;
    const lo = map ? map(v.min) : v.min;
    const yMin = clampY(mid - hi * amp, y0, y1);
    const yMax = clampY(mid - lo * amp, y0, y1);
    cols.push([x, yMin, yMax]);
  }
  if (runStart !== null) missing.push([runStart, width - 1]);
  return { cols, missing };
}
