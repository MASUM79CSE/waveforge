/**
 * P3.2 — transcript chunker (pure). Groups consecutive transcript
 * segments into retrieval chunks under a character budget, with a
 * 1-segment overlap so answers spanning a boundary stay retrievable.
 *
 * Rules (deterministic):
 *  - a segment is NEVER split — an oversized segment forms its own
 *    oversized chunk rather than being cut;
 *  - chunk.text joins segment texts with a single space, in order;
 *  - after a flush, the last `overlapSegments` segments are carried
 *    into the next chunk (and count against its budget);
 *  - progress is guaranteed: the window start always advances.
 */
import type { TranscriptSegment } from '../transcripts/model';

export interface Chunk {
  /** `${transcriptId}#${index}` — stable for a given transcript. */
  id: string;
  transcriptId: string;
  index: number;
  text: string;
  /** Chunk span on the transcript timeline (model/16 kHz time). */
  startSec: number;
  endSec: number;
  /** Indices into the source segment array (for provenance). */
  segmentIds: number[];
}

export interface ChunkOptions {
  /** Soft budget per chunk (joined text length). Default 800. */
  maxChars?: number;
  /** Segments carried into the next chunk. Default 1. */
  overlapSegments?: number;
}

export function chunkTranscript(
  transcriptId: string,
  segments: readonly TranscriptSegment[],
  opts: ChunkOptions = {},
): Chunk[] {
  const maxChars = Math.max(1, opts.maxChars ?? 800);
  const overlap = Math.max(0, opts.overlapSegments ?? 1);
  if (segments.length === 0) return [];

  const join = (idx: number[]) => idx.map((i) => segments[i]!.text.trim()).join(' ').replace(/\s+/g, ' ');
  const spans = (idx: number[]) => ({
    startSec: segments[idx[0]!]!.start,
    endSec: segments[idx[idx.length - 1]!]!.end,
  });

  const chunks: Chunk[] = [];
  let start = 0;
  let index = 0;
  while (start < segments.length) {
    const ids: number[] = [start];
    let chars = segments[start]!.text.trim().length;
    let end = start + 1;
    while (end < segments.length) {
      const nextLen = segments[end]!.text.trim().length + 1; // + joiner
      if (chars + nextLen > maxChars) break;
      ids.push(end);
      chars += nextLen;
      end += 1;
    }
    chunks.push({ id: `${transcriptId}#${index}`, transcriptId, index, text: join(ids), ...spans(ids), segmentIds: ids });
    index += 1;
    if (end >= segments.length) break;
    start = Math.min(Math.max(end - overlap, start + 1), end);
  }
  return chunks;
}
