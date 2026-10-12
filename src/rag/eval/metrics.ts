/**
 * P3.8 — retrieval quality metrics (pure, dependency-free). A query is
 * "relevant" if any gold chunk id appears in the top-k (hit@k); MRR is
 * the mean of 1/rank of the FIRST relevant hit (0 when absent).
 */
export type RankedFn = (query: string) => string[];

export interface EvalQuery {
  query: string;
  /** Chunk ids that count as correct answers. */
  gold: string[];
}

export interface EvalReport {
  queries: number;
  hit1: number;
  hit3: number;
  mrr: number;
  /** Per-query detail for debugging failures. */
  rows: Array<{ query: string; rank: number | null; top3: string[] }>;
}

export function firstRelevantRank(ranked: readonly string[], gold: readonly string[]): number | null {
  const set = new Set(gold);
  for (let i = 0; i < ranked.length; i++) {
    if (set.has(ranked[i]!)) return i + 1;
  }
  return null;
}

export function evaluate(queries: readonly EvalQuery[], ranked: RankedFn, k = 3): EvalReport {
  const rows = queries.map(({ query, gold }) => {
    const ids = ranked(query).slice(0, k);
    const rank = firstRelevantRank(ranked(query), gold);
    return { query, rank, top3: ids };
  });
  const n = rows.length || 1;
  const hit1 = rows.filter((r) => r.rank === 1).length / n;
  const hit3 = rows.filter((r) => r.rank !== null && r.rank <= k).length / n;
  const mrr = rows.reduce((s, r) => s + (r.rank ? 1 / r.rank : 0), 0) / n;
  return { queries: rows.length, hit1, hit3, mrr, rows };
}
