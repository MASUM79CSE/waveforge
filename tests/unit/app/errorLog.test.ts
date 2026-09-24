import { describe, expect, beforeEach, test } from 'vitest';
import {
  pushError,
  getErrorLog,
  clearErrorLog,
  exportErrorLogJson,
  ERROR_LOG_CAP,
} from '../../../src/app/errorLog';

describe('M7 §6.3 #8: local error log ring (no network telemetry)', () => {
  beforeEach(() => clearErrorLog());

  test('push + get returns entries newest-last, capped at 100', () => {
    for (let i = 0; i < ERROR_LOG_CAP + 25; ++i) {
      pushError({ message: `err-${i}`, time: 1000 + i });
    }
    const log = getErrorLog();
    expect(log).toHaveLength(ERROR_LOG_CAP);
    // oldest entries evicted: first kept is err-25, last is err-124
    expect(log[0]!.message).toBe('err-25');
    expect(log[log.length - 1]!.message).toBe('err-124');
  });

  test('entry shape: message, optional detail/stack, time', () => {
    pushError({ message: 'boom', detail: 'TypeError', stack: 'at x', time: 42 });
    const [e] = getErrorLog();
    expect(e).toMatchObject({ message: 'boom', detail: 'TypeError', stack: 'at x', time: 42 });
    pushError({ message: 'minimal', time: 43 });
    const [, e2] = getErrorLog();
    expect(e2).toEqual({ message: 'minimal', time: 43 });
  });

  test('export JSON: version header + entries array, stable field order', () => {
    pushError({ message: 'a', time: 1 });
    const parsed = JSON.parse(exportErrorLogJson()) as {
      app: string;
      version: string;
      userAgent: string;
      entries: Array<{ message: string; time: number }>;
    };
    expect(parsed.app).toBe('WaveForge');
    expect(typeof parsed.version).toBe('string');
    expect(typeof parsed.userAgent).toBe('string');
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]).toEqual({ message: 'a', time: 1 });
  });

  test('clear empties the ring', () => {
    pushError({ message: 'x', time: 1 });
    clearErrorLog();
    expect(getErrorLog()).toHaveLength(0);
  });
});
