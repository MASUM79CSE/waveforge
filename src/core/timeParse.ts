/**
 * Time-field parsing/formatting (UX-5.1, pure) — the four selection-field
 * display formats from the interaction spec: seconds `83.456`, m:ss.mmm
 * `1:23.456` (default), h:mm:ss.mmm, and integer samples at the document
 * rate. Freestyle input; Enter commits, Escape reverts (component rule);
 * invalid input never commits.
 */

export type TimeFieldMode = 'S' | 'MS' | 'HMS' | 'SMP';

export type ParseResult = { ok: true; seconds: number | null } | { ok: false };

const MS_RE = /^(\d+):([0-5]?\d)(?:\.(\d{1,3}))?$/;
const HMS_RE = /^(\d+):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?$/;
const SEC_RE = /^\d+(?:\.\d{1,3})?$/;

function msToSeconds(ms: string | undefined): number {
  if (!ms) return 0;
  const pad = (ms + '00').slice(0, 3);
  return Number(pad) / 1000;
}

export function parseTimeField(raw: string, mode: TimeFieldMode, sampleRate: number): ParseResult {
  const input = raw.trim();
  if (input === '') return { ok: true, seconds: null }; // clear
  if (!sampleRate || sampleRate <= 0) return { ok: false };

  if (mode === 'SMP') {
    if (!/^\d+$/.test(input)) return { ok: false };
    return { ok: true, seconds: Number(input) / sampleRate };
  }

  if (mode === 'S') {
    if (!SEC_RE.test(input)) return { ok: false };
    return { ok: true, seconds: Number(input) };
  }

  if (mode === 'MS') {
    // bare seconds stay valid in time modes (colons optional)
    if (SEC_RE.test(input)) return { ok: true, seconds: Number(input) };
    const m = MS_RE.exec(input);
    if (!m) return { ok: false };
    return { ok: true, seconds: Number(m[1]) * 60 + Number(m[2]) + msToSeconds(m[3]) };
  }

  // HMS
  if (SEC_RE.test(input)) return { ok: true, seconds: Number(input) };
  const hms = HMS_RE.exec(input);
  if (hms) {
    return {
      ok: true,
      seconds: Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]) + msToSeconds(hms[4]),
    };
  }
  const ms = MS_RE.exec(input); // m:ss.mmm tolerated in HMS mode too
  if (ms) return { ok: true, seconds: Number(ms[1]) * 60 + Number(ms[2]) + msToSeconds(ms[3]) };
  return { ok: false };
}

export function formatTimeField(seconds: number, mode: TimeFieldMode, sampleRate: number): string {
  const t = Math.max(0, seconds);
  const ms = Math.round((t - Math.floor(t)) * 1000);
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0');
  const milli = ms === 1000 ? 0 : ms; // 0.9996 rounding guard

  switch (mode) {
    case 'S':
      return `${Math.floor(t)}.${pad(milli, 3)}`;
    case 'MS': {
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60);
      return `${m}:${pad(s)}.${pad(milli, 3)}`;
    }
    case 'HMS': {
      const h = Math.floor(t / 3600);
      const m = Math.floor((t % 3600) / 60);
      const s = Math.floor(t % 60);
      return `${h}:${pad(m)}:${pad(s)}.${pad(milli, 3)}`;
    }
    case 'SMP':
      return String(Math.round(t * sampleRate));
  }
}
