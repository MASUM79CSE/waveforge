import { describe, expect, it } from 'vitest';
import { RRF_K, rrfFuse, SearchIndex } from '../../../src/rag/retrieval/search';
import { embedText } from '../../../src/rag/retrieval/embedFake';
import type { StoredChunk } from '../../../src/rag/retrieval/indexStore';

function chunk(id: string, text: string, overrides: Partial<StoredChunk> = {}): StoredChunk {
  return {
    id,
    transcriptId: 't@1/f',
    index: 0,
    text,
    startSec: 0,
    endSec: 5,
    segmentIds: [0],
    vector: Float32Array.from(embedText(text)) as StoredChunk['vector'],
    dim: 256,
    modelId: 'fake-embed',
    embeddedAt: 1,
    ...overrides,
  };
}

const embedQuery = (text: string) => embedText(text);

describe('P3.5 RRF fusion (golden)', () => {
  it('hand-computed fusion: k=60, 1-based ranks', () => {
    const fused = rrfFuse([
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      [{ id: 'b' }, { id: 'd' }, { id: 'a' }],
    ]);
    const a = 1 / 61 + 1 / 63;
    const b = 1 / 62 + 1 / 61;
    const c = 1 / 63;
    const d = 1 / 62;
    expect(fused.get('a')).toBeCloseTo(a, 15);
    expect(fused.get('b')).toBeCloseTo(b, 15);
    expect(fused.get('c')).toBeCloseTo(c, 15);
    expect(fused.get('d')).toBeCloseTo(d, 15);
    // order: b (0.03252) > a (0.03227) > d (0.01613) > c (0.01587)
    expect([...fused.entries()].sort((x, y) => y[1]! - x[1]!).map(([id]) => id)).toEqual(['b', 'a', 'd', 'c']);
  });

  it('k controls dominance: k→0 amplifies top ranks (x: 1st+3rd vs y: 2nd+2nd)', () => {
    const rankings = [
      [{ id: 'x' }, { id: 'y' }, { id: 'z' }],
      [{ id: 'w' }, { id: 'y' }, { id: 'x' }],
    ];
    const kSmall = rrfFuse(rankings, 0.001);
    // k→0: x = 1/1.001 + 1/3.001 ≈ 1.333 > y = 2/2.001 ≈ 1.0
    expect(kSmall.get('x')!).toBeGreaterThan(kSmall.get('y')!);
    const kLarge = rrfFuse(rankings, 1e9);
    // k→∞: every rank converges — scores equalize
    expect(kLarge.get('x')).toBeCloseTo(kLarge.get('y')!, 9);
    expect(RRF_K).toBe(60);
  });
});

