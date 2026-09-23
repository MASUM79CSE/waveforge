/**
 * Typed error framework (Build Plan §6.1).
 *
 * Every expected failure carries an `ErrorCode`; the code doubles as the i18n
 * key (`errors.WF-E102`). Context payloads are redacted before logging —
 * never audio bytes, never full paths.
 */

export const ERROR_CODES = [
  'WF-E101', // unsupported file type/extension
  'WF-E102', // decode failed (corrupt/unsupported)
  'WF-E103', // file beyond memory guard
  'WF-E201', // URL fetch network error
  'WF-E202', // CORS blocked
  'WF-E301', // AudioContext blocked by autoplay policy
  'WF-E302', // AudioWorklet load failed
  'WF-E401', // draft save quota exceeded
  'WF-E402', // draft record corrupt
  'WF-E501', // worker crashed
  'WF-E601', // unexpected internal error
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface WaveForgeErrorOptions {
  context?: Record<string, unknown>;
  cause?: unknown;
}

export class WaveForgeError extends Error {
  readonly code: ErrorCode;
  readonly context?: Record<string, unknown>;

  constructor(code: ErrorCode, message?: string, options?: WaveForgeErrorOptions) {
    super(message ?? code, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'WaveForgeError';
    this.code = code;
    if (options?.context) this.context = options.context;
  }
}

export function makeError(
  code: ErrorCode,
  context?: Record<string, unknown>,
  cause?: unknown,
): WaveForgeError {
  return new WaveForgeError(code, undefined, { context, cause });
}

export function isWaveForgeError(error: unknown): error is WaveForgeError {
  return error instanceof WaveForgeError;
}

/** i18n key for a code — components never render raw messages. */
export function userMessageKey(code: ErrorCode): string {
  return `errors.${code}`;
}

/** Safe narrowing for unknown throws (ECC TS rule). */
export function getErrorMessage(error: unknown): string {
  if (error === null || error === undefined) return 'Unexpected error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

const SENSITIVE_KEY = /pass(word)?|token|secret|authorization|cookie|api[-_]?key/i;
const MAX_VALUE_LENGTH = 64;

/** Basename + truncate; credential-like keys become "[redacted]". */
export function redactContext(context: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = '[redacted]';
      continue;
    }
    if (typeof value === 'string') {
      let s = value;
      if (s.includes('/') || s.includes('\\')) {
        s = s.split(/[\\/]/).pop() ?? s;
      }
      if (s.length > MAX_VALUE_LENGTH) {
        s = `${s.slice(0, MAX_VALUE_LENGTH - 3)}…`;
      }
      out[key] = s;
      continue;
    }
    out[key] = value;
  }
  return out;
}
