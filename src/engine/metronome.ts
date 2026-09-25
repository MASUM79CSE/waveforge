/**
 * R2 — metronome click scheduling (docs/recording-plan.md). Pure: given
 * tempo/count-in/pre-roll, produce the click events (accent on downbeats).
 * `preRollSec` continues the grid BACKWARDS before zero so punch pre-roll
 * keeps the beat seamlessly instead of restarting it.
 */

export interface ClickEvent {
  /** Seconds relative to the roll moment (negative = during pre-roll). */
  atSec: number;
  /** Downbeats are brighter. */
  freq: number;
  gain: number;
}

export const CLICK_ACCENT_HZ = 1320;
export const CLICK_BEAT_HZ = 880;
export const CLICK_ACCENT_GAIN = 0.5;
export const CLICK_BEAT_GAIN = 0.32;
export const BPM_MIN = 40;
export const BPM_MAX = 240;

export function clickSchedule(opts: {
  bpm: number;
  bars: number;
  beatsPerBar: number;
  preRollSec: number;
}): ClickEvent[] {
  const bpm = Math.min(BPM_MAX, Math.max(BPM_MIN, opts.bpm));
  const beatSec = 60 / bpm;
  const beatTotal = opts.bars * opts.beatsPerBar;
  const startBeat = -Math.round(opts.preRollSec / beatSec) || 0; // seamless back-grid (-0 → 0)
  const clicks: ClickEvent[] = [];
  for (let beat = startBeat; beat < beatTotal; ++beat) {
    const accent = ((beat % opts.beatsPerBar) + opts.beatsPerBar) % opts.beatsPerBar === 0;
    clicks.push({
      atSec: beat * beatSec,
      freq: accent ? CLICK_ACCENT_HZ : CLICK_BEAT_HZ,
      gain: accent ? CLICK_ACCENT_GAIN : CLICK_BEAT_GAIN,
    });
  }
  return clicks;
}
