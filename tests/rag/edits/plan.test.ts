import { describe, expect, it } from 'vitest';
import {
  EditPlanSchema,
  PLAN_LIMITS,
  makePlan,
  parsePlan,
} from '../../../src/rag/edits/plan';

describe('P5.1 EditPlan schema', () => {
  it('accepts every plan kind (golden shapes)', () => {
    const plans = [
      { kind: 'deleteRange', startSec: 1, endSec: 2.5, source: 'selection', labelKey: 'delete' },
      { kind: 'silenceRange', startSec: 0, endSec: 0.5, source: 'utterance', labelKey: 'silence', chunkId: 't#0' },
      { kind: 'gainRange', startSec: 3, endSec: 4, factor: 1.5, source: 'manual', labelKey: 'gain' },
      { kind: 'insertSilence', atSec: 2, durSec: 1.5, source: 'manual', labelKey: 'insertSilence' },
    ] as const;
    for (const plan of plans) {
      const res = parsePlan(plan);
      expect(res.ok, JSON.stringify(plan)).toBe(true);
    }
  });

  it('rejects NaN / Infinity / negative numbers', () => {
    expect(parsePlan({ kind: 'deleteRange', startSec: NaN, endSec: 2, source: 'manual', labelKey: 'delete' }).ok).toBe(false);
    expect(parsePlan({ kind: 'deleteRange', startSec: 0, endSec: Infinity, source: 'manual', labelKey: 'delete' }).ok).toBe(false);
    expect(parsePlan({ kind: 'insertSilence', atSec: -1, durSec: 1, source: 'manual', labelKey: 'insertSilence' }).ok).toBe(false);
  });

  it('rejects inverted / empty ranges at the boundary', () => {
    expect(parsePlan({ kind: 'deleteRange', startSec: 2, endSec: 2, source: 'manual', labelKey: 'delete' }).ok).toBe(false);
    expect(parsePlan({ kind: 'silenceRange', startSec: 3, endSec: 1, source: 'manual', labelKey: 'silence' }).ok).toBe(false);
  });

  it('rejects gain outside the hard limits', () => {
    expect(parsePlan({ kind: 'gainRange', startSec: 0, endSec: 1, factor: 0.2, source: 'manual', labelKey: 'gain' }).ok).toBe(false);
    expect(parsePlan({ kind: 'gainRange', startSec: 0, endSec: 1, factor: 4.01, source: 'manual', labelKey: 'gain' }).ok).toBe(false);
    expect(parsePlan({ kind: 'gainRange', startSec: 0, endSec: 1, factor: 4, source: 'manual', labelKey: 'gain' }).ok).toBe(true);
  });

  it('rejects insertSilence over the 30 s cap', () => {
    expect(parsePlan({ kind: 'insertSilence', atSec: 0, durSec: 30.01, source: 'manual', labelKey: 'insertSilence' }).ok).toBe(false);
    expect(parsePlan({ kind: 'insertSilence', atSec: 0, durSec: 30, source: 'manual', labelKey: 'insertSilence' }).ok).toBe(true);
  });

  it('rejects unknown kinds and missing labelKey (strict union)', () => {
    expect(parsePlan({ kind: 'normalizeAll' }).ok).toBe(false);
    expect(EditPlanSchema.safeParse({ kind: 'deleteRange', startSec: 0, endSec: 1, source: 'manual' }).success).toBe(false);
  });

  it('limits are frozen and match the plan schema', () => {
    expect(PLAN_LIMITS.minGain).toBe(0.25);
    expect(PLAN_LIMITS.maxGain).toBe(4);
    expect(PLAN_LIMITS.maxInsertSec).toBe(30);
    expect(Object.isFrozen(PLAN_LIMITS)).toBe(true);
  });

  it('makePlan throws on invalid input (planner guard)', () => {
    expect(() => makePlan({ kind: 'deleteRange', startSec: 5, endSec: 1, source: 'manual', labelKey: 'delete' })).throws();
    expect(() =>
      makePlan({ kind: 'deleteRange', startSec: 0, endSec: 1, source: 'manual', labelKey: 'delete' }),
    ).not.throws();
  });

  it('provenance fields survive parsing', () => {
    const res = parsePlan({
      kind: 'silenceRange',
      startSec: 1,
      endSec: 2,
      source: 'utterance',
      labelKey: 'silence',
      transcriptId: 't@1/f',
      chunkId: 't@1/f#2',
    });
    expect(res.ok).toBe(true);
    if (res.ok && res.plan.kind !== 'insertSilence') {
      expect(res.plan.chunkId).toBe('t@1/f#2');
      expect(res.plan.transcriptId).toBe('t@1/f');
    }
  });
});
