import { describe, expect, test } from 'vitest';
import { clickSchedule } from '../../src/engine/metronome';
import { advanceHold, CLIP_DB, initialHold } from '../../src/engine/meter';
import { punchPlan } from '../../src/engine/punch';
import { createTakes, discardLast, appendTake, keepTake, type TakesState } from '../../src/engine/takes';

/**
 * R-series pure kernels (docs/recording-plan.md): metronome click
 * scheduling, punch window math, and the session takes reducer.
 */

describe('R2 — clickSchedule', () => {
  test('g1: one 4/4 bar @120 bpm → 4 clicks, 0.5 s apart, downbeat accented', () => {
    const clicks = clickSchedule({ bpm: 120, bars: 1, beatsPerBar: 4, preRollSec: 0 });
    expect(clicks).toHaveLength(4);
    expect(clicks[0]!.atSec).toBe(0);
    expect(clicks[1]!.atSec).toBeCloseTo(0.5, 10);
    expect(clicks[3]!.atSec).toBeCloseTo(1.5, 10);
    expect(clicks[0]!.freq).toBe(1320); // accent
    expect(clicks[1]!.freq).toBe(880);
    expect(clicks[0]!.gain).toBeGreaterThan(clicks[1]!.gain);
  });

  test('g2: pre-roll continues the click grid backwards seamlessly', () => {
    // 2 bars starting 2 s before zero: the grid must not restart at the
    // count-in — clicks land on the pre-roll grid too
    const clicks = clickSchedule({ bpm: 120, bars: 2, beatsPerBar: 4, preRollSec: 2 });
    expect(clicks).toHaveLength(12);
    expect(clicks[0]!.atSec).toBeCloseTo(-2, 10);
    // beat interval grid: every click on a 0.5 s lattice
    for (const c of clicks) expect((c.atSec * 2) % 1).toBeCloseTo(0, 6);
  });

  test('g3: bars 0 → no clicks; bpm clamps to 40..240', () => {
    expect(clickSchedule({ bpm: 120, bars: 0, beatsPerBar: 4, preRollSec: 0 })).toHaveLength(0);
    const fast = clickSchedule({ bpm: 999, bars: 1, beatsPerBar: 4, preRollSec: 0 });
    expect(fast[1]!.atSec).toBeCloseTo(60 / 240, 10); // clamped to 240
    const slow = clickSchedule({ bpm: 5, bars: 1, beatsPerBar: 4, preRollSec: 0 });
    expect(slow[1]!.atSec).toBeCloseTo(60 / 40, 10); // clamped to 40
  });
});

describe('R4 — punchPlan', () => {
  const rate = 48000;
  test('g4: pre-roll playback window; in/out frames exact; playFrom clamps at 0', () => {
    const plan = punchPlan({ start: rate * 3, end: rate * 5, rate, preRollSec: 2 });
    expect(plan.punchInFrame).toBe(rate * 3);
    expect(plan.punchOutFrame).toBe(rate * 5);
    expect(plan.playFromFrame).toBe(rate * 1); // 3 s in − 2 s pre-roll
    expect(plan.countInSec).toBe(0);
  });

  test('g5: count-in extends the lead-in without moving the punch frames', () => {
    const plan = punchPlan({ start: 4800, end: 9600, rate, preRollSec: 1, countInBars: 1, bpm: 120, beatsPerBar: 4 });
    expect(plan.punchInFrame).toBe(4800);
    expect(plan.playFromFrame).toBe(0); // clamped: count-in + preroll precede
    expect(plan.countInSec).toBeCloseTo(2, 10); // 4 beats @120
    expect(plan.clicks.length).toBe(4);
    expect(plan.clicks[0]!.atSec).toBeCloseTo(-2, 10);
  });

  test('g6: empty selection rejected; end ≤ start rejected', () => {
    expect(() => punchPlan({ start: 100, end: 100, rate, preRollSec: 1 })).toThrow();
    expect(() => punchPlan({ start: 200, end: 100, rate, preRollSec: 1 })).toThrow();
  });
});

describe('R3 — takes reducer', () => {
  test('g7: append names Take N with seconds; keep/discard update the state', () => {
    let state: TakesState = createTakes();
    state = appendTake(state, 3.5);
    state = appendTake(state, 2.1);
    expect(state.takes).toHaveLength(2);
    expect(state.takes[0]!.name).toBe('Take 1');
    expect(state.takes[1]!.seconds).toBeCloseTo(2.1, 6);
    state = keepTake(state, state.takes[0]!.id);
    expect(state.takes[0]!.kept).toBe(true);
    state = discardLast(state);
    expect(state.takes).toHaveLength(1);
    expect(state.takes[0]!.kept).toBe(true);
  });

  test('g8: reducer is immutable; discard on empty is a no-op', () => {
    const state = createTakes();
    const next = appendTake(state, 1);
    expect(state.takes).toHaveLength(0);
    expect(next.takes).toHaveLength(1);
    expect(discardLast(state)).toBe(state);
  });
});

describe('R1 — peak-hold + clip latch (advanceHold)', () => {
  test('g9: hold refreshes on louder peaks; decays 0.5 dB/frame after the gate', () => {
    let hold = initialHold();
    hold = advanceHold(hold, -12);
    expect(hold.db).toBe(-12);
    for (let i = 0; i < 50; ++i) hold = advanceHold(hold, -40); // below hold, past gate
    expect(hold.db).toBeLessThan(-12); // decayed past the hold window
    // exact: first 45 frames hold -12, then decays
    let h = initialHold();
    h = advanceHold(h, -12);
    for (let i = 0; i < 45; ++i) h = advanceHold(h, Number.NEGATIVE_INFINITY);
    expect(h.db).toBe(-12);
    h = advanceHold(h, Number.NEGATIVE_INFINITY);
    expect(h.db).toBeCloseTo(-12.5, 6);
  });

  test('g10: clip latches at >= -0.1 dBFS and persists until reset', () => {
    let hold = initialHold();
    hold = advanceHold(hold, CLIP_DB);
    expect(hold.clip).toBe(true);
    for (let i = 0; i < 100; ++i) hold = advanceHold(hold, Number.NEGATIVE_INFINITY);
    expect(hold.clip).toBe(true); // latched
    hold = { ...hold, clip: false }; // resetClipLatch equivalent
    expect(hold.clip).toBe(false);
    expect(initialHold().clip).toBe(false);
  });
});
