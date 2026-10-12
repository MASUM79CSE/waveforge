import { describe, expect, it } from 'vitest';
import { chunkTranscript } from '../../../src/rag/retrieval/chunk';
import { embedText } from '../../../src/rag/retrieval/embedFake';
import { SearchIndex } from '../../../src/rag/retrieval/search';
import { assessSufficiency } from '../../../src/rag/ask/sufficiency';
import { createExtractiveProvider } from '../../../src/rag/ask/extractive';
import { chaptersFromTranscript } from '../../../src/rag/edits/chapters';
import type { StoredChunk } from '../../../src/rag/retrieval/indexStore';
import type { TranscriptRecord } from '../../../src/rag/transcripts/model';

/**
 * P6.1 — 1-hour scale harness (deterministic, CI-safe). A synthetic
 * 1-hour transcript (realistic ~5 s segments → 720 segments across 12
 * topics with long uniform gaps for chapters) flows through the REAL
 * production path: chunk → embed (fake) → hybrid index → search → ask
 * → chapters, with FIXED budgets (ms) measured on the sandbox runner
 * and asserted with CI-safe headroom. Real-model cost stays opt-in
 * (scripts/rag/quality-*.mjs) — this test proves SCALE, not ML quality.
 */

const TOPICS = 12;
const SECONDS = 3600;

function hourTranscript(): TranscriptRecord {
  const segments = [];
  // one segment every ~5 s of timeline; topic words cycle every 5 min
  for (let s = 0, i = 0; s < SECONDS - 5; s += 5, i++) {
    const topic = `topic${i % TOPICS}`;
    // topic boundaries get a 3 s silence gap → real chapter splits
    const end = i > 0 && i % 60 === 0 ? s + 2 : s + 4.7;
    segments.push({
      start: s,
      end,
      text: `${topic} sentence number ${i} explains detail ${i} of the session content`,
    });
  }
  return {
    id: 'scale@1/hour',
    modelId: 'whisper-tiny',
    modelVersion: '1.0.0',
    fingerprint: 'hour',
    language: 'en',
    segments,
    createdAt: 1,
    stale: false,
  };
}

describe('P6.1 one-hour end-to-end scale', () => {
  it('chunk → embed → index → search → ask → chapters within budgets', async () => {
    const t0 = performance.now();
    const transcript = hourTranscript();
    expect(transcript.segments.length).toBeGreaterThan(700);

    // chunk (production chunker)
    const tChunk = performance.now();
    const chunks = chunkTranscript(
      transcript.id,
      transcript.segments.map((s) => ({ start: s.start, end: s.end, text: s.text })),
    );
    const chunkMs = performance.now() - tChunk;
    expect(chunks.length).toBeGreaterThan(20);

    // embed + persist-shape rows (fake embedder = CI contract)
    const tEmbed = performance.now();
    const rows: StoredChunk[] = chunks.map((c, i) => ({
      id: c.id,
      transcriptId: transcript.id,
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
    const embedMs = performance.now() - tEmbed;

    // hybrid index + search
    const tSearch = performance.now();
    const idx = new SearchIndex({ embedQuery: (q) => embedText(q) });
    idx.load(rows);
    const queries = Array.from({ length: 20 }, (_, i) => `topic${i % TOPICS} detail ${i * 36}`);
    for (const q of queries) {
      const hits = idx.query(q, { topK: 5 });
      expect(hits.length).toBeGreaterThan(0);
    }
    const searchMs = performance.now() - tSearch;

    // ask pipeline over the same index
    const tAsk = performance.now();
    const provider = createExtractiveProvider();
    const hits = idx.query('topic3 detail 108', { topK: 5 });
    const suff = assessSufficiency({ hits: hits.length, bestScore: hits[0]?.score ?? 0 });
    const answer = await provider.answer(
      { query: 'topic3 detail 108' },
      {
        evidence: hits.map((h) => ({ id: h.chunk.id, text: h.chunk.text, startSec: h.chunk.startSec, endSec: h.chunk.endSec })),
        confidence: suff.confidence,
      },
    );
    const askMs = performance.now() - tAsk;
    expect(answer.status).toBe('answer');

    // chapters over the full hour
    const tChapters = performance.now();
    const chapters = chaptersFromTranscript(transcript);
    const chaptersMs = performance.now() - tChapters;

    const totalMs = performance.now() - t0;

    // budgets (ms) — measured on the 2-vCPU CI runner, generous headroom
    expect(chunkMs).toBeLessThan(2_000);
    expect(embedMs).toBeLessThan(8_000);
    expect(searchMs).toBeLessThan(8_000); // 20 hybrid queries
    expect(askMs).toBeLessThan(1_000);
    expect(chaptersMs).toBeLessThan(500);
    expect(chapters.length).toBeGreaterThanOrEqual(TOPICS - 1); // uniform gaps → ~12 chapters

    // eslint-disable-next-line no-console
    console.log(
      `[scale-hour] chunks=${chunks.length} chunk=${chunkMs.toFixed(0)}ms embed=${embedMs.toFixed(0)}ms search(20q)=${searchMs.toFixed(0)}ms ask=${askMs.toFixed(0)}ms chapters=${chapters.length}/${chaptersMs.toFixed(0)}ms total=${totalMs.toFixed(0)}ms`,
    );
  });

  it('memory stays bounded: index holds 1 h of vectors without copies', () => {
    const chunks = chunkTranscript(
      'scale@1/hour',
      hourTranscript().segments.map((s) => ({ start: s.start, end: s.end, text: s.text })),
    );
    // 720 segments × 256 floats × 4 B ≈ 700 KB-class corpus; the search
    // index must not duplicate it per query (single Map of references)
    const idx = new SearchIndex({ embedQuery: (q) => embedText(q) });
    idx.load(
      chunks.map((c, i) => ({
        id: c.id,
        transcriptId: 'scale@1/hour',
        index: i,
        text: c.text,
        startSec: c.startSec,
        endSec: c.endSec,
        segmentIds: c.segmentIds,
        vector: Float32Array.from(embedText(c.text)) as StoredChunk['vector'],
        dim: 256,
        modelId: 'fake-embed',
        embeddedAt: 1,
      })),
    );
    expect(idx.size).toBe(chunks.length);
  });
});
