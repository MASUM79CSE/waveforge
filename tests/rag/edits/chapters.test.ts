import { describe, expect, it } from 'vitest';
import { chapterTitle, chaptersFromTranscript } from '../../../src/rag/edits/chapters';
import type { TranscriptRecord } from '../../../src/rag/transcripts/model';

function transcript(segments: Array<[number, number, string]>): TranscriptRecord {
  return {
    id: 't@1/f',
    modelId: 'whisper-tiny',
    modelVersion: '1.0.0',
    fingerprint: 'f',
    language: 'en',
    segments: segments.map(([start, end, text]) => ({ start, end, text })),
    createdAt: 1,
    stale: false,
  };
}

describe('P5.6 chapters from transcript', () => {
  it('first segment always opens chapter 0', () => {
    const chapters = chaptersFromTranscript(transcript([[0, 1.9, 'intro sentence here']]));
    expect(chapters).toEqual([{ atSec: 0, index: 0, title: 'intro sentence here' }]);
  });

  it('gap > 2 s splits; small gaps do not', () => {
    const chapters = chaptersFromTranscript(
      transcript([
        [0, 2, 'first topic'],
        [2.5, 4, 'still first topic'],
        [7, 9, 'second topic'], // 3 s gap
        [9.5, 11, 'still second'],
      ]),
    );
    expect(chapters.map((c) => c.title)).toEqual(['first topic', 'second topic']);
    expect(chapters.map((c) => c.atSec)).toEqual([0, 7]);
    expect(chapters.map((c) => c.index)).toEqual([0, 1]);
  });

  it('gap of exactly 2 s does NOT split (strictly greater)', () => {
    const chapters = chaptersFromTranscript(
      transcript([
        [0, 2, 'a'],
        [4, 5, 'b'], // gap exactly 2
      ]),
    );
    expect(chapters.length).toBe(1);
  });

  it('titles are capped with an ellipsis', () => {
    expect(chapterTitle('x'.repeat(50)).length).toBe(41);
    expect(chapterTitle('x'.repeat(50)).endsWith('…')).toBe(true);
    expect(chapterTitle('short')).toBe('short');
  });

  it('titles are single-line, control-free (sanitize)', () => {
    expect(chapterTitle('bad\u0000text\nhere')).toBe('bad text here');
    expect(chapterTitle('  padded   text  ')).toBe('padded text');
  });

  it('overlapping segments do not create false gaps', () => {
    const chapters = chaptersFromTranscript(
      transcript([
        [0, 5, 'long segment'],
        [1, 2, 'overlapping'], // ends BEFORE prevEnd 5 → no split
        [8, 9, 'after gap'], // 3 s after prevEnd 5 → split
      ]),
    );
    expect(chapters.map((c) => c.title)).toEqual(['long segment', 'after gap']);
  });

  it('empty transcript → no chapters', () => {
    expect(chaptersFromTranscript(transcript([]))).toEqual([]);
  });

  it('deterministic', () => {
    const t = transcript([[0, 1, 'a'], [5, 6, 'b']]);
    expect(chaptersFromTranscript(t)).toEqual(chaptersFromTranscript(t));
  });
});
