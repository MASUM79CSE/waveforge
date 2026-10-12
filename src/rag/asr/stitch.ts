/**
 * P2.6 — window stitching (pure). The feeder (P2.2) emits overlapping
 * 30 s windows; the ASR (P2.5) returns segment lists per window with
 * window-LOCAL timestamps. Stitching shifts every window's segments to
 * the global timeline and merges the overlap:
 *
 *  - invalid segments (end < start, negative starts clamped) are
 *    sanitized first — ASR output is untrusted data;
 *  - near-duplicates across the boundary (start within `TOL_S` AND
 *    compatible text) are collapsed, keeping the earlier window's copy
 *    — compatible = equal after normalization, or one a prefix of the
 *    other (Whisper repeats are usually truncated variants);
 *  - everything else is kept verbatim (no cross-window text rewriting);
 *
 * Output is sorted by start and deterministic: same input → same
 * output, always.
 */
import type { TranscriptSegment } from '../transcripts/model';

/** Boundary-duplicate tolerance in seconds (plan: ≤ 200 ms). */
export const DUP_TOLERANCE_S = 0.2;

/** A window's ASR result: where it sits on the timeline + local segments. */
export interface WindowSegments {
  /** Window start on the 16 kHz timeline (seconds) — feeder's `t0`. */
  t0Sec: number;
  /** Segments with timestamps relative to the window start. */
  segments: readonly TranscriptSegment[];
}

/** Collapse whitespace, trim, lowercase. */
function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function textCompatible(a: string, b: string): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (na === nb) return true;
  if (na.length === 0 || nb.length === 0) return true; // empty ≈ anything
  return na.startsWith(nb) || nb.startsWith(na);
}

function isNearDuplicate(a: TranscriptSegment, b: TranscriptSegment): boolean {
  return Math.abs(a.start - b.start) <= DUP_TOLERANCE_S && textCompatible(a.text, b.text);
}

/** Sanitize one window's local segments and shift to global time. */
function toGlobal(w: WindowSegments): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  for (const s of w.segments) {
    const start = Math.max(0, s.start);
    const end = Math.max(start, s.end); // drop inverted ends to zero-length
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    out.push({ start: start + w.t0Sec, end: end + w.t0Sec, text: s.text });
  }
  return out;
}

/**
 * Merge per-window segment lists into one global, sorted segment list.
 * Windows may arrive in any order (they are placed by `t0Sec`), but the
 * dedupe keeps the EARLIER window's copy, so this is order-independent
 * for well-formed window sets.
 */
export function stitchWindows(windows: readonly WindowSegments[]): TranscriptSegment[] {
  if (windows.length === 0) return [];
  // shift all to global time, then order by window placement
  const all = windows.flatMap(toGlobal);
  all.sort((a, b) => a.start - b.start || a.end - b.end || (a.text < b.text ? -1 : 1));

  const out: TranscriptSegment[] = [];
  for (const seg of all) {
    const prev = out[out.length - 1];
    if (prev && isNearDuplicate(prev, seg)) continue; // boundary duplicate
    out.push(seg);
  }
  return out;
}
