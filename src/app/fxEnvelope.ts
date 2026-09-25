/**
 * A7 — FX envelope draft state (docs/automation-plan.md A7 addendum).
 * Curves authored in the effect dialog for the CURRENT apply: keyed by the
 * effect's flat param keys, region-relative sample domain, spec-domain
 * values. They ride `EffectRunContext.paramCurves` into BOTH preview and
 * apply and are BAKED into the audio by the apply bounce — nothing here
 * persists (the audio carries the result). Re-exports the generalized
 * envelope primitives so dialog code has one import surface.
 */
import { signal } from '@preact/signals';
import type { AutomationCurve } from '../engine/automation';

/** Curves being authored for the open effect dialog (empty = none). */
export const fxCurvesDraft = signal<Record<string, AutomationCurve>>({});
/** The param whose envelope the editor is showing (null = hidden). */
export const fxEnvelopeParam = signal<string | null>(null);
/** Region length in samples — the editor's x domain (0..len). */
export const fxRegionLen = signal(1);

/** Re-exported A7 primitives (single import surface for dialog code). */
export {
  automationMode,
  beginEnvelopeGesture,
  curveYIn,
  dragEnvelopeTo,
  envelopeNeighborAt,
  hitPointIn,
  insertEnvelopeInitial,
  insertEnvelopeNeighbor,
  nudgeEnvelopePoint,
  removeEnvelopePointAt,
  valueAtIn,
  type EnvelopeGesture,
  type OverlayGeom,
  type ValueDomain,
} from './automationUi';

/** Clear all draft state (dialog open/close). */
export function resetFxCurves(): void {
  fxCurvesDraft.value = {};
  fxEnvelopeParam.value = null;
  fxRegionLen.value = 1;
}

/** Set the region length (samples) the envelope maps onto. */
export function setFxCurveRegion(len: number): void {
  fxRegionLen.value = Math.max(1, Math.round(len));
}

/** ∿ toggle: arm a param for envelope authoring (empty curve) or disarm. */
export function toggleFxCurveParam(key: string): void {
  if (fxEnvelopeParam.value === key) {
    const next = { ...fxCurvesDraft.value };
    delete next[key];
    fxCurvesDraft.value = next;
    fxEnvelopeParam.value = null;
    return;
  }
  fxCurvesDraft.value = { ...fxCurvesDraft.value, [key]: fxCurvesDraft.value[key] ?? [] };
  fxEnvelopeParam.value = key;
}

/** Replace the draft curve for a param (gesture commits). */
export function setFxCurvePoints(key: string, points: AutomationCurve): void {
  fxCurvesDraft.value = { ...fxCurvesDraft.value, [key]: points };
}

/** Drop a param's curve entirely (Clear button). */
export function removeFxCurve(key: string): void {
  const next = { ...fxCurvesDraft.value };
  delete next[key];
  fxCurvesDraft.value = next;
  if (fxEnvelopeParam.value === key) fxEnvelopeParam.value = null;
}

/** The draft as EffectRunContext.paramCurves — undefined when empty. */
export function fxCurvesOrUndefined(): Record<string, AutomationCurve> | undefined {
  const keys = Object.keys(fxCurvesDraft.value);
  if (keys.length === 0) return undefined;
  const out: Record<string, AutomationCurve> = {};
  for (const k of keys) {
    const curve = fxCurvesDraft.value[k];
    if (curve && curve.length > 0) out[k] = curve;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
