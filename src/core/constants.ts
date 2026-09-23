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
