/**
 * P5.5 — plan → EditOutcome (pure). Maps a NORMALIZED plan onto the
 * engine's edit kernels, producing exactly the outcome shape
 * `performEdit` stages (undo/redo ops included). The executor bridge
 * (src/app/ragEditActions.ts) then commits it as ONE undo step.
 */
import {
  makeCut,
  makeInsert,
  makeRangeWrite,
  sliceRegion,
  type EditOutcome,
} from '../../engine/editOps';
import type { EditPlan } from './plan';

function secondsToSamples(sec: number, sampleRate: number): number {
  return Math.max(0, Math.round(sec * sampleRate));
}

export function planToOutcome(
  plan: EditPlan,
  channels: Float32Array[],
  sampleRate: number,
  length: number,
): EditOutcome | null {
  if (channels.length === 0 || !(sampleRate > 0)) return null;

  if (plan.kind === 'deleteRange') {
    const start = Math.min(secondsToSamples(plan.startSec, sampleRate), length);
    const end = Math.min(secondsToSamples(plan.endSec, sampleRate), length);
    const len = end - start;
    if (len <= 0) return null;
    return makeCut(channels, start, len);
  }

  if (plan.kind === 'silenceRange' || plan.kind === 'gainRange') {
    const start = Math.min(secondsToSamples(plan.startSec, sampleRate), length);
    const end = Math.min(secondsToSamples(plan.endSec, sampleRate), length);
    const len = end - start;
    if (len <= 0) return null;
    const before = sliceRegion(channels, start, len);
    const after = before.map((ch) => {
      const out = new Float32Array(ch.length);
      if (plan.kind === 'silenceRange') return out; // zeros
      const factor = plan.kind === 'gainRange' ? plan.factor : 1;
      for (let i = 0; i < ch.length; i++) {
        out[i] = clampSample(ch[i]! * factor);
      }
      return out;
    });
    return makeRangeWrite(channels, start, before, after);
  }

  // insertSilence
  const at = Math.min(secondsToSamples(plan.atSec, sampleRate), length);
  const dur = secondsToSamples(plan.durSec, sampleRate);
  if (dur <= 0) return null;
  const silence = channels.map(() => new Float32Array(dur));
  return makeInsert(channels, at, silence);
}

function clampSample(x: number): number {
  return Math.max(-1, Math.min(1, x));
}
