/** Time and size formatting helpers (pure — unit tested). */

/** "3:07.421" transport clock. Truncates: never displays time that does not exist. */
export function fmtClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00.000';
  const totalMs = Math.trunc(sec * 1000);
  const m = Math.floor(totalMs / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/** Ruler label; precision adapts to the tick interval. */
export function fmtRuler(sec: number, stepSec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  if (stepSec >= 60) return `${m}m`;
  if (stepSec >= 1) return `${m}:${String(Math.floor(s)).padStart(2, '0')}`;
  const decimals = stepSec >= 0.1 ? 1 : stepSec >= 0.01 ? 2 : 3;
  return `${m}:${s.toFixed(decimals).padStart(3 + decimals, '0')}`;
}

/** "1.5 MB" style byte size. */
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Human duration: "45.00 s" below a minute, "2m 05s" above. */
export function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec.toFixed(2)} s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${String(s).padStart(2, '0')}s`;
}
