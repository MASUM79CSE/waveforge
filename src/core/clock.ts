/**
 * Clock formatters for the Control Bar v2 switchable clock (CB-2.2).
 * Pure — unit tested (tests/unit/clock.test.ts). Contracts mirror
 * core/format.ts: truncate (floor — never display time that does not
 * exist) and collapse invalid input to a zero-equivalent string.
 */

function grouping(n: number): string {
  // en-style thousands grouping, deterministic (no locale runtime lookups)
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Whole sample count at the document rate: "408,895". */
export function fmtSamples(sec: number, sampleRate: number): string {
  if (!Number.isFinite(sec) || sec < 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return '0';
  }
  return grouping(Math.floor(sec * sampleRate));
}

/**
 * Musical position as 1-based "bar.beat.sixteenth" (4 sixteenths per beat,
 * 4/4 by default — the engine detects no time signature, so the signature is
 * a parameter and the UI labels the assumption; see implementation plan §1).
 * Non-finite/negative time or non-positive tempo collapses to "1.1.1".
 */
export function fmtBarsBeats(
  sec: number,
  bpm: number,
  beatsPerBar = 4,
  sixteenthsPerBeat = 4,
): string {
  if (
    !Number.isFinite(sec) || sec < 0 ||
    !Number.isFinite(bpm) || bpm <= 0 ||
    !Number.isFinite(beatsPerBar) || beatsPerBar <= 0
  ) {
    return '1.1.1';
  }
  const totalBeats = (sec * bpm) / 60;
  const bar = Math.floor(totalBeats / beatsPerBar) + 1;
  const beat = Math.floor(totalBeats % beatsPerBar) + 1;
  const sixteenth = Math.floor((totalBeats * sixteenthsPerBeat) % sixteenthsPerBeat) + 1;
  return `${bar}.${beat}.${sixteenth}`;
}
