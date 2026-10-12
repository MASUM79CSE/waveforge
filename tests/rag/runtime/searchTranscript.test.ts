/**
 * P6.13 — runtime-level contract for the D9 semantic flag. The unit
 * floor tests live in retrieval/search.test.ts (SearchIndex.query
 * geometry); this file pins the RUNTIME branch: `searchTranscript({
 * semantic: true })` must (a) route real-model rows through the real
 * query embedder in vector mode with SEMANTIC_FLOOR, (b) override a
 * caller-supplied mode, and (c) leave fake-embedder rows on the
 * caller's lexical fallback untouched (fake hash cosine has no floor,
 * and find-in-transcript stays literal — P3.7 contract).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeIDB } from '../helpers/fakeIdb';
import { fakeCaches } from '../helpers/fakeCaches';
import {
  EMBED_MODEL_ID,
  ragTranscript,
  searchTranscript,
} from '../../../src/rag/runtime';
import type { StoredChunk } from '../../../src/rag/retrieval/indexStore';
import type { TranscriptRecord } from '../../../src/rag/transcripts/model';
import { embedTexts } from '../../../src/rag/retrieval/embedFake';

// The real query embedder (worker + wasm) is out of scope here — the
// runtime contract only needs a controllable query vector.
const EMBED = vi.hoisted(() => ({
  qvec: new Float32Array([1, 0]),
  calls: 0,
}));
vi.mock('../../../src/rag/retrieval/embedClient', () => ({
  createEmbedWorker: () => ({}),
  createEmbedClient: () => ({
    init: async () => {},
    embed: async () => {
      EMBED.calls += 1;
      return { vectors: [EMBED.qvec] };
    },
    close: () => {},
  }),
}));

// runtime imports the app runtime for document info; it has module-level
// DOM listeners that must not load under the node test environment.
vi.mock('../../../src/app/runtime', () => ({ getDoc: () => null }));

const TEXT_A = 'guitar intro with warm reverb tail';
// Deliberately contains the query words: a lexical leg would rank B, the
// semantic floor must drop it (orthogonal vector).
const TEXT_B = 'drum solo guitar intro loud';
// Pre-normalized 2-D vectors: A aligns with [1,0] (cosine 1), B is
// orthogonal (cosine 0) — the floor's clean keep/drop pair.
const VEC_A = new Float32Array([1, 0]);
const VEC_B = new Float32Array([0, 1]);

// runtime caches its IndexStorage singleton on first use, so the whole
// file must share ONE FakeIDB backing store (docs differ by transcriptId).
const IDB = new FakeIDB();
vi.stubGlobal('indexedDB', IDB.indexFactory());

/** Single-leg RRF score (k=60): vector mode returns fused scores. */
const RRF1 = 1 / (60 + 1);

function record(id: string): TranscriptRecord {
  return {
    id,
    modelId: 'whisper-test',
    modelVersion: '1',
    fingerprint: 'f',
    language: 'en',
    segments: [],
    createdAt: 1_700_000_000_000,
    stale: false,
  };
}

function chunk(transcriptId: string, id: string, text: string, vector: Float32Array, modelId: string): StoredChunk {
  // embedTexts declares ArrayBufferLike; real buffers are ArrayBuffer-backed
  // (the zod schema checks instanceof, not the generic) — typing-only cast.
  const vec = vector as Float32Array<ArrayBuffer>;
  return {
    id,
    transcriptId,
    index: id.endsWith('a') ? 0 : 1,
    text,
    startSec: 0,
    endSec: 2.5,
    segmentIds: [id.endsWith('a') ? 0 : 1],
    vector: vec,
    dim: vec.length,
    modelId,
    embeddedAt: 1_700_000_000_000,
  };
}

async function seed(transcriptId: string, chunks: StoredChunk[]): Promise<void> {
  const { openIndexDB, createIndexStorage } = await import(
    '../../../src/rag/retrieval/indexStore'
  );
  const store = createIndexStorage(await openIndexDB(IDB.indexFactory()));
  await store.putDoc(transcriptId, chunks);
}

beforeEach(() => {
  EMBED.calls = 0;
  EMBED.qvec = new Float32Array([1, 0]);
  vi.stubGlobal('window', {}); // no __wfRagTest ⇒ real-embed path
  vi.stubGlobal('caches', fakeCaches());
});

