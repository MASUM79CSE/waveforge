import { describe, expect, it } from 'vitest';
import {
  ANSWER_MIN_CONFIDENCE,
  CALIBRATION,
  assessSufficiency,
  calibrate,
} from '../../../src/rag/ask/sufficiency';

describe('P4.3 sufficiency + calibration', () => {
  it('calibrate is monotonic in the score', () => {
    const scores = [0, 0.005, 0.01, 0.02, 0.03, 0.05, 0.1];
    for (let i = 1; i < scores.length; i++) {
      expect(calibrate(scores[i]!)).toBeGreaterThan(calibrate(scores[i - 1]!));
    }
  });

  it('calibrate hits the fixed anchor points', () => {
    expect(calibrate(CALIBRATION.center)).toBeCloseTo(0.5, 12);
    expect(calibrate(0)).toBeLessThan(0.5);
    expect(calibrate(0.033)).toBeGreaterThan(0.9); // top of the RRF k=60 range
    expect(calibrate(0.016)).toBeLessThan(0.35); // bottom of the range
  });

  it('calibrate output is always in [0,1] and deterministic', () => {
    for (const s of [-1, 0, 0.016, 0.02, 1e9, NaN, Infinity]) {
      const c = calibrate(s);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
      expect(c).toBe(calibrate(s));
    }
  });

  it('zero hits → always insufficient with confidence 0', () => {
    expect(assessSufficiency({ hits: 0, bestScore: 5 })).toEqual({
      decision: 'insufficient',
      confidence: 0,
    });
  });

  it('strong evidence answers; weak evidence is insufficient', () => {
    const strong = assessSufficiency({ hits: 3, bestScore: 0.031 });
    expect(strong.decision).toBe('answer');
    expect(strong.confidence).toBeGreaterThan(0.9);
    const weak = assessSufficiency({ hits: 1, bestScore: 0.0161 });
    expect(weak.decision).toBe('insufficient');
    expect(weak.confidence).toBeLessThan(ANSWER_MIN_CONFIDENCE);
  });

  it('decision flips exactly at the code-fixed threshold', () => {
    const at = assessSufficiency({ hits: 1, bestScore: CALIBRATION.center });
    expect(at.confidence).toBeCloseTo(0.5, 12);
    expect(at.decision).toBe('answer'); // 0.5 ≥ 0.45
    const justBelow = 0.02 - 0.012; // confidence < 0.45
    expect(assessSufficiency({ hits: 1, bestScore: justBelow }).decision).toBe('insufficient');
  });

  it('threshold constant is frozen in code (regression tripwire)', () => {
    expect(ANSWER_MIN_CONFIDENCE).toBe(0.45);
  });

  it('negative scores (degenerate input) never answer', () => {
    expect(assessSufficiency({ hits: 2, bestScore: -0.5 }).decision).toBe('insufficient');
  });
});
