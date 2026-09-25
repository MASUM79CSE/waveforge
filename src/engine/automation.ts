/**
 * Automation curves (A1
). Pure: sorted
 * sample-domain breakpoints, piecewise LINEAR, immutable editing ops.
 * The mixdown consumes `mulTable`/`panWeights` (Float64, filled per
 * SEGMENT — never per-sample eval); playback ramps consume the same
 * points. Guard property (anchored in tests): a constant curve yields
 * ALL EXACT ONES / unity weights, so automation with constant curves is
 * bit-identical to no automation.
 */

/** One breakpoint: timeline sample + parameter value there. */
export interface AutomationPoint {
  /** Timeline sample (sorted ascending, unique — insert dedupes). */
  at: number;
  /** Parameter value at that sample (clamped to the param range by UI). */
  value: number;
}

export type AutomationCurve = AutomationPoint[];

/**
 * Value at `at`: exact linear interpolation inside a segment; endpoint
 * clamps outside; on a breakpoint → its exact value. Empty → throw
 * (callers treat empty/undefined curves as "no automation").
 */
export function evalCurve(points: AutomationCurve, at: number): number {
  if (points.length === 0) throw new Error('evalCurve: empty curve');
  if (at <= points[0]!.at) return points[0]!.value;
  const last = points[points.length - 1]!;
  if (at >= last.at) return last.value;
  for (let i = 0; i < points.length - 1; ++i) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    if (at >= p0.at && at < p1.at) {
      const span = p1.at - p0.at;
      if (span <= 0) return p1.value;
      const t = (at - p0.at) / span;
      return p0.value + t * (p1.value - p0.value);
    }
  }
  return last.value;
}

/** Sorted insert (same-`at` replaces); returns a new array. */
export function insertPoint(
  curve: AutomationCurve,
  at: number,
  value: number,
): AutomationCurve {
  const out = curve.filter((p) => p.at !== at);
  let i = 0;
  while (i < out.length && out[i]!.at < at) ++i;
  out.splice(i, 0, { at, value });
  return out;
}

export interface MoveBounds {
  min: number;
  max: number;
}

/** Move one breakpoint (by index); x clamps to the free slot between its
 * neighbours (derived from the curve itself), y to [min, max]. */
export function movePoint(
  curve: AutomationCurve,
  index: number,
  newAt: number,
  newValue: number,
  bounds: MoveBounds,
): AutomationCurve {
  const point = curve[index];
  if (!point) throw new Error(`movePoint: index ${index} out of range`);
  const rest = curve.filter((_, i) => i !== index);
  const prevAt = index > 0 ? rest[index - 1]?.at : undefined;
  const nextAt = index < rest.length ? rest[index]?.at : undefined;
  const lo = Math.max(0, (prevAt ?? Number.NEGATIVE_INFINITY) + 1);
  const hi = (nextAt ?? Number.POSITIVE_INFINITY) - 1;
  const at = Math.min(Math.max(Math.round(newAt), lo), hi);
  const value = Math.min(Math.max(newValue, bounds.min), bounds.max);
  let i = 0;
  while (i < rest.length && rest[i]!.at < at) ++i;
  rest.splice(i, 0, { at, value });
  return rest;
}

/** Remove one breakpoint (by index); an emptied curve = automation off. */
export function removePoint(curve: AutomationCurve, index: number): AutomationCurve {
  return curve.filter((_, i) => i !== index);
}

/**
 * Per-sample multipliers (Float64, len entries): linear inside each
 * segment, first value before the first point, last value from the last
 * point on. A sample exactly on a breakpoint gets that breakpoint's
 * value (the next segment's start).
 */
export function mulTable(points: AutomationCurve, len: number): Float64Array {
  if (points.length === 0) throw new Error('mulTable: empty curve');
  const out = new Float64Array(len);
  const first = points[0]!;
  const headEnd = Math.min(len, Math.max(0, first.at));
  for (let i = 0; i < headEnd; ++i) out[i] = first.value;
  for (let k = 0; k < points.length - 1; ++k) {
    const p0 = points[k]!;
    const p1 = points[k + 1]!;
    const from = Math.max(0, p0.at);
    const to = Math.min(len, p1.at);
    const span = p1.at - p0.at;
    if (span <= 0) continue;
    const dv = p1.value - p0.value;
    for (let i = from; i < to; ++i) {
      out[i] = p0.value + ((i - p0.at) / span) * dv;
    }
  }
  const last = points[points.length - 1]!;
  for (let i = Math.max(0, last.at); i < len; ++i) out[i] = last.value;
  return out;
}

export interface PanWeights {
  gl: Float64Array;
  gr: Float64Array;
}

/**
 * Per-sample balance-law weights from a pan curve: interpolate in the
 * PAN domain, then apply the EXACT law (pan ≥ 0 → gl = 1−pan; pan ≤ 0 →
 * gr = 1+pan) — hard L keeps the right channel exactly zero (and vice
 * versa) at every sample.
 */
export function panWeights(points: AutomationCurve, len: number): PanWeights {
  const pan = mulTable(points, len);
  const gl = new Float64Array(len);
  const gr = new Float64Array(len);
  for (let i = 0; i < len; ++i) {
    const p = pan[i]!;
    gl[i] = p >= 0 ? 1 - p : 1;
    gr[i] = p <= 0 ? 1 + p : 1;
  }
  return { gl, gr };
}
