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
