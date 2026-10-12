/**
 * P2.4 — timeline mapper (pure). Transcript segments live on the
 * transcribed source's model/16 kHz timeline; the document needs them
 * at the source clip's placement. P2 scope: rate-1.0 clips only — the
 * placement is a pure offset. Playback-rate changes on the source clip
 * will extend `TimelinePlacement` (a mapping function), NOT change
 * these call sites.
 *
 * Mapping is monotone (order-preserving) and clamped to
 * [0, documentDurationSec]: ASR timestamps can overshoot the audio end
 * slightly; segments beyond the document clamp to its edge.
 */
import type { TranscriptSegment } from './model';

export interface TimelinePlacement {
  /** Document time (s) where the transcribed source begins. */
  offsetSec: number;
  /** Document duration (s) — mapping clamps to [0, this]. */
  documentDurationSec: number;
}

export interface MappedSegment {
  start: number;
  end: number;
  text: string;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Model-time → document-time (monotone, clamped). */
export function modelToDocumentTime(t: number, p: TimelinePlacement): number {
  return clamp(p.offsetSec + t, 0, p.documentDurationSec);
}

/** Inverse of `modelToDocumentTime` where the forward map was unclamped. */
export function documentToModelTime(t: number, p: TimelinePlacement): number {
  return clamp(t - p.offsetSec, 0, p.documentDurationSec);
}

/**
 * Map a segment list into document time. Defensive about ASR output
 * order: segments are sorted by start (stable) before mapping, so the
 * result is always non-decreasing. Zero-length segments survive as
 * zero-length (clamped) so nothing silently disappears.
 */
export function mapSegments(segments: readonly TranscriptSegment[], p: TimelinePlacement): MappedSegment[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  return sorted.map((s) => ({
    start: modelToDocumentTime(s.start, p),
    end: modelToDocumentTime(s.end, p),
    text: s.text,
  }));
}

/**
 * Document-time (s) of the segment active at `t`, or null. Returns the
 * FIRST match — stitched transcripts (P2.6) are deduped upstream.
 */
export function activeSegmentAt(segments: readonly MappedSegment[], t: number): MappedSegment | null {
  for (const s of segments) {
    if (t >= s.start && t < s.end) return s;
  }
  return null;
}
