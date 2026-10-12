/**
 * P5.5 — Smart-edit executor bridge (LAZY — the only rag→app edit
 * path). normalize → planToOutcome → performEdit ONCE (ONE undo step
 * with the plan's label). Preview = seek + play + timed pause. Mirrors
 * ragExportActions' lazy/dynamic-import discipline: the entry bundle
 * never pays for this module.
 */
import { findZeroCross, type EditOutcome } from '../engine/editOps';
import type { EditPlan } from '../rag/edits/plan';
import { engine, getDoc, performEdit } from './runtime';
import * as S from './state';

/** The undo label per plan kind (i18n happens in the UI commands). */
export function planLabel(plan: EditPlan): string {
  switch (plan.kind) {
    case 'deleteRange':
      return 'Delete utterance';
    case 'silenceRange':
      return 'Silence utterance';
    case 'gainRange':
      return 'Adjust level';
    case 'insertSilence':
      return 'Insert silence';
  }
}

export interface ApplyResult {
  ok: boolean;
  /** Rejection reason (typed; UI maps to copy). */
  reason?: 'no-doc' | 'unsafe' | 'empty' | 'failed';
  applied?: { startSec: number; endSec: number };
}

/**
 * Validate + normalize + execute a plan through performEdit exactly
 * once. All caps/bounds enforced by normalizePlan (P5.3). The rag/edits
 * kernels load dynamically (bundle gate: never in the entry chunk).
 */
export async function applyPlan(raw: EditPlan): Promise<ApplyResult> {
  const doc = getDoc();
  if (!doc || doc.length === 0) return { ok: false, reason: 'no-doc' };
  const { normalizePlan } = await import('../rag/edits/normalize');
  const normalized = normalizePlan(raw, { durationSec: doc.duration, sampleRate: doc.sampleRate });
  if (!normalized.ok) return { ok: false, reason: 'unsafe' };
  const plan = normalized.plan;
  const { planToOutcome } = await import('../rag/edits/planToOutcome');
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < doc.channels; ch++) channels.push(doc.channelData(ch));
  const outcome = planToOutcome(plan, channels, doc.sampleRate, doc.length);
  if (!outcome) return { ok: false, reason: 'empty' };
  const ok = performEdit(outcome, planLabel(plan));
  if (!ok) return { ok: false, reason: 'failed' };
  const startSec = plan.kind === 'insertSilence' ? plan.atSec : plan.startSec;
  const endSec = plan.kind === 'insertSilence' ? plan.atSec + plan.durSec : plan.endSec;
  return { ok: true, applied: { startSec, endSec } };
}

/**
 * Preview a normalized plan range: seek to its start, play, pause at
 * its end (deterministic timer). Returns false when there is nothing
 * to preview. Preview NEVER mutates the document.
 */
export async function previewPlan(raw: EditPlan): Promise<boolean> {
  const doc = getDoc();
  if (!doc || doc.length === 0) return false;
  const { normalizePlan } = await import('../rag/edits/normalize');
  const normalized = normalizePlan(raw, { durationSec: doc.duration, sampleRate: doc.sampleRate });
  if (!normalized.ok) return false;
  const plan = normalized.plan;
  const startSec = plan.kind === 'insertSilence' ? Math.max(0, plan.atSec - 0.5) : plan.startSec;
  const endSec = plan.kind === 'insertSilence' ? plan.atSec + plan.durSec : plan.endSec;
  const spanMs = Math.max(80, (endSec - startSec) * 1000);
  engine.seek(startSec);
  void engine.play();
  window.setTimeout(() => {
    if (engine.playing) engine.pause();
  }, spanMs);
  return true;
}

/** Selection (seconds) from app state, or null. */
export function currentSelectionSec(): { startSec: number; endSec: number } | null {
  const sel = S.selection.value;
  const doc = getDoc();
  if (!sel || !doc || sel.end - sel.start < 0.01) return null;
  return { startSec: Math.max(0, Math.min(sel.start, sel.end)), endSec: Math.min(doc.duration, Math.max(sel.start, sel.end)) };
}

/** Zero-cross snap in the seconds domain for the CURRENT document. */
export function docSnap(sec: number): number {
  const doc = getDoc();
  if (!doc) return sec;
  const data = doc.channelData(0);
  const snapped = findZeroCross(data, Math.round(sec * doc.sampleRate), Math.round(0.005 * doc.sampleRate));
  return snapped / doc.sampleRate;
}

/** Full safe apply used by UI/commands: plan → snap → apply. */
export function applyPlanSafe(raw: EditPlan): Promise<ApplyResult> {
  return applyPlan(raw);
}

export type { EditOutcome };
