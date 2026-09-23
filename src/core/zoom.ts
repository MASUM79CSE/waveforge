/**
 * Zoom / ruler math — pure functions shared by renderer, workers and tests.
 * One definition of "resolution" for the whole app.
 */

/** Standard peak levels (samples per min/max bucket) served by the peaks worker. */
export const PEAK_LEVELS = [16, 64, 256, 1024, 4096, 16384, 65536] as const;

export const MIN_SPP = 0.01;
export const MAX_SPP = 262144;

/**
 * Pick the coarsest standard level whose buckets are still finer than the
 * requested samples-per-pixel, so every screen pixel maps to >= 1 bucket.
 * spp < 1 means sample-level zoom (renderer uses raw sample slices instead).
 */
export function pickPeakLevel(spp: number): number {
  const s = Math.max(1, spp);
  for (const level of PEAK_LEVELS) {
    if (level >= s) return level;
  }
  return PEAK_LEVELS[PEAK_LEVELS.length - 1] ?? 65536;
}

/** Wheel/pinch zoom factor — exponential feel, clamped (AudioMass-style). */
export function zoomFactor(delta: number): number {
  return Math.max(0.2, Math.min(5, Math.pow(1.0025, -delta)));
}

export function clampSpp(spp: number): number {
  return Math.max(MIN_SPP, Math.min(MAX_SPP, spp));
}

/** Nice ruler tick candidates in seconds. */
const TICKS = [
  0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600,
  900, 1800, 3600,
];

/** Largest tick whose on-screen spacing is at least `minPx` at this zoom. */
export function niceTickFor(spp: number, sampleRate: number, minPx = 80): number {
  const minSec = (minPx * spp) / sampleRate;
  for (const tick of TICKS) {
    if (tick >= minSec) return tick;
  }
  return TICKS[TICKS.length - 1] ?? 3600;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
