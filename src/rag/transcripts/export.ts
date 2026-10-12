/**
 * P2.9 — transcript export serializers (pure). SRT / VTT timecodes use
 * the exact interchange formats (`HH:MM:SS,mmm` with comma for SRT,
 * `HH:MM:SS.mmm` with dot for VTT, VTT prefixed by the `WEBVTT` header
 * line). TXT is one plain-text line per segment (no timestamps — the
 * plain-text reading copy; newlines inside a segment are normalized to
 * spaces so the one-line-per-segment structure holds).
 *
 * Untrusted-input discipline: ASR times are clamped (start ≥ 0, end ≥
 * start, non-finite dropped); text is emitted verbatim except `\r`
 * stripping — every consumer here renders/plains it as text.
 */
import type { TranscriptSegment } from './model';

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/** SRT timecode: HH:MM:SS,mmm (comma decimal separator). */
export function fmtSrtTime(sec: number): string {
  const s = Math.max(0, sec);
  const totalMs = Math.round(s * 1000);
  const ms = totalMs % 1000;
  const totalSec = (totalMs - ms) / 1000;
  const ss = totalSec % 60;
  const mm = ((totalSec - ss) / 60) % 60;
  const hh = Math.floor(totalSec / 3600);
  return `${pad(hh, 2)}:${pad(mm, 2)}:${pad(ss, 2)},${pad(ms, 3)}`;
}

/** VTT timecode: HH:MM:SS.mmm (dot decimal separator). */
export function fmtVttTime(sec: number): string {
  return fmtSrtTime(sec).replace(',', '.');
}

/** Clean one text payload: strip CR, drop control chars except \n/\t. */
function cleanText(text: string): string {
  return text.replace(/\r/g, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

/** Sanitize + sort segments for export (deterministic order). */
function prepared(segments: readonly TranscriptSegment[]): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  for (const s of segments) {
    if (!Number.isFinite(s.start) || !Number.isFinite(s.end)) continue;
    const start = Math.max(0, s.start);
    out.push({ start, end: Math.max(start, s.end), text: cleanText(s.text) });
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

/** SRT: numbered cue blocks separated by a blank line. */
export function toSrt(segments: readonly TranscriptSegment[]): string {
  const blocks = prepared(segments).map(
    (s, i) => `${i + 1}\n${fmtSrtTime(s.start)} --> ${fmtSrtTime(s.end)}\n${s.text}`,
  );
  return blocks.length > 0 ? blocks.join('\n\n') + '\n' : '';
}

/** WebVTT: header line, blank line, cue blocks (blank-line separated). */
export function toVtt(segments: readonly TranscriptSegment[]): string {
  const blocks = prepared(segments).map(
    (s) => `${fmtVttTime(s.start)} --> ${fmtVttTime(s.end)}\n${s.text}`,
  );
  return 'WEBVTT\n' + (blocks.length > 0 ? '\n' + blocks.join('\n\n') + '\n' : '\n');
}

/** Plain text: one line per segment (internal newlines → spaces). */
export function toTxt(segments: readonly TranscriptSegment[]): string {
  const lines = prepared(segments)
    .map((s) => s.text.replace(/\n+/g, ' ').trim())
    .filter((l) => l.length > 0);
  return lines.length > 0 ? lines.join('\n') + '\n' : '';
}
