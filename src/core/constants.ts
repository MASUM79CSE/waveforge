/** Cross-cutting constants. No magic numbers elsewhere (ECC style gate). */

/** Storage guard for a single audio file before decoding (configurable later). */
export const DEFAULT_MAX_FILE_BYTES = 512 * 1024 * 1024; // 512 MB

/** Logger ring buffer size (kept for bug-report export). */
export const MAX_LOG_ENTRIES = 100;

/** Toast auto-dismiss timings. */
export const TOAST_INFO_MS = 3500;
export const TOAST_ERROR_MS = 6000;

/** localStorage namespace for user settings (M6+). */
export const STORAGE_PREFIX = 'waveforge';

/** Editing limits & defaults (M2). */
export const GAIN_MIN_DB = -60;
export const GAIN_MAX_DB = 24;
export const NORMALIZE_TARGET_DB = -0.1;
export const SILENCE_THRESHOLD_DB = -50;
export const SILENCE_MIN_MS = 100;
export const ZERO_CROSS_RADIUS_S = 0.008;
export const HISTORY_MAX_BYTES = 256 * 1024 * 1024;
export const HISTORY_MIN_KEEP = 10;

/** Effects internals (M3) — numeric boundaries per ADR 005. */
export const FX_CURVE_SAMPLES = 44100;
export const FX_REVERB_SEED = 0x574146; // 'WAF' — deterministic IR
export const FX_MIN_TAIL_GAIN = 0.001; // delay repeat cutoff (-60 dB)
export const FX_MAX_FEEDBACK = 0.95;
export const PG_EQ_LOW_HZ = 120;
export const PG_EQ_HIGH_HZ = 3800;
export const GEQ10_Q = 1.41;
export const GEQ20_Q = 2.0;
/** 20 log-spaced bands across 31.25 Hz – 16 kHz (2/3-octave spacing). */
export const GEQ20_HZ = Array.from({ length: 20 }, (_, i) =>
  Math.round(31.25 * Math.pow(512, i / 19) * 100) / 100,
);

/** Recording limits & persistence (M4). */
export const RECORD_MAX_SECONDS = 600;
export const RECORD_SETTINGS_KEY = 'record';
