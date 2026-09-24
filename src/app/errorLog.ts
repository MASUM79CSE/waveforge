/**
 * Local in-memory error log (Build Plan §6.3 #8).
 *
 * Last 100 errors kept in a ring buffer for user-initiated bug reports
 * (export to JSON via the doctor panel). **No network telemetry** — the
 * privacy golden rule: audio and diagnostics never leave the device
 * unless the user explicitly exports and sends the file themselves.
 */

export interface ErrorLogEntry {
  message: string;
  /** short classification, e.g. 'TypeError' or 'unhandledrejection' */
  detail?: string;
  stack?: string;
  /** Date.now() at capture */
  time: number;
}

import { Brand } from '../brand';

export const ERROR_LOG_CAP = 100;

const ring: ErrorLogEntry[] = [];

export function pushError(entry: ErrorLogEntry): void {
  ring.push(entry);
  if (ring.length > ERROR_LOG_CAP) ring.splice(0, ring.length - ERROR_LOG_CAP);
}

/** Oldest-first copy of the ring. */
export function getErrorLog(): ErrorLogEntry[] {
  return ring.slice();
}

export function clearErrorLog(): void {
  ring.length = 0;
}

/** JSON blob for the doctor panel's export button (app header + entries). */
export function exportErrorLogJson(): string {
  return JSON.stringify(
    {
      app: 'WaveForge',
      version: Brand.version,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      entries: ring.map((e) => ({ ...e })),
    },
    null,
    2,
  );
}
