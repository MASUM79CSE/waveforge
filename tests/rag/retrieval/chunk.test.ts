import { describe, expect, it } from 'vitest';
import { chunkTranscript } from '../../../src/rag/retrieval/chunk';
import type { TranscriptSegment } from '../../../src/rag/transcripts/model';

const seg = (start: number, end: number, text: string): TranscriptSegment => ({ start, end, text });

describe('P3.2 transcript chunker', () => {
  it('golden: small transcript → one chunk joining texts, full span, ids #0', () => {
    const chunks = chunkTranscript('t@1/f', [
      seg(0, 2, 'hello world'),
      seg(2, 4.5, 'second part'),
      seg(4.5, 7, 'third part'),
    ]);
    expect(chunks.length).toBe(1);
    const c = chunks[0]!;
    expect(c.id).toBe('t@1/f#0');
    expect(c.transcriptId).toBe('t@1/f');
    expect(c.text).toBe('hello world second part third part');
    expect(c.startSec).toBe(0);
    expect(c.endSec).toBe(7);
    expect(c.segmentIds).toEqual([0, 1, 2]);
    expect(c.index).toBe(0);
  });

  it('budget forces new chunks; a segment is never split', () => {
    const big = 'x'.repeat(600);
    const chunks = chunkTranscript('t', [seg(0, 1, big), seg(1, 2, big), seg(2, 3, big)], { maxChars: 800 });
    // 600+601 > 800 → one segment per chunk (even though overlap carries 1,
    // the carry + next segment also exceed the budget → carry is dropped)
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(800);
      expect(c.text.includes(big)).toBe(true);
    }
  });

  it('overlap: the next chunk carries the previous chunk’s last segment', () => {
    const chunks = chunkTranscript(
      't',
      [seg(0, 1, 'aaaa'), seg(1, 2, 'bbbb'), seg(2, 3, 'cccc'), seg(3, 4, 'dddd')],
      { maxChars: 12 },
    );
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1]!;
      const cur = chunks[i]!;
      expect(cur.segmentIds[0]).toBe(prev.segmentIds[prev.segmentIds.length - 1]);
    }
  });

  it('oversized single segment forms its own (oversized) chunk, unsplit', () => {
    const huge = 'y'.repeat(2000);
    const chunks = chunkTranscript('t', [seg(0, 5, huge)], { maxChars: 800 });
    expect(chunks.length).toBe(1);
    expect(chunks[0]!.text).toBe(huge);
  });

  it('coverage property: span union covers every segment exactly (monotone time)', () => {
    const segments: TranscriptSegment[] = [];
    for (let i = 0; i < 12; i++) segments.push(seg(i * 10, (i + 1) * 10 - 0.1, `segment ${i} text`));
    const chunks = chunkTranscript('t', segments, { maxChars: 40 });
    expect(chunks[0]!.startSec).toBe(segments[0]!.start);
    expect(chunks[chunks.length - 1]!.endSec).toBe(segments[11]!.end);
    const covered = new Set(chunks.flatMap((c) => c.segmentIds));
    expect(covered.size).toBe(segments.length);
    for (const c of chunks) {
      expect(c.endSec).toBeGreaterThanOrEqual(c.startSec);
      for (const i of c.segmentIds) expect(c.text).toContain(segments[i]!.text);
    }
  });

  it('empty input → []; single short segment → one chunk', () => {
    expect(chunkTranscript('t', [])).toEqual([]);
    const one = chunkTranscript('t', [seg(1, 2, 'only')]);
    expect(one.length).toBe(1);
    expect(one[0]!.text).toBe('only');
  });

  it('deterministic ids are transcriptId#k in order', () => {
    const chunks = chunkTranscript('t@v/x', [seg(0, 1, 'a'), seg(1, 2, 'b'), seg(2, 3, 'c')], { maxChars: 3 });
    expect(chunks.map((c) => c.id)).toEqual(chunks.map((_, i) => `t@v/x#${i}`));
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });

  it('progress guarantee: overlap ≥ segment count still terminates correctly', () => {
    const chunks = chunkTranscript(
      't',
      [seg(0, 1, 'a'), seg(1, 2, 'b'), seg(2, 3, 'c')],
      { maxChars: 4, overlapSegments: 5 },
    );
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const covered = new Set(chunks.flatMap((c) => c.segmentIds));
    expect(covered.size).toBe(3);
  });

  it('whitespace-normalized join: multi-space segment texts collapse', () => {
    const chunks = chunkTranscript('t', [seg(0, 1, 'a  b'), seg(1, 2, '  c   d ')]);
    expect(chunks[0]!.text).toBe('a b c d');
  });
});
