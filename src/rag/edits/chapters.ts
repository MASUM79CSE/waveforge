/**
 * P5.6 — chapters derived from a transcript (pure, read-only). A chapter
 * starts at a segment that follows a silence gap > GAP_SEC (or is the
 * first segment); its title is the first MAX_TITLE chars of the
 * segment's text, sanitized to a single line of plain characters.
 * Chapters are DERIVED — nothing is persisted, nothing mutates the doc.
 */
import type { TranscriptRecord } from '../transcripts/model';

export interface Chapter {
  /** Chapter start in seconds (the triggering segment's start). */
  atSec: number;
  index: number;
  title: string;
}

export const CHAPTER_RULES = Object.freeze({
  /** A silence gap larger than this starts a new chapter. */
  gapSec: 2,
  maxTitle: 40,
});

/** Title sanitize: strip control chars, collapse whitespace, cap. */
export function chapterTitle(text: string, maxTitle = CHAPTER_RULES.maxTitle): string {
  const clean = text
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > maxTitle ? `${clean.slice(0, maxTitle)}…` : clean;
}

export function chaptersFromTranscript(transcript: TranscriptRecord): Chapter[] {
  const chapters: Chapter[] = [];
  let prevEnd = -Infinity;
  for (const seg of transcript.segments) {
    if (chapters.length === 0 || seg.start - prevEnd > CHAPTER_RULES.gapSec) {
      chapters.push({ atSec: seg.start, index: chapters.length, title: chapterTitle(seg.text) });
    }
    prevEnd = Math.max(prevEnd, seg.end);
  }
  return chapters;
}
