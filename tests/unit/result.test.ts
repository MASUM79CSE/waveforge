import { describe, expect, test } from 'vitest';
import { fromThrowable, mapResult, ok, type Result } from '../../src/core/result';
import { WaveForgeError } from '../../src/core/errors';

describe('result helpers', () => {
  test('ok wraps data success-fully', () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBe(42);
  });

  test('err carries a typed WaveForgeError', () => {
    const e = new WaveForgeError('WF-E102');
    const r: Result<number> = { ok: false, error: e };
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('WF-E102');
  });

  test('mapResult transforms success and leaves failure untouched', () => {
    const doubled = mapResult(ok(21), (n) => n * 2);
    expect(doubled.ok).toBe(true);
    if (doubled.ok) expect(doubled.data).toBe(42);

    const failure = mapResult(
      { ok: false, error: new WaveForgeError('WF-E101') } as Result<number>,
      (n) => n * 2,
    );
    expect(failure.ok).toBe(false);
  });

  test('fromThrowable converts a throwing function into a Result', () => {
    const good = fromThrowable(() => 'value');
    expect(good.ok).toBe(true);

    const bad = fromThrowable((): string => {
      throw new Error('boom');
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error.code).toBe('WF-E601');
      expect(bad.error.cause).toBeInstanceOf(Error);
    }
  });

  test('fromThrowable treats non-Error throws as unexpected too', () => {
    const bad = fromThrowable(() => {
      throw 'string failure';
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe('WF-E601');
  });
});
