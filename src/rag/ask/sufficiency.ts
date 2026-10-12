/**
 * P4.3 — evidence sufficiency + score calibration (pure). Raw retrieval
 * scores (RRF sums ~0.016–0.033 for k=60, BM25 unbounded) are squashed
 * through a FIXED logistic to a calibrated confidence in [0,1]. The
 * decision threshold is code-fixed: below ANSWER_MIN_CONFIDENCE the ask
 * flow must say "not in this transcript" instead of answering.
 */
import { z } from 'zod';

export const SufficiencySchema = z.enum(['answer', 'insufficient']);
export type Sufficiency = z.infer<typeof SufficiencySchema>;

/** Fixed calibration constants (chosen on the P3.8 corpus; frozen here). */
export const CALIBRATION = Object.freeze({
  /** Midpoint of the logistic (RRF-score scale for k=60). */
  center: 0.02,
  /** Steepness: score Δ around center for confidence 0.27↔0.73. */
  slope: 120,
});

/** Answer only at/above this confidence (code-fixed, not configurable). */
export const ANSWER_MIN_CONFIDENCE = 0.45;

/**
 * Calibrate a fused retrieval score to [0,1] via
 * 1 / (1 + exp(-slope·(score − center))). Monotonic, deterministic.
 */
export function calibrate(score: number): number {
  if (!Number.isFinite(score)) return 0;
  const x = CALIBRATION.slope * (score - CALIBRATION.center);
  // clamp to avoid overflow extremes
  const c = x >= 0 ? 1 / (1 + Math.exp(-Math.min(60, x))) : 1 / (1 + Math.exp(Math.min(60, -x)));
  return c;
}

export interface SufficiencyInput {
  /** Number of hits returned by retrieval (0 = no evidence). */
  hits: number;
  /** Best fused score among the hits (ignored when hits = 0). */
  bestScore: number;
}

export interface SufficiencyResult {
  decision: Sufficiency;
  confidence: number;
}

/** Decide whether the evidence is strong enough to answer. */
export function assessSufficiency(input: SufficiencyInput): SufficiencyResult {
  if (input.hits <= 0) {
    return { decision: 'insufficient', confidence: 0 };
  }
  const confidence = calibrate(input.bestScore);
  return {
    decision: confidence >= ANSWER_MIN_CONFIDENCE ? 'answer' : 'insufficient',
    confidence,
  };
}
