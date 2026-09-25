/**
 * R4 — punch in/out window math (docs/recording-plan.md). Pure: a
 * selection + pre-roll + optional count-in become the playback window and
 * punch frames. Non-destructive by contract — the replaced material lives
 * in history (undo restores it).
 */
import { clickSchedule, type ClickEvent } from './metronome';

export interface PunchPlan {
  /** Playback start (clamped ≥ 0): punchIn − preRoll − countIn headroom. */
  playFromFrame: number;
  /** Recording starts here (the selection start). */
  punchInFrame: number;
  /** Recording stops here (the selection end). */
  punchOutFrame: number;
  /** Seconds of count-in clicks BEFORE playback begins (negative clicks). */
  countInSec: number;
  /** Count-in + pre-roll click events (relative to the roll moment). */
  clicks: ClickEvent[];
}

export function punchPlan(opts: {
  start: number;
  end: number;
  rate: number;
  preRollSec: number;
  countInBars?: number;
  bpm?: number;
  beatsPerBar?: number;
}): PunchPlan {
  if (!(opts.end > opts.start)) {
    throw new Error('punchPlan: selection is empty (end must be > start)');
  }
  const bpm = opts.bpm ?? 120;
  const beatsPerBar = opts.beatsPerBar ?? 4;
  const beatSec = 60 / Math.min(240, Math.max(40, bpm));
  const countInSec = (opts.countInBars ?? 0) * beatsPerBar * beatSec;
  const punchIn = opts.start;
  const punchOut = opts.end;
  const playFrom = Math.max(0, punchIn - Math.round(opts.preRollSec * opts.rate));
  // count-in: the seamless grid clipped to the lead-in — "1-2-3-4 → GO on
  // the downbeat" (clicks in [-countInSec, 0), recording starts at zero)
  const clicks =
    countInSec > 0
      ? clickSchedule({ bpm, bars: opts.countInBars ?? 0, beatsPerBar, preRollSec: countInSec }).filter(
          (c) => c.atSec < 0,
        )
      : [];
  return { playFromFrame: playFrom, punchInFrame: punchIn, punchOutFrame: punchOut, countInSec, clicks };
}
