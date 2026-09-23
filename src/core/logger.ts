/**
 * The ONLY module allowed to touch the console (ESLint override in
 * eslint.config.js). Keeps a bounded, redacted ring of recent entries for
 * bug-report export — no network telemetry (privacy golden rule).
 */
import { MAX_LOG_ENTRIES } from './constants';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  time: number;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

export type Sink = (level: LogLevel, message: string, context?: Record<string, unknown>) => void;

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;
  getRecent(): readonly LogEntry[];
  exportJson(): string;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function consoleSink(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const method = console[level] ?? console.log;
  if (context) method(message, context);
  else method(message);
}

export interface LoggerOptions {
  level?: LogLevel;
  sink?: Sink;
  maxEntries?: number;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  let level: LogLevel = options.level ?? 'info';
  const sink = options.sink ?? consoleSink;
  const maxEntries = options.maxEntries ?? MAX_LOG_ENTRIES;
  let ring: LogEntry[] = [];

  function record(levelNow: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (LEVEL_ORDER[levelNow] < LEVEL_ORDER[level]) return;
    const entry: LogEntry = { time: Date.now(), level: levelNow, message };
    if (context) entry.context = context;
    sink(levelNow, entry.message, entry.context);
    ring.push(entry);
    if (ring.length > maxEntries) ring = ring.slice(ring.length - maxEntries);
  }

  return {
    debug: (message, context) => record('debug', message, context),
    info: (message, context) => record('info', message, context),
    warn: (message, context) => record('warn', message, context),
    error: (message, context) => record('error', message, context),
    setLevel: (next) => {
      level = next;
    },
    getLevel: () => level,
    getRecent: (): readonly LogEntry[] => [...ring],
    exportJson: () =>
      JSON.stringify({ exportedAt: new Date().toISOString(), entries: [...ring] }, null, 2),
  };
}
