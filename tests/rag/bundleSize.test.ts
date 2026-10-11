import { describe, expect, test } from 'vitest';
import { evaluateSize } from '../../scripts/check-bundle-size.mjs';

describe('bundle size guard (P0.7)', () => {
  test('passes when main gzip is under baseline + tolerance', () => {
    const r = evaluateSize(120_084, 120_084, 2048);
    expect(r.ok).toBe(true);
    expect(r.delta).toBe(0);
    expect(r.limit).toBe(120_084 + 2048);
  });

  test('passes exactly at the limit', () => {
    expect(evaluateSize(120_084 + 2048, 120_084, 2048).ok).toBe(true);
  });

  test('fails one byte over the limit, with the overshoot reported', () => {
    const r = evaluateSize(120_084 + 2049, 120_084, 2048);
    expect(r.ok).toBe(false);
    expect(r.overshoot).toBe(1);
  });

  test('tolerance is configurable', () => {
    expect(evaluateSize(120_084, 120_084, 0).ok).toBe(true);
    expect(evaluateSize(120_084 + 1, 120_084, 0).ok).toBe(false);
  });

  test('rejects negative or non-finite inputs', () => {
    expect(evaluateSize(-1, 120_084, 2048).ok).toBe(false);
    expect(evaluateSize(Number.NaN, 120_084, 2048).ok).toBe(false);
    expect(evaluateSize(100, -5, 2048).ok).toBe(false);
    expect(evaluateSize(100, 120_084, Number.POSITIVE_INFINITY).ok).toBe(false);
  });
});
