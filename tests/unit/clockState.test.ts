// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * CB-2.2 — clock format state: persistence through the settings boundary,
 * corrupt-value fallback, and the CB-D10 menu model. `clockState`
 * initializes from storage at import time, so each case seeds storage
 * FIRST and imports the module fresh (vi.resetModules + dynamic import).
 * (Characterization/persistence guard — the formatter RED-first lives in
 * clock.test.ts.)
 */

const KEY = 'waveforge.cb2.clockFormat';

async function fresh() {
  vi.resetModules();
  return await import('../../src/app/cb2/clockState');
}

describe('clockState (CB-2.2)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to "time" with empty storage', async () => {
    const m = await fresh();
    expect(m.clockFormat.value).toBe('time');
  });

  it('setClockFormat updates the signal and persists JSON through the boundary', async () => {
    const m = await fresh();
    m.setClockFormat('samples');
    expect(m.clockFormat.value).toBe('samples');
    expect(localStorage.getItem(KEY)).toBe('"samples"');
  });

  it('restores a persisted format at import time', async () => {
    localStorage.setItem(KEY, JSON.stringify('bars'));
    const m = await fresh();
    expect(m.clockFormat.value).toBe('bars');
  });

  it('falls back to "time" on an unknown stored format', async () => {
    localStorage.setItem(KEY, JSON.stringify('furlongs'));
    const m = await fresh();
    expect(m.clockFormat.value).toBe('time');
  });

  it('falls back to "time" on non-JSON garbage', async () => {
    localStorage.setItem(KEY, 'not json');
    const m = await fresh();
    expect(m.clockFormat.value).toBe('time');
  });

  it('CB-D10: the menu model hides bars+beats while the tempo is unknown', async () => {
    const m = await fresh();
    expect(m.clockMenuItems(false).filter((i) => i.show).map((i) => i.id)).toEqual([
      'time',
      'samples',
    ]);
    expect(m.clockMenuItems(true).filter((i) => i.show).map((i) => i.id)).toEqual([
      'time',
      'samples',
      'bars',
    ]);
  });
});
