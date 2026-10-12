/**
 * P5.1 — Smart-edit plan schema (pure, zod). A plan is a SMALL,
 * serializable, deterministic description of one waveform edit — no
 * audio data, no ML output. Execution goes through planToOutcome +
 * performEdit (ONE undo step). Every numeric field is finite and
 * non-negative; ranges are half-open [startSec, endSec).
 */
import { z } from 'zod';

/** Provenance: what produced the range (audit + UI display). */
export const PlanSourceSchema = z.enum(['selection', 'utterance', 'manual']);
export type PlanSource = z.infer<typeof PlanSourceSchema>;

const SecondsSchema = z.number().finite().nonnegative();

const RangeFields = {
  startSec: SecondsSchema,
  endSec: SecondsSchema,
};

export const DeleteRangePlanSchema = z.object({
  kind: z.literal('deleteRange'),
  ...RangeFields,
  source: PlanSourceSchema,
  /** Undo-stack label key (i18n happens at the UI boundary). */
  labelKey: z.enum(['delete', 'silence', 'gain', 'insertSilence']),
  transcriptId: z.string().optional(),
  chunkId: z.string().optional(),
});

export const SilenceRangePlanSchema = z.object({
  kind: z.literal('silenceRange'),
  ...RangeFields,
  source: PlanSourceSchema,
  labelKey: z.literal('silence'),
  transcriptId: z.string().optional(),
  chunkId: z.string().optional(),
});

export const GainRangePlanSchema = z.object({
  kind: z.literal('gainRange'),
  ...RangeFields,
  /** Linear gain; clamped to [MIN_GAIN, MAX_GAIN] here (hard limit). */
  factor: z.number().finite().min(0.25).max(4),
  source: PlanSourceSchema,
  labelKey: z.literal('gain'),
  transcriptId: z.string().optional(),
  chunkId: z.string().optional(),
});

export const InsertSilencePlanSchema = z.object({
  kind: z.literal('insertSilence'),
  atSec: SecondsSchema,
  /** Hard cap 30 s (P5.3 re-checks against doc-aware limits). */
  durSec: z.number().finite().nonnegative().max(30),
  source: PlanSourceSchema,
  labelKey: z.literal('insertSilence'),
});

export const EditPlanSchema = z.discriminatedUnion('kind', [
  DeleteRangePlanSchema,
  SilenceRangePlanSchema,
  GainRangePlanSchema,
  InsertSilencePlanSchema,
]);

export type DeleteRangePlan = z.infer<typeof DeleteRangePlanSchema>;
export type SilenceRangePlan = z.infer<typeof SilenceRangePlanSchema>;
export type GainRangePlan = z.infer<typeof GainRangePlanSchema>;
export type InsertSilencePlan = z.infer<typeof InsertSilencePlanSchema>;
export type EditPlan = z.infer<typeof EditPlanSchema>;

/** Code-fixed hard limits (single source of truth for P5.3/P5.8). */
export const PLAN_LIMITS = Object.freeze({
  minRangeSec: 0.02,
  maxDeleteFrac: 0.9,
  maxInsertSec: 30,
  minGain: 0.25,
  maxGain: 4,
});

/** Validate unknown data into an EditPlan (executor boundary). */
export function parsePlan(data: unknown): { ok: true; plan: EditPlan } | { ok: false; reason: string } {
  const parsed = EditPlanSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues[0]?.message ?? 'invalid plan' };
  }
  const plan = parsed.data;
  const inverted =
    plan.kind === 'insertSilence' ? false : plan.endSec <= plan.startSec;
  if (inverted) return { ok: false, reason: 'endSec must be > startSec' };
  return { ok: true, plan };
}

/** Convenience constructors (planners use these; all validate). */
export function makePlan(plan: EditPlan): EditPlan {
  const res = parsePlan(plan);
  if (!res.ok) throw new Error(`plan rejected: ${res.reason}`);
  return res.plan;
}
