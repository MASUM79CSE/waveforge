/**
 * Transport position math — pure (ADR 001 policy: math out of classes).
 * The AudioEngine derives a drift-free playhead from the AudioContext clock
 * through these functions.
 */
export interface LoopRegion {
  start: number;
  end: number;
}

/** Playback position at context time `nowCtx`, honoring an optional loop region. */
export function positionAt(
  offset: number,
  startedAtCtx: number,
  nowCtx: number,
  loop: LoopRegion | null,
  duration: number,
): number {
  let p = offset + (nowCtx - startedAtCtx);
  if (loop && loop.end > loop.start && p > loop.end) {
    p = loop.start + ((p - loop.start) % (loop.end - loop.start));
  }
  return Math.min(p, duration);
}

export function clampSeek(t: number, duration: number): number {
  return Math.max(0, Math.min(t, duration));
}
