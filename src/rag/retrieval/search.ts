/**
 * P3.5 — hybrid search (pure). Lexical half: BM25 (P3.1). Vector half:
 * cosine over L2-normalized chunk vectors vs an embedded query (the
 * query embedding function is injected — the deterministic fake in
 * tests/CI, the P3.3 client in the runtime wiring). Fusion: Reciprocal
 * Rank Fusion, RRF(d) = Σ_rankings 1/(k + rank(d)), k=60; ranks are
 * 1-based. Deterministic: fused score desc, ties by chunk id asc.
 */
import { Bm25Index } from './bm25';
import { cosine } from './embedFake';
import type { StoredChunk } from './indexStore';

export const RRF_K = 60;

/**
 * Semantic no-match floor (D9 completion). Calibrated 2026-10-12 on the
 * P3.8 golden corpus with the REAL encoder (Xenova/all-MiniLM-L6-v2,
 * q8): relevant chunks scored 0.208–0.454 cosine while out-of-corpus
 * queries never exceeded 0.093 — the floor separates them with margin
 * on both sides. Applies ONLY to cosine (vector-mode) scores with the
 * real model; fake-embedder scores are hash-based and never floored.
 */
export const SEMANTIC_FLOOR = 0.15;

export type SearchMode = 'hybrid' | 'lexical' | 'vector';

export interface SearchHit {
  chunk: StoredChunk;
  /** Fused score (RRF); raw score in degenerate single-ranking modes. */
  score: number;
}

/** Fuse ranked lists into id → RRF score. Rank positions are 1-based. */
export function rrfFuse(rankings: ReadonlyArray<ReadonlyArray<{ id: string }>>, k: number = RRF_K): Map<string, number> {
  const fused = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((item, zeroBased) => {
      fused.set(item.id, (fused.get(item.id) ?? 0) + 1 / (k + zeroBased + 1));
    });
  }
  return fused;
}

/** Sort helper: score desc, id asc — the module's deterministic order. */
function byScoreThenId<T extends { id: string; score: number }>(a: T, b: T): number {
  return b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export interface SearchDeps {
  /** Query embedder (fake in tests/CI, P3.3 client in the runtime). */
  embedQuery: (text: string) => Float32Array;
}

export interface QueryOptions {
  topK?: number;
  mode?: SearchMode;
  /** Drop vector-mode hits below this cosine (semantic no-match gate). */
  floor?: number;
}

const CANDIDATE_POOL = 50; // per-ranking candidates before fusion

export class SearchIndex {
  private bm25 = new Bm25Index();
  private readonly byId = new Map<string, StoredChunk>();
  private readonly deps: SearchDeps;

  constructor(deps: SearchDeps) {
    this.deps = deps;
  }

  get size(): number {
    return this.byId.size;
  }

  /** (Re)load the corpus — replaces any previously loaded chunks. */
  load(chunks: readonly StoredChunk[]): void {
    this.byId.clear();
    this.bm25 = new Bm25Index();
    for (const chunk of chunks) {
      this.byId.set(chunk.id, chunk);
      this.bm25.add(chunk.id, chunk.text, { stopwords: [] });
    }
  }

  query(text: string, opts: QueryOptions = {}): SearchHit[] {
    const { topK = 5, mode = 'hybrid' } = opts;
    if (this.byId.size === 0 || text.trim().length === 0) return [];

    const rankings: Array<Array<{ id: string; score: number }>> = [];
    if (mode !== 'vector') {
      rankings.push(this.bm25.search(text, { stopwords: [], topK: CANDIDATE_POOL }));
    }
    if (mode !== 'lexical') {
      const qv = this.deps.embedQuery(text);
      const vecHits = [...this.byId.values()]
        .map((chunk) => ({ id: chunk.id, score: cosine(qv, chunk.vector) }))
        .filter((h) => (opts.floor === undefined ? true : h.score >= opts.floor))
        .sort(byScoreThenId)
        .slice(0, CANDIDATE_POOL);
      rankings.push(vecHits);
    }
    if (rankings.length === 0) return [];

    const fused = rrfFuse(rankings);
    const ordered = [...fused.entries()]
      .map(([id, score]) => ({ id, score }))
      .sort(byScoreThenId)
      .slice(0, Math.max(0, topK));

    return ordered.flatMap(({ id, score }) => {
      const chunk = this.byId.get(id);
      return chunk ? [{ chunk, score }] : [];
    });
  }
}
