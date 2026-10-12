import { describe, expect, it } from 'vitest';
import { planToOutcome } from '../../../src/rag/edits/planToOutcome';
import { applyOps } from '../../../src/engine/editOps';
import type { EditPlan } from '../../../src/rag/edits/plan';

const SR = 100; // 100 Hz — tiny numbers, easy arithmetic
/** 2-channel, 10 s of a ramp (0..999 per channel). */
function doc(): Float32Array[] {
  return [0, 1].map((ch) => Float32Array.from({ length: 1000 }, (_, i) => ((i % 500) / 500 + ch * 0.1)));
}

describe('P5.5 planToOutcome (pure kernels)', () => {
  it('deleteRange cuts exactly the planned samples', () => {
    const plan: EditPlan = { kind: 'deleteRange', startSec: 1, endSec: 3, source: 'manual', labelKey: 'delete' };
    const out = planToOutcome(plan, doc(), SR, 1000)!;
    expect(out.channels[0]!.length).toBe(800); // 1000 - 200
    // the sample at 1 s is gone: position 100 now holds what was at 300
    expect(out.channels[0]![100]).toBeCloseTo(doc()[0]![300]!, 9);
  });

  it('silenceRange writes zeros in [start,end) and nothing else', () => {
    const plan: EditPlan = { kind: 'silenceRange', startSec: 2, endSec: 4, source: 'manual', labelKey: 'silence' };
    const out = planToOutcome(plan, doc(), SR, 1000)!;
    expect(out.channels[0]!.length).toBe(1000);
    expect(out.channels[0]![250]).toBe(0);
    expect(out.channels[0]![399]).toBe(0);
    expect(out.channels[0]![400]).toBeCloseTo(doc()[0]![400]!, 9); // end exclusive
    expect(out.channels[0]![199]).toBeCloseTo(doc()[0]![199]!, 9);
  });

  it('gainRange scales within [start,end) and clamps to [-1,1]', () => {
    const plan: EditPlan = { kind: 'gainRange', startSec: 0, endSec: 1, factor: 4, source: 'manual', labelKey: 'gain' };
    const out = planToOutcome(plan, doc(), SR, 1000)!;
    expect(out.channels[0]![50]).toBeCloseTo(Math.min(1, doc()[0]![50]! * 4), 9);
    expect(out.channels[1]![50]).toBeCloseTo(Math.min(1, doc()[1]![50]! * 4), 9);
    // outside the range untouched
    expect(out.channels[0]![500]).toBeCloseTo(doc()[0]![500]!, 9);
  });

  it('insertSilence inserts duration zeros at atSec', () => {
    const plan: EditPlan = { kind: 'insertSilence', atSec: 5, durSec: 2, source: 'manual', labelKey: 'insertSilence' };
    const out = planToOutcome(plan, doc(), SR, 1000)!;
    expect(out.channels[0]!.length).toBe(1200);
    expect(out.channels[0]![500]).toBe(0);
    expect(out.channels[0]![699]).toBe(0);
    expect(out.channels[0]![700]).toBeCloseTo(doc()[0]![500]!, 9);
  });

  it('undo/redo round-trip: applyOps(undo) → original, applyOps(redo) → edited', () => {
    const ch = doc();
    const plan: EditPlan = { kind: 'deleteRange', startSec: 1, endSec: 3, source: 'manual', labelKey: 'delete' };
    const out = planToOutcome(plan, ch, SR, 1000)!;
    const undone = applyOps(out.channels, out.undoOps);
    expect(undone[0]!.length).toBe(1000);
    expect(undone[0]![100]).toBeCloseTo(ch[0]![100]!, 9);
    const redone = applyOps(undone, out.redoOps);
    expect(redone[0]!.length).toBe(out.channels[0]!.length);
    expect(redone[0]![100]).toBeCloseTo(out.channels[0]![100]!, 9);
  });

  it('silence undo restores the exact original samples (write ops)', () => {
    const ch = doc();
    const plan: EditPlan = { kind: 'silenceRange', startSec: 0, endSec: 2, source: 'manual', labelKey: 'silence' };
    const out = planToOutcome(plan, ch, SR, 1000)!;
    const undone = applyOps(out.channels, out.undoOps);
    for (let i = 0; i < 200; i += 37) {
      expect(undone[0]![i]).toBeCloseTo(ch[0]![i]!, 9);
    }
  });

  it('out-of-bounds / empty plans → null (never a destructive no-op)', () => {
    expect(planToOutcome({ kind: 'deleteRange', startSec: 50, endSec: 50.5, source: 'manual', labelKey: 'delete' }, doc(), SR, 100)).toBeNull();
    expect(planToOutcome({ kind: 'insertSilence', atSec: 0, durSec: 0, source: 'manual', labelKey: 'insertSilence' }, doc(), SR, 1000)).toBeNull();
    expect(planToOutcome({ kind: 'deleteRange', startSec: 0, endSec: 1, source: 'manual', labelKey: 'delete' }, [], SR, 0)).toBeNull();
  });

  it('rounding is deterministic at sub-sample boundaries', () => {
    const ch = doc();
    const a = planToOutcome({ kind: 'deleteRange', startSec: 1.015, endSec: 3.015, source: 'manual', labelKey: 'delete' }, ch, SR, 1000);
    const b = planToOutcome({ kind: 'deleteRange', startSec: 1.015, endSec: 3.015, source: 'manual', labelKey: 'delete' }, ch, SR, 1000);
    expect(a).toEqual(b);
  });
});
