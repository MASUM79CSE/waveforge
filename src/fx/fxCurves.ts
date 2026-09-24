/**
 * A6a — graph-kind FX param automation (docs/automation-plan.md A6
 * addendum). Pure scheduling over the AudioParams a graph builder exposed
 * via `BuiltGraph.auto`: curve values are REGION-relative samples → seconds,
 * the target's `apply` law runs per knot (equal-power mix stays exact at
 * endpoints), and CONSTANT curves produce a single setValueAtTime at t=0 —
 * the same value the static `.value` build sets, so constant == static at
 * the schedule level. No curves → no calls at all (the A2/A3 guard).
 */
import { evalCurve } from '../engine/automation';
import type { AutomationCurve } from '../engine/automation';

/** Scheduling surface of a WebAudio AudioParam (duck-typed for tests). */
export interface AudioParamSched {
  value: number;
  setValueAtTime(value: number, time: number): void;
  linearRampToValueAtTime(value: number, endTime: number): void;
  cancelScheduledValues(cancelTime: number): void;
}

/** One automation-driven AudioParam handle + its value law. */
export interface GraphAutoParam {
  param: AudioParamSched;
  /** Param-key value → actual AudioParam value (identity for most). */
  apply: (v: number) => number;
}

/** One automatable FX param: its handles, law and inclusive domain. */
export interface GraphAutoTarget {
  params: GraphAutoParam[];
  min: number;
  max: number;
}

/** FX param curves keyed by the effect's param keys. */
export type FxCurves = Record<string, AutomationCurve>;

/**
 * Schedule one graph's automation for a render window of `windowSamples`
 * (region-relative; includes the wet tail — knots past it are ignored and
 * the value holds after the last knot, matching evalCurve's clamp).
 */
export function scheduleFxAuto(
  auto: Record<string, GraphAutoTarget>,
  curves: FxCurves,
  sampleRate: number,
  windowSamples: number,
): void {
  for (const key of Object.keys(auto)) {
    const curve = curves[key];
    if (!curve || curve.length === 0) continue; // zero extra calls
    const target = auto[key]!;
    const clamp = (v: number): number => Math.min(Math.max(v, target.min), target.max);
    const knots = curve
      .filter((p) => p.at > 0 && p.at <= windowSamples)
      .map((p) => ({ t: p.at / sampleRate, v: clamp(p.value) }))
      .sort((a, b) => a.t - b.t);
    for (const handle of target.params) {
      const { param, apply } = handle;
      param.cancelScheduledValues(0);
      param.setValueAtTime(apply(clamp(evalCurve(curve, 0))), 0);
      for (const knot of knots) {
        param.linearRampToValueAtTime(apply(knot.v), knot.t);
      }
    }
  }
}
