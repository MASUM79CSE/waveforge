import { describe, expect, it } from 'vitest';
import { makeSnap, normalizePlan } from '../../../src/rag/edits/normalize';
import { PLAN_LIMITS } from '../../../src/rag/edits/plan';

const DOC = { durationSec: 10, sampleRate: 48_000 };

describe('P5.3 range normalization', () => {
  it('clamps ranges hanging past the document end', () => {
    const res = normalizePlan(
      { kind: 'deleteRange', startSec: 9.9, endSec: 12, source: 'manual', labelKey: 'delete' },
      DOC,
    );
    expect(res.ok).toBe(true);
    if (res.ok && res.plan.kind === 'deleteRange') {
      expect(res.plan.startSec).toBe(9.9);
      expect(res.plan.endSec).toBe(10);
    }
    // a range that collapses under the min length after clamping is rejected
    expect(
      normalizePlan({ kind: 'deleteRange', startSec: 9.99, endSec: 12, source: 'manual', labelKey: 'delete' }, DOC).ok,
    ).toBe(false);
  });

  it('rejects ranges entirely outside the document', () => {
    expect(
      normalizePlan({ kind: 'deleteRange', startSec: 20, endSec: 25, source: 'manual', labelKey: 'delete' }, DOC),
    ).toEqual({ ok: false, reason: 'collapsed-range' });
  });

  it('rejects ranges that collapse below the minimum length', () => {
    expect(
      normalizePlan({ kind: 'silenceRange', startSec: 5, endSec: 5.01, source: 'manual', labelKey: 'silence' }, DOC).ok,
    ).toBe(false); // 0.01 < 0.02 min
  });

  it('enforces the delete ≤ 90% cap', () => {
    const res = normalizePlan(
      { kind: 'deleteRange', startSec: 0, endSec: 9.5, source: 'manual', labelKey: 'delete' },
      DOC,
    );
    expect(res).toEqual({ ok: false, reason: 'delete-cap' });
    // silence of the same span is allowed (non-destructive)
    expect(
      normalizePlan({ kind: 'silenceRange', startSec: 0, endSec: 9.5, source: 'manual', labelKey: 'silence' }, DOC).ok,
    ).toBe(true);
  });

  it('clamps gain into the hard limits', () => {
    const res = normalizePlan(
      { kind: 'gainRange', startSec: 0, endSec: 1, factor: 99, source: 'manual', labelKey: 'gain' },
      DOC,
    );
    expect(res.ok).toBe(true);
    if (res.ok && res.plan.kind === 'gainRange') {
      expect(res.plan.factor).toBe(PLAN_LIMITS.maxGain);
    }
  });

  it('clamps insert duration to the cap and atSec into the doc', () => {
    const res = normalizePlan(
      { kind: 'insertSilence', atSec: 42, durSec: 120, source: 'manual', labelKey: 'insertSilence' },
      DOC,
    );
    expect(res.ok).toBe(true);
    if (res.ok && res.plan.kind === 'insertSilence') {
      expect(res.plan.atSec).toBe(10);
      expect(res.plan.durSec).toBe(PLAN_LIMITS.maxInsertSec);
    }
  });

  it('zero-cross snap moves edges only within the tolerance and keeps order', () => {
    const snap = (sec: number) => (sec === 2 ? 2.003 : sec === 4 ? 3.999 : sec);
    const res = normalizePlan(
      { kind: 'silenceRange', startSec: 2, endSec: 4, source: 'selection', labelKey: 'silence' },
      DOC,
      snap,
    );
    expect(res.ok).toBe(true);
    if (res.ok && res.plan.kind === 'silenceRange') {
      expect(res.plan.startSec).toBeCloseTo(2.003, 6);
      expect(res.plan.endSec).toBeCloseTo(3.999, 6);
    }
  });

  it('bad doc info is rejected', () => {
    const res = normalizePlan(
      { kind: 'insertSilence', atSec: 0, durSec: 1, source: 'manual', labelKey: 'insertSilence' },
      { durationSec: 0, sampleRate: 48_000 },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('bad-doc');
  });

  it('makeSnap bridges sample-domain findZeroCross to seconds (pure)', () => {
    // zero at sample 48000 (1.0 s) — a fake findZeroCross returns it
    const fakeFind = (target: number) => (Math.abs(target - 48_000) <= 240 ? 48_000 : target);
    const snap = makeSnap(new Float32Array(480_000), 48_000, fakeFind);
    expect(snap(1.002)).toBeCloseTo(1.0, 4);
    expect(snap(5)).toBeCloseTo(5, 6); // outside radius → unchanged
  });

  it('deterministic', () => {
    const plan = { kind: 'gainRange', startSec: 1, endSec: 2, factor: 2, source: 'manual', labelKey: 'gain' } as const;
    expect(normalizePlan(plan, DOC)).toEqual(normalizePlan(plan, DOC));
  });
});
