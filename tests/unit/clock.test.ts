/**
 * CB-2.2 — clock formatters for the switchable Control Bar v2 clock
 * (RED first: this file preceded src/core/clock.ts).
 *
 * Contracts (mirror core/format.ts conventions):
 *  - truncation: never display time that does not exist (floor, never round)
 *  - invalid input (NaN/±Infinity/negative) → zero-equivalent string
 *  - fmtSamples groups thousands for readability (en digits, deterministic)
 *  - fmtBarsBeats is 1-based bar.beat.sixteenth; beats-per-bar parameterisable;
 *    non-positive/invalid bpm → '1.1.1'
 */
import { describe, expect, it } from 'vitest';
import { fmtSamples, fmtBarsBeats, parseClockInput } from '../../src/core/clock';

describe('parseClockInput (CB-3.1 selection fields)', () => {
  it('parses plain seconds', () => {
    expect(parseClockInput('90')).toBe(90);
    expect(parseClockInput('0.5')).toBe(0.5);
    expect(parseClockInput(' 12.25 ')).toBe(12.25);
  });

  it('parses m:ss and m:ss.mmm forms', () => {
    expect(parseClockInput('1:30')).toBe(90);
    expect(parseClockInput('0:09.272')).toBe(9.272);
    expect(parseClockInput('12:00.500')).toBe(720.5);
    expect(parseClockInput('2:00:01')).toBe(7201); // h:mm:ss tolerated
  });

  it('rejects garbage, negatives and partial numbers with null', () => {
    expect(parseClockInput('abc')).toBe(null);
    expect(parseClockInput('')).toBe(null);
    expect(parseClockInput('-1')).toBe(null);
    expect(parseClockInput('1:')).toBe(null);
    expect(parseClockInput('1:2:')).toBe(null);
  });

  it('accepts full-minute forms without seconds field', () => {
    expect(parseClockInput('3:07')).toBe(187);
  });
});


describe('fmtSamples', () => {
  it('zero and invalid inputs collapse to "0"', () => {
    expect(fmtSamples(0, 44100)).toBe('0');
    expect(fmtSamples(-0.5, 44100)).toBe('0');
    expect(fmtSamples(Number.NaN, 44100)).toBe('0');
    expect(fmtSamples(Number.POSITIVE_INFINITY, 44100)).toBe('0');
    expect(fmtSamples(1, Number.NaN)).toBe('0');
  });

  it('truncates toward zero — never displays samples that do not exist', () => {
    // 0.5 s at 44100 Hz = 22050 exactly
    expect(fmtSamples(0.5, 44100)).toBe('22,050');
    // 0.0000105 s → 0.463 samples → floor to 0
    expect(fmtSamples(0.0000105, 44100)).toBe('0');
    // 22050.9 samples worth → 22050
    expect(fmtSamples(22050.9 / 44100, 44100)).toBe('22,050');
  });

  it('groups thousands deterministically', () => {
    expect(fmtSamples(1, 44100)).toBe('44,100');
    expect(fmtSamples(9.272, 44100)).toBe('408,895');
    expect(fmtSamples(600, 48000)).toBe('28,800,000');
  });

  it('handles a 96 kHz rate', () => {
    expect(fmtSamples(0.25, 96000)).toBe('24,000');
  });
});

describe('fmtBarsBeats', () => {
  it('zero and invalid inputs collapse to the downbeat "1.1.1"', () => {
    expect(fmtBarsBeats(0, 120)).toBe('1.1.1');
    expect(fmtBarsBeats(-1, 120)).toBe('1.1.1');
    expect(fmtBarsBeats(Number.NaN, 120)).toBe('1.1.1');
    expect(fmtBarsBeats(1, 0)).toBe('1.1.1');
    expect(fmtBarsBeats(1, Number.NaN)).toBe('1.1.1');
  });

  it('maps seconds to bar.beat.sixteenth at 120 BPM 4/4', () => {
    // 2 s = exactly beat 5 → bar 2 beat 1 sixteenth 1
    expect(fmtBarsBeats(2, 120)).toBe('2.1.1');
    // 9.272 s @ 120 = 18.544 beats → bar 5, beat 3, sixteenth 3
    expect(fmtBarsBeats(9.272, 120)).toBe('5.3.3');
  });

  it('truncates partial sixteenths', () => {
    // 18.99 beats → bar 5 (beats 16-19), beat floor(2.99)+1 = 3, sixteenth floor(3.996)+1 = 4
    expect(fmtBarsBeats(18.99 * (60 / 120), 120)).toBe('5.3.4');
  });

  it('respects beats-per-bar (3/4 waltz)', () => {
    // 120 BPM 3/4: 3 s = 6 beats = bar 3 beat 1
    expect(fmtBarsBeats(3, 120, 3)).toBe('3.1.1');
  });

  it('handles other tempi (90 BPM)', () => {
    // 4 s @ 90 = 6 beats → bar 2 beat 3 sixteenth 1
    expect(fmtBarsBeats(4, 90)).toBe('2.3.1');
  });
});
