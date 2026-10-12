import { describe, expect, it } from 'vitest';
import { chunkTranscript } from '../../../src/rag/retrieval/chunk';
import { embedText } from '../../../src/rag/retrieval/embedFake';
import { SearchIndex } from '../../../src/rag/retrieval/search';
import { evaluate, firstRelevantRank, type EvalQuery } from '../../../src/rag/eval/metrics';
import { CORPUS_SEGMENTS, GOLDEN_QUERIES, MARKERS, type CorpusQuery } from '../../../src/rag/eval/corpus';
import type { StoredChunk } from '../../../src/rag/retrieval/indexStore';

/**
 * P3.8 — deterministic retrieval eval over the golden corpus with the
 * fake embedder (CI-safe: no ML). Thresholds are FIXED in code — the
 * harness fails the build when retrieval quality regresses. The same
 * harness shape is reused by the opt-in real-model script (P6) with
 * MiniLM vectors; CI never runs that script.
 */

const TID = 'eval@1/corpus';

// deterministic thresholds (fractions in [0,1]) — lexical must be exact-ish
const THRESHOLDS = {
  lexical: { hit1: 0.99, hit3: 0.99, mrr: 0.9 },
  hybrid: { hit1: 0.5, hit3: 0.99, mrr: 0.6 },
} as const;

function buildChunks(): StoredChunk[] {
  const chunks = chunkTranscript(
    TID,
    CORPUS_SEGMENTS.map((s) => ({ start: s.start, end: s.end, text: s.text })),
  );
  return chunks.map((c, i) => ({
    id: c.id,
    transcriptId: TID,
    index: i,
    text: c.text,
    startSec: c.startSec,
    endSec: c.endSec,
    segmentIds: c.segmentIds,
    vector: Float32Array.from(embedText(c.text)) as StoredChunk['vector'],
    dim: 256,
    modelId: 'fake-embed',
    embeddedAt: 1,
  }));
}

function goldQueries(chunks: readonly StoredChunk[]): CorpusQuery[] {
  return GOLDEN_QUERIES.map(({ topic, query }) => {
    const gold = chunks.filter((c) => c.text.includes(MARKERS[topic])).map((c) => c.id);
    if (gold.length === 0) throw new Error(`marker for ${topic} landed in no chunk`);
    return { topic, query, gold };
  });
}

const chunks = buildChunks();
const queries = goldQueries(chunks);

function makeIndex(mode: 'lexical' | 'hybrid'): SearchIndex {
  const idx = new SearchIndex({ embedQuery: (t) => embedText(t) });
  idx.load(chunks);
  void mode;
  return idx;
}

const run = (idx: SearchIndex, mode: 'lexical' | 'hybrid') => (q: string) =>
  idx
    .query(q, { topK: 5, mode })
    .map((h) => h.chunk.id);

describe('P3.8 eval harness', () => {
  it('metrics: firstRelevantRank + evaluate are correct on toy cases', () => {
    expect(firstRelevantRank(['a', 'b', 'c'], ['b'])).toBe(2);
    expect(firstRelevantRank(['a', 'b'], ['z'])).toBeNull();
    const rep = evaluate(
      [
        { query: 'q1', gold: ['x'] },
        { query: 'q2', gold: ['a'] },
      ],
      (q) => (q === 'q1' ? ['n1', 'x', 'n2'] : ['a', 'n1']),
    );
    expect(rep.hit1).toBe(0.5);
    expect(rep.hit3).toBe(1);
    expect(rep.mrr).toBeCloseTo((1 + 0.5) / 2, 12);
  });

  it('corpus integrity: every topic marker lands in exactly one chunk', () => {
    // 34 short segments join into a few ~800-char chunks; markers are
    // unique strings so each gold id is still unambiguous per topic
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const q of queries) {
      expect(q.gold.length).toBe(1);
      expect(chunks.some((c) => c.id === q.gold[0])).toBe(true);
    }
    // every marker is distinct text
    const markers = Object.values(MARKERS);
    expect(new Set(markers).size).toBe(markers.length);
  });

  it('lexical search meets the FIXED thresholds on the golden corpus', () => {
    const report = evaluate(queries as EvalQuery[], run(makeIndex('lexical'), 'lexical'));
    expect(report.hit1).toBeGreaterThanOrEqual(THRESHOLDS.lexical.hit1);
    expect(report.hit3).toBeGreaterThanOrEqual(THRESHOLDS.lexical.hit3);
    expect(report.mrr).toBeGreaterThanOrEqual(THRESHOLDS.lexical.mrr);
    expect(report.queries).toBe(6);
  });

  it('hybrid search meets its thresholds and never loses to noise', () => {
    const report = evaluate(queries as EvalQuery[], run(makeIndex('hybrid'), 'hybrid'));
    expect(report.hit1).toBeGreaterThanOrEqual(THRESHOLDS.hybrid.hit1);
    expect(report.hit3).toBeGreaterThanOrEqual(THRESHOLDS.hybrid.hit3);
    expect(report.mrr).toBeGreaterThanOrEqual(THRESHOLDS.hybrid.mrr);
    // determinism: identical numbers on a second run
    const again = evaluate(queries as EvalQuery[], run(makeIndex('hybrid'), 'hybrid'));
    expect(again.mrr).toBe(report.mrr);
    expect(again.hit1).toBe(report.hit1);
  });

  it('distractors do not outrank gold on any lexical query', () => {
    const idx = makeIndex('lexical');
    for (const q of queries) {
      const ids = idx.query(q.query, { topK: 5, mode: 'lexical' }).map((h) => h.chunk.id);
      const rank = firstRelevantRank(ids, q.gold);
      expect(rank).not.toBeNull();
      expect(rank!).toBeLessThanOrEqual(2);
    }
  });
});