describe('searchTranscript semantic flag (D9 runtime contract)', () => {
  it('real rows: semantic routes to vector ranking and applies the floor', async () => {
    const tid = 'tr-real@1/f';
    await seed(tid, [
      chunk(tid, `${tid}#a`, TEXT_A, VEC_A, EMBED_MODEL_ID),
      chunk(tid, `${tid}#b`, TEXT_B, VEC_B, EMBED_MODEL_ID),
    ]);
    ragTranscript.value = record(tid);
    const res = await searchTranscript('guitar intro', { topK: 5, semantic: true });
    expect(EMBED.calls).toBe(1); // real query embedder used exactly once
    expect(res.map((r) => r.chunk.id)).toEqual([`${tid}#a`]); // orthogonal B floored
    expect(res[0]!.score).toBeCloseTo(RRF1, 6); // single-leg RRF of the cosine ranking
  });

  it('real rows: semantic wins over an explicit caller mode', async () => {
    const tid = 'tr-real2@1/f';
    await seed(tid, [
      chunk(tid, `${tid}#a`, TEXT_A, VEC_A, EMBED_MODEL_ID),
      chunk(tid, `${tid}#b`, TEXT_B, VEC_B, EMBED_MODEL_ID),
    ]);
    ragTranscript.value = record(tid);
    const res = await searchTranscript('guitar intro', {
      topK: 5,
      mode: 'lexical',
      semantic: true,
    });
    // A lexical leg would rank BOTH texts (B contains the query words);
    // vector+floor wins and drops the orthogonal B.
    expect(res.map((r) => r.chunk.id)).toEqual([`${tid}#a`]);
    expect(res[0]!.score).toBeCloseTo(RRF1, 6);
  });

  it('real rows: everything below the floor returns [] (no-match capability)', async () => {
    const tid = 'tr-real3@1/f';
    await seed(tid, [
      chunk(tid, `${tid}#a`, TEXT_A, VEC_A, EMBED_MODEL_ID),
      chunk(tid, `${tid}#b`, TEXT_B, VEC_B, EMBED_MODEL_ID),
    ]);
    ragTranscript.value = record(tid);
    EMBED.qvec = new Float32Array([0, -1]); // cos A = 0, cos B = −1
    const res = await searchTranscript('guitar intro', { topK: 5, semantic: true });
    expect(res).toEqual([]);
  });

  it('default call keeps hybrid full ranking (no floor) — unchanged behavior', async () => {
    const tid = 'tr-real4@1/f';
    await seed(tid, [
      chunk(tid, `${tid}#a`, TEXT_A, VEC_A, EMBED_MODEL_ID),
      chunk(tid, `${tid}#b`, TEXT_B, VEC_B, EMBED_MODEL_ID),
    ]);
    ragTranscript.value = record(tid);
    EMBED.qvec = new Float32Array([0, -1]); // both below the floor…
    const res = await searchTranscript('guitar intro', { topK: 5 });
    expect(res.map((r) => r.chunk.id).sort()).toEqual([`${tid}#a`, `${tid}#b`]); // …yet both rank
    expect(res[0]!.score).toBeLessThan(RRF1 * 2); // fused RRF scores, not cosine
  });

  it('fake rows: semantic:true honors the lexical fallback — literal semantics', async () => {
    const tid = 'tr-fake@1/f';
    await seed(tid, [
      chunk(tid, `${tid}#a`, TEXT_A, embedTexts([TEXT_A])[0]!, 'fake-embed'),
      chunk(tid, `${tid}#b`, TEXT_B, embedTexts([TEXT_B])[0]!, 'fake-embed'),
    ]);
    ragTranscript.value = record(tid);
    // The panel's call shape (P6.13): lexical fallback + semantic flag.
    const semantic = await searchTranscript('guitar intro', {
      topK: 5,
      mode: 'lexical',
      semantic: true,
    });
    const plainLexical = await searchTranscript('guitar intro', { mode: 'lexical' });
    expect(EMBED.calls).toBe(0); // fake query embedder, never the real client
    expect(semantic.length).toBeGreaterThan(0);
    expect(semantic).toEqual(plainLexical); // the flag changed nothing
    // literal semantics: a nonsense query returns NO matches (BM25 empty),
    // unlike hybrid whose RRF fusion always ranks something
    const nonsense = await searchTranscript('zzz-no-such-term', {
      topK: 5,
      mode: 'lexical',
      semantic: true,
    });
    const hybridNoise = await searchTranscript('zzz-no-such-term');
    expect(nonsense).toEqual([]);
    expect(hybridNoise.length).toBeGreaterThan(0);
  });
});
