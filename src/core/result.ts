/**
 * Result envelope for boundary operations (Build Plan §6.2): expected
 * failures are values, not throws. Mirrors the ECC API response format.
 */
import { makeError, WaveForgeError } from './errors';

export type Result<T> = { ok: true; data: T } | { ok: false; error: WaveForgeError };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err<T = never>(error: WaveForgeError): Result<T> {
  return { ok: false, error };
}

export function mapResult<T, U>(result: Result<T>, fn: (data: T) => U): Result<U> {
  return result.ok ? ok(fn(result.data)) : result;
}

/** Runs a throwing function, converting any throw into `WF-E601`. */
export function fromThrowable<T>(fn: () => T): Result<T> {
  try {
    return ok(fn());
  } catch (thrown: unknown) {
    return err(makeError('WF-E601', undefined, thrown));
  }
}
