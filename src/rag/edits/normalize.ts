/**
 * P5.3 — plan range normalization (pure). Turns a RAW plan into a
 * doc-aware, capped, safe plan before anything touches the waveform:
 * clamp to [0, durationSec], enforce minimum length (collapses →
 * rejected), enforce the delete ≤ 90% cap and the insert cap, clamp
 * gain into the hard limits. Optional zero-cross snapping is INJECTED
 * (the engine's findZeroCross is the real supplier; tests inject a
 * deterministic fake). Returns null when the plan cannot be made safe.
 */
import { PLAN_LIMITS, type EditPlan } from './plan';

export interface DocInfo {
  durationSec: number;
  sampleRate: number;
}

export type PlanRejection =
  | 'collapsed-range'
  | 'out-of-bounds'
  | 'delete-cap'
  | 'insert-cap'
  | 'bad-doc';

export type NormalizeResult =
  | { ok: true; plan: EditPlan }
  | { ok: false; reason: PlanRejection };

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/**
 * Normalize one plan against the doc. Ranges are clamped to the document
 * (a range hanging past the end is truncated, not rejected — but a range
 * ENTIRELY outside collapses → rejected). Zero-cross snap moves the
 * start/end inward (never past each other) when the injected fn moves
 * them ≤ 0.05 s.
 */
export function normalizePlan(
  plan: EditPlan,
  doc: DocInfo,
  snap?: (sec: number) => number,
): NormalizeResult {
  if (!(doc.durationSec > 0) || !(doc.sampleRate > 0)) return { ok: false, reason: 'bad-doc' };

  if (plan.kind === 'insertSilence') {
    const durSec = clamp(plan.durSec, 0, PLAN_LIMITS.maxInsertSec);
    if (durSec < PLAN_LIMITS.minRangeSec) return { ok: false, reason: 'collapsed-range' };
    const atSec = clamp(plan.atSec, 0, doc.durationSec);
    return { ok: true, plan: { ...plan, atSec, durSec } };
  }

  let startSec = clamp(plan.startSec, 0, doc.durationSec);
  let endSec = clamp(plan.endSec, 0, doc.durationSec);
  if (snap) {
    const snappedStart = snap(startSec);
    const snappedEnd = snap(endSec);
    // accept the snap only when it stays close AND keeps the ordering
    if (Math.abs(snappedStart - startSec) <= 0.05) startSec = snappedStart;
    if (Math.abs(snappedEnd - endSec) <= 0.05 && snappedEnd > startSec) endSec = snappedEnd;
  }
  const len = endSec - startSec;
  if (len < PLAN_LIMITS.minRangeSec) return { ok: false, reason: 'collapsed-range' };
  if (plan.kind === 'deleteRange' && len > doc.durationSec * PLAN_LIMITS.maxDeleteFrac) {
    return { ok: false, reason: 'delete-cap' };
  }
  return {
    ok: true,
    plan: {
      ...plan,
      startSec,
      endSec,
      ...(plan.kind === 'gainRange' ? { factor: clamp(plan.factor, PLAN_LIMITS.minGain, PLAN_LIMITS.maxGain) } : {}),
    } as EditPlan,
  };
}

/**
 * Inward-only zero-cross snap helper factory (pure): given sample data
 * length + a findZeroCross-like function over samples, returns a
 * seconds-domain snap that never moves a point more than `radiusSec`.
 */
export function makeSnap(
  data: Float32Array,
  sampleRate: number,
  findZeroCross: (data: Float32Array, target: number, radius: number) => number,
  radiusSec = 0.005,
): (sec: number) => number {
  const radiusSamples = Math.max(1, Math.round(radiusSec * sampleRate));
  return (sec: number) => {
    const target = clamp(Math.round(sec * sampleRate), 0, data.length - 1);
    const snapped = findZeroCross(data, target, radiusSamples);
    return clamp(snapped / sampleRate, 0, data.length / sampleRate);
  };
}
