/**
 * P3.1 — tokenizer + Okapi BM25 (pure, dependency-free). Retrieval over
 * transcript text happens fully on-device; this module is the lexical
 * half of hybrid search (P3.5 adds the vector half + RRF fusion).
 *
 * Tokenizer: NFKC normalization (ligatures/compat forms → base letters),
 * lowercase, split on Unicode whitespace/punctuation/symbols — word
 * characters from ANY script (Latin, Bengali, digits) survive, so
 * tokenizing Bangla transcripts needs no special casing.
 *
 * BM25 (Okapi): k1=1.2, b=0.75, Lucene-style IDF
 * `ln(1 + (N − df + 0.5) / (df + 0.5))` — positive for every df, so a
 * term can never contribute a negative score. Query terms are unique
 * (repeats don't double-count). Ranking is deterministic: score desc,
 * ties broken by id ascending.
 */

export const BM25_K1 = 1.2;
export const BM25_B = 0.75;

/** Compact English stopword list (configurable — pass [] to disable). */
export const EN_STOPWORDS: readonly string[] = [
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'if', 'in',
  'into', 'is', 'it', 'of', 'on', 'or', 'so', 'that', 'the', 'their', 'then',
  'there', 'these', 'they', 'this', 'to', 'was', 'will', 'with',
];

export interface TokenizeOptions {
  stopwords?: readonly string[];
}

/** Normalize → lowercase → split on whitespace/punct/symbols → filter. */
export function tokenize(text: string, opts: TokenizeOptions = {}): string[] {
  const stop = opts.stopwords ? new Set(opts.stopwords) : new Set<string>(EN_STOPWORDS);
  const norm = text.normalize('NFKC').toLowerCase();
  const raw = norm.split(/[\s\p{P}\p{S}]+/u);
  const out: string[] = [];
  for (const tok of raw) {
    if (tok.length === 0) continue;
    if (stop.has(tok)) continue;
    out.push(tok);
  }
  return out;
}

/** term → docId → frequency. */
type Postings = Map<string, Map<string, number>>;

export interface Bm25Hit {
  id: string;
  score: number;
}

export class Bm25Index {
  private readonly postings: Postings = new Map();
  private readonly docLen = new Map<string, number>();
  /** Sum of all doc lengths (avgdl = totalLen / N). */
  private totalLen = 0;

  get size(): number {
    return this.docLen.size;
  }

  get avgDocLength(): number {
    const n = this.docLen.size;
    return n === 0 ? 0 : this.totalLen / n;
  }

  /** (Re-)index one document. Re-adding an id replaces it. */
  add(id: string, text: string, opts: TokenizeOptions = {}): void {
    if (this.docLen.has(id)) this.remove(id);
    const tokens = tokenize(text, opts);
    this.docLen.set(id, tokens.length);
    this.totalLen += tokens.length;
    const counts = new Map<string, number>();
    for (const tok of tokens) counts.set(tok, (counts.get(tok) ?? 0) + 1);
    for (const [term, freq] of counts) {
      let docs = this.postings.get(term);
      if (!docs) {
        docs = new Map();
        this.postings.set(term, docs);
      }
      docs.set(id, freq);
    }
  }

  /** Remove a document (and any term postings it held). */
  remove(id: string): void {
    const len = this.docLen.get(id);
    if (len === undefined) return;
    this.totalLen -= len;
    this.docLen.delete(id);
    for (const [term, docs] of this.postings) {
      if (docs.delete(id) && docs.size === 0) this.postings.delete(term);
    }
  }

  docFrequency(term: string): number {
    return this.postings.get(term)?.size ?? 0;
  }

  /** Lucene-style IDF — always positive. */
  idf(term: string): number {
    const n = this.docLen.size;
    const df = this.docFrequency(term);
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  /** BM25 score of one doc for one term (0 when the doc lacks the term). */
  private termScore(term: string, id: string): number {
    const freq = this.postings.get(term)?.get(id) ?? 0;
    if (freq === 0) return 0;
    const dl = this.docLen.get(id) ?? 0;
    const avgdl = this.avgDocLength;
    const norm = avgdl > 0 ? 1 - BM25_B + BM25_B * (dl / avgdl) : 1;
    return this.idf(term) * ((freq * (BM25_K1 + 1)) / (freq + BM25_K1 * norm));
  }

  /**
   * Score every indexed doc against the query; returns hits with
   * score > 0, sorted score-desc (ties: id asc), at most `topK`.
   */
  search(query: string, opts: TokenizeOptions & { topK?: number } = {}): Bm25Hit[] {
    const { topK = 10, ...tokOpts } = opts;
    const terms = [...new Set(tokenize(query, tokOpts))]; // unique terms
    const scores = new Map<string, number>();
    for (const term of terms) {
      const docs = this.postings.get(term);
      if (!docs) continue;
      for (const id of docs.keys()) {
        scores.set(id, (scores.get(id) ?? 0) + this.termScore(term, id));
      }
    }
    const hits = [...scores.entries()]
      .filter(([, score]) => score > 0)
      .map(([id, score]) => ({ id, score }));
    hits.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return hits.slice(0, Math.max(0, topK));
  }
}
