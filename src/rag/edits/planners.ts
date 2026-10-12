/**
 * P5.2 — deterministic edit planners (pure). Three inputs produce RAW
 * plans (normalize at execution): the current selection, an ask-answer
 * citation (utterance-level edit), and natural-language cues (en/bn,
 * fixed tables — mirrors the P4.1 router discipline; the NL box NEVER
 * executes anything by itself, it only PROPOSES a plan the UI shows for
 * explicit confirmation). Unknown verbs/numbers → null, never throw.
 */
import { makePlan, type EditPlan } from './plan';

export type RangeOp = 'delete' | 'silence' | 'gain';

/** Range plan from a selection (seconds) — provenance: selection. */
export function planFromSelection(
  sel: { startSec: number; endSec: number },
  op: RangeOp,
  factor = 1.5,
): EditPlan | null {
  const base = {
    startSec: Math.min(sel.startSec, sel.endSec),
    endSec: Math.max(sel.startSec, sel.endSec),
    source: 'selection' as const,
  };
  try {
    if (op === 'delete') return makePlan({ kind: 'deleteRange', ...base, labelKey: 'delete' });
    if (op === 'silence') return makePlan({ kind: 'silenceRange', ...base, labelKey: 'silence' });
    return makePlan({ kind: 'gainRange', ...base, factor, labelKey: 'gain' });
  } catch {
    return null;
  }
}

/** Range plan from an ask citation chunk (utterance) — provenance: utterance. */
export function planFromChunk(
  chunk: { startSec: number; endSec: number; transcriptId?: string; chunkId?: string },
  op: RangeOp,
  factor = 1.5,
): EditPlan | null {
  try {
    const base = {
      startSec: chunk.startSec,
      endSec: chunk.endSec,
      source: 'utterance' as const,
      transcriptId: chunk.transcriptId,
      chunkId: chunk.chunkId,
    };
    if (op === 'delete') return makePlan({ kind: 'deleteRange', ...base, labelKey: 'delete' });
    if (op === 'silence') return makePlan({ kind: 'silenceRange', ...base, labelKey: 'silence' });
    return makePlan({ kind: 'gainRange', ...base, factor, labelKey: 'gain' });
  } catch {
    return null;
  }
}

/** Fixed gain factors for verbal cues (code-fixed, not configurable). */
export const VERB_GAIN = Object.freeze({ quiet: 0.5, soften: 0.7, boost: 1.8, louder: 1.8 } as const);

interface Cue {
  re: RegExp;
  substr?: string[];
  op: RangeOp;
  factor?: number;
}

// Priority order: delete > silence > gain-quiet > gain-boost > insert
const CUES: Cue[] = [
  { re: /\b(delete|remove|cut)\b/, substr: ['মুছে ফেল', 'মুছুন', 'কেটে ফেল'], op: 'delete' },
  { re: /\b(silence|mute)\b/, substr: ['নীরব', 'সাইলেন্স', 'মিউট'], op: 'silence' },
  { re: /\b(quiet|quieter|soften|soft)\b/, substr: ['কম জোরে', 'নরম'], op: 'gain', factor: VERB_GAIN.quiet },
  { re: /\b(softer)\b/, substr: [], op: 'gain', factor: VERB_GAIN.soften },
  { re: /\b(boost|louder|louder here|amplify)\b/, substr: ['বেশি জোরে', 'জোরালো'], op: 'gain', factor: VERB_GAIN.boost },
];

const INSERT_RE = /\binsert\s+(-?\d+(?:\.\d+)?)\s*(?:s\b|sec|second|seconds\b)/;
const INSERT_BN = /(-?\d+(?:\.\d+)?)\s*(?:সেকেন্ড)\s*(?:নীরব|সাইলেন্স)/;

export interface PlanIntent {
  plan: EditPlan | null;
  /** Matched verb (debug/eval + UI hint). */
  verb: string | null;
}

/**
 * NL planner: "delete this", "silence from 2 to 4", "make it quieter",
 * "insert 3 seconds of silence at 10". No match → {plan: null,
 * verb: null}. Numbers parsed strictly (finite, ≥ 0); the cue tables
 * are code-fixed.
 */
export function planFromUtterance(
  text: string,
  resolve: { startSec: number; endSec: number },
): PlanIntent {
  const norm = text.normalize('NFKC').toLowerCase();

  // insert silence with explicit duration (+ optional "at")
  const insert = INSERT_RE.exec(norm) ?? INSERT_BN.exec(norm);
  if (insert) {
    const dur = Number(insert[1]);
    if (!Number.isFinite(dur) || dur < 0) return { plan: null, verb: null };
    const at = /(?:\bat\s+(\d+(?:\.\d+)?))/.exec(norm) ?? /(?:\s(\d+(?:\.\d+)?)\s*(?:সেকেন্ড)\s*(?:নীরব|সাইলেন্স))/.exec(norm);
    const atSec = at ? Number(at[1]) : resolve.startSec;
    try {
      return {
        plan: makePlan({ kind: 'insertSilence', atSec: Number.isFinite(atSec) ? atSec : resolve.startSec, durSec: dur, source: 'manual', labelKey: 'insertSilence' }),
        verb: 'insert',
      };
    } catch {
      return { plan: null, verb: 'insert' };
    }
  }

  // explicit numeric range: "silence from 2 to 4" / "delete 10 to 12"
  const rangeRe = /\b(delete|silence|mute|remove|cut)\b[^0-9]*?(\d+(?:\.\d+)?)\s*(?:s\b|to|−|-|—)\s*(\d+(?:\.\d+)?)/;
  const range = rangeRe.exec(norm);
  if (range) {
    const op: RangeOp = range[1] === 'silence' || range[1] === 'mute' ? 'silence' : 'delete';
    const startSec = Number(range[2]);
    const endSec = Number(range[3]);
    const plan = planFromSelection({ startSec, endSec }, op);
    return { plan, verb: op };
  }

  for (const cue of CUES) {
    const hit = cue.re.test(norm) || (cue.substr?.some((s) => norm.includes(s)) ?? false);
    if (hit) {
      const plan = planFromSelection(resolve, cue.op, cue.factor);
      return { plan, verb: cue.op };
    }
  }
  return { plan: null, verb: null };
}
