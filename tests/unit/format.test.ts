import { describe, expect, test } from 'vitest';
import { fmtBytes, fmtClock, fmtDuration, fmtRuler } from '../../src/core/format';

describe('fmtClock', () => {
  test('formats minutes, seconds and milliseconds', () => {
    expect(fmtClock(187.4216)).toBe('3:07.421');
  });

  test('truncates below the next second (never shows time that does not exist)', () => {
    expect(fmtClock(59.9999)).toBe('0:59.999');
  });

  test('clamps invalid input to zero', () => {
    expect(fmtClock(-3)).toBe('0:00.000');
    expect(fmtClock(Number.NaN)).toBe('0:00.000');
    expect(fmtClock(Number.POSITIVE_INFINITY)).toBe('0:00.000');
  });
});

describe('fmtRuler', () => {
  test('minute-only labels for minute ticks', () => {
    expect(fmtRuler(90, 60)).toBe('1m');
    expect(fmtRuler(300, 120)).toBe('5m');
  });

  test('whole-second labels for coarse ticks', () => {
    expect(fmtRuler(90, 1)).toBe('1:30');
    expect(fmtRuler(125, 5)).toBe('2:05');
  });

  test('sub-second precision follows tick size', () => {
    expect(fmtRuler(90.5, 0.1)).toBe('1:30.5');
    expect(fmtRuler(90.25, 0.01)).toBe('1:30.25');
    expect(fmtRuler(90.125, 0.001)).toBe('1:30.125');
  });
});

describe('fmtBytes', () => {
  test('formats bytes, KB, MB and GB', () => {
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(2048)).toBe('2.0 KB');
    expect(fmtBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(fmtBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.50 GB');
  });
});

describe('fmtDuration', () => {
  test('keeps short durations in seconds', () => {
    expect(fmtDuration(45)).toBe('45.00 s');
  });

  test('switches to minutes above one minute', () => {
    expect(fmtDuration(90)).toBe('1m 30s');
    expect(fmtDuration(125.4)).toBe('2m 05s');
  });
});
