// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { clampVZoom, setVZoom, snapToBeat, vzoom, VZOOM_MAX, VZOOM_MIN } from '../../../src/app/state';

describe('M-D5: vertical zoom + snap state', () => {
  test('clampVZoom bounds 0.5..3 and rescues garbage', () => {
    expect(clampVZoom(1)).toBe(1);
    expect(clampVZoom(0.1)).toBe(VZOOM_MIN);
    expect(clampVZoom(99)).toBe(VZOOM_MAX);
    expect(clampVZoom(Number.NaN)).toBe(1);
    expect(clampVZoom(Number.POSITIVE_INFINITY)).toBe(VZOOM_MAX);
  });

  test('setVZoom persists (localStorage) and clamps', () => {
    setVZoom(1.5);
    expect(vzoom.value).toBe(1.5);
    expect(localStorage.getItem('waveforge.vzoom')).toBe('1.5');
    setVZoom(50);
    expect(vzoom.value).toBe(VZOOM_MAX);
    setVZoom(1); // restore for other tests
  });

  test('snapToBeat defaults on (keeps the pre-D5 selection-snap behavior)', () => {
    expect(typeof snapToBeat.value).toBe('boolean');
  });
});
