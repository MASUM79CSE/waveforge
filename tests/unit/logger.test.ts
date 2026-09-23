import { describe, expect, test } from 'vitest';
import { createLogger, type LogEntry, type Sink } from '../../src/core/logger';

function captureSink(): { sink: Sink; entries: Array<[string, string, unknown?]> } {
  const entries: Array<[string, string, unknown?]> = [];
  return { sink: (level, message, ctx) => entries.push([level, message, ctx]), entries };
}

describe('createLogger', () => {
  test('emits entries at or above the configured level', () => {
    const { sink, entries } = captureSink();
    const log = createLogger({ level: 'info', sink });

    log.debug('hidden');
    log.info('shown');
    log.error('urgent');

    expect(entries.map((e) => e[1])).toEqual(['shown', 'urgent']);
  });

  test('keeps a bounded ring of recent entries', () => {
    const { sink } = captureSink();
    const log = createLogger({ level: 'info', sink, maxEntries: 5 });

    for (let i = 0; i < 12; ++i) log.info(`entry-${i}`);

    const recent = log.getRecent();
    expect(recent.length).toBe(5);
    expect(recent[4]?.message).toBe('entry-11');
    expect(recent[0]?.message).toBe('entry-7');
  });

  test('getRecent returns a defensive copy (immutability rule)', () => {
    const { sink } = captureSink();
    const log = createLogger({ level: 'info', sink });
    log.info('kept');

    const snapshot: readonly LogEntry[] = log.getRecent();
    (snapshot as LogEntry[]).push({ time: 0, level: 'info', message: 'injected' });

    expect(log.getRecent().length).toBe(1);
  });

  test('exportJson serializes the ring for bug reports', () => {
    const { sink } = captureSink();
    const log = createLogger({ level: 'info', sink });
    log.warn('watch out');

    const parsed = JSON.parse(log.exportJson()) as { entries: LogEntry[] };
    expect(parsed.entries.length).toBe(1);
    expect(parsed.entries[0]?.message).toBe('watch out');
  });

  test('level can be raised and lowered at runtime', () => {
    const { sink, entries } = captureSink();
    const log = createLogger({ level: 'error', sink });

    log.warn('hidden');
    log.setLevel('warn');
    log.warn('visible');

    expect(entries.map((e) => e[1])).toEqual(['visible']);
    expect(log.getLevel()).toBe('warn');
  });
});