describe('P3.5 SearchIndex', () => {
  const corpus = [
    chunk('c1', 'the waveform peaks are rendered by the peaks worker'),
    chunk('c2', 'export flac uses the vendored wasm encoder'),
    chunk('c3', 'waveform selection drives cut copy paste operations'),
    chunk('c4', 'transcription runs whisper locally on this device'),
  ];

  it('hybrid: chunk sharing lexical AND vector signal outranks others', () => {
    const idx = new SearchIndex({ embedQuery });
    idx.load(corpus);
    const hits = idx.query('waveform peaks');
    expect(hits[0]!.chunk.id).toBe('c1');
    expect(hits[0]!.score).toBeGreaterThan(0);
    expect(hits[0]!.chunk.text).toContain('waveform');
  });

  it('consistent winner across both rankings beats a single-ranking leader', () => {
    // c1 tops lexical for 'waveform peaks'; verify a mid-ranked-both chunk
    // can outrank a lexically-strong/vectorially-weak one via corpus design:
    const idx = new SearchIndex({ embedQuery });
    idx.load([
      chunk('x', 'render pipeline gpu accel render pipeline'), // strong words, no overlap with q's rarer terms
      chunk('y', 'render waveform'), // overlaps both halves of the query
    ]);
    const hits = idx.query('render waveform');
    // 'y' matches BOTH query terms (bm25 sum > x's single-term mass with tf
    // saturation; vector side agrees) — hybrid must rank it first
    expect(hits[0]!.chunk.id).toBe('y');
  });

  it('lexical mode ignores the vector ranking', () => {
    const idx = new SearchIndex({ embedQuery: () => new Float32Array(256).fill(1) }); // garbage vectors
    idx.load(corpus);
    const hits = idx.query('waveform peaks', { mode: 'lexical' });
    expect(hits[0]!.chunk.id).toBe('c1');
    for (const h of hits) expect(Number.isFinite(h.score)).toBe(true);
  });

  it('vector mode ignores bm25 (pure embedding similarity ranks)', () => {
    const idx = new SearchIndex({ embedQuery });
    idx.load([
      chunk('v', 'alpha beta gamma'), // 2 of 3 tokens shared with the query
      chunk('w', 'alpha beta gamma delta'), // shared fraction diluted (2 of 4)
      chunk('z', 'totally different words entirely'),
    ]);
    const hits = idx.query('alpha beta', { mode: 'vector' });
    expect(hits[0]!.chunk.id).toBe('v');
    expect(hits.map((h) => h.chunk.id)).not.toContain('zz');
  });

  it('empty query / empty index → no hits, no crash', () => {
    const idx = new SearchIndex({ embedQuery });
    expect(idx.query('')).toEqual([]);
    idx.load(corpus);
    expect(idx.query('   ')).toEqual([]);
    expect(idx.query('anything', { mode: 'lexical', topK: 0 })).toEqual([]);
  });

  it('load() replaces the corpus; size tracks it', () => {
    const idx = new SearchIndex({ embedQuery });
    expect(idx.size).toBe(0);
    idx.load(corpus);
    expect(idx.size).toBe(4);
    idx.load([corpus[0]!]);
    expect(idx.size).toBe(1);
    expect(idx.query('flac', { mode: 'lexical' })).toEqual([]); // c2 gone
  });

  it('deterministic tie-break: identical chunks → stable id order', () => {
    const idx = new SearchIndex({ embedQuery });
    idx.load([chunk('b', 'same words'), chunk('a', 'same words')]);
    const h1 = idx.query('same words');
    const h2 = idx.query('same words');
    expect(h1.map((h) => h.chunk.id)).toEqual(['a', 'b']);
    expect(h1).toEqual(h2);
  });

  it('vector-mode floor drops low-cosine hits (D9 semantic no-match gate)', () => {
    // synthetic geometry: 'near' aligns with the query, 'far' is
    // orthogonal (cosine() is a raw dot — vectors must be pre-normalized)
    const norm = (v: number[]) => {
      const n = Math.hypot(...v);
      return v.map((x) => x / n);
    };
    const mk = (id: string, v: number[]) =>
      chunk(id, 'some transcript text', {
        vector: Float32Array.from(norm(v)) as StoredChunk['vector'],
      });
    const idx = new SearchIndex({
      embedQuery: (t) =>
        Float32Array.from(
          norm(t === 'aligned' ? [1, 0.1, 0] : t === 'sideways' ? [0, 1, 0] : [0, 0, 1]),
        ),
    });
    idx.load([mk('near', [1, 0.1, 0]), mk('far', [0, 1, 0]), mk('mid', [1, 1, 0])]);
    // aligned query, floor 0.15: 'far' (cos ≈ 0) dropped, others kept
    const hits = idx.query('aligned', { mode: 'vector', floor: 0.15, topK: 5 });
    expect(hits.map((h) => h.chunk.id)).toEqual(['near', 'mid']);
    // high floor keeps only the truly aligned hit
    expect(idx.query('aligned', { mode: 'vector', floor: 0.9, topK: 5 }).map((h) => h.chunk.id)).toEqual(['near']);
    // 'sideways' (identical to far, 0.707 to mid, 0.0995 to near): the
    // floor drops only the near-orthogonal 'near'…
    expect(idx.query('sideways', { mode: 'vector', floor: 0.15, topK: 5 }).map((h) => h.chunk.id)).toEqual(['far', 'mid']);
    // …but 'unrelated' (orthogonal to EVERYTHING) → no matches at all
    expect(idx.query('unrelated', { mode: 'vector', floor: 0.15, topK: 5 })).toEqual([]);
    // hybrid + floor: an emptied vector ranking leaves bm25 standing
    const hy = idx.query('some transcript', { mode: 'hybrid', floor: 0.9, topK: 5 });
    expect(hy.length).toBeGreaterThan(0);
    // floor absent → unchanged behavior
    expect(idx.query('aligned', { mode: 'vector', topK: 5 }).length).toBe(3);
  });

  it('SEMANTIC_FLOOR is frozen at the calibrated value', async () => {
    const { SEMANTIC_FLOOR } = await import('../../../src/rag/retrieval/search');
    expect(SEMANTIC_FLOOR).toBe(0.15);
  });

  it('topK truncates the fused list', () => {
    const idx = new SearchIndex({ embedQuery });
    idx.load(corpus);
    expect(idx.query('the', { mode: 'hybrid', topK: 2 }).length).toBeLessThanOrEqual(2);
  });

  it('multi-transcript corpora are searchable (ids independent)', () => {
    const idx = new SearchIndex({ embedQuery });
    idx.load([
      chunk('tA#0', 'guitar tone mastering chain', { transcriptId: 'tA@1' }),
      chunk('tB#0', 'noise reduction learned print', { transcriptId: 'tB@1' }),
    ]);
    const hits = idx.query('noise reduction print');
    expect(hits[0]!.chunk.transcriptId).toBe('tB@1');
  });
});
