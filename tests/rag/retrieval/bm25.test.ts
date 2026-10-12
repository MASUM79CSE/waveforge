import { describe, expect, it } from 'vitest';
import { BM25_B, BM25_K1, Bm25Index, tokenize } from '../../../src/rag/retrieval/bm25';

describe('P3.1 tokenizer', () => {
  it('splits on punctuation/symbols/whitespace, lowercases, keeps digits', () => {
    // typographic apostrophe is \p{P}: it's → it + s (then 'it' stopworded)
    expect(tokenize('Hello, world! It’s 2026...')).toEqual(['hello', 'world', 's', '2026']);
    expect(tokenize('abc123 def-456')).toEqual(['abc123', 'def', '456']);
  });

  it('NFKC-normalizes compatibility forms (ﬁ → fi)', () => {
    expect(tokenize('ﬁle')).toEqual(['file']);
  });

  it('keeps Bengali word characters (only danda/punct split)', () => {
    expect(tokenize('আমি ভালো আছি।')).toEqual(['আমি', 'ভালো', 'আছি']);
  });

  it('default stopwords removed; disable with []', () => {
    expect(tokenize('the cat is on the mat')).toEqual(['cat', 'mat']);
    expect(tokenize('the cat is on the mat', { stopwords: [] })).toEqual([
      'the', 'cat', 'is', 'on', 'the', 'mat',
    ]);
  });

  it('empty/whitespace input → no tokens', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('  \t\n ... ')).toEqual([]);
  });
});

describe('P3.1 BM25 index', () => {
  it('constants are the documented ones', () => {
    expect(BM25_K1).toBe(1.2);
    expect(BM25_B).toBe(0.75);
  });

  it('golden score: 1 doc, 1 matching term (hand-computed)', () => {
    const idx = new Bm25Index();
    idx.add('d', 'apple banana apple', { stopwords: [] });
    // N=1, df=1 → idf = ln(4/3) = 0.28768207245178085
    expect(idx.idf('apple')).toBeCloseTo(Math.log(4 / 3), 15);
    // tf=2, dl=3, avgdl=3 → 2·2.2 / (2 + 1.2·1) = 1.375
    const [hit] = idx.search('apple', { stopwords: [] });
    expect(hit!.id).toBe('d');
    expect(hit!.score).toBeCloseTo(Math.log(4 / 3) * 1.375, 15);
  });

  it('ranks docs with more matching-term mass higher', () => {
    const idx = new Bm25Index();
    idx.add('a', 'apple apple pie', { stopwords: [] });
    idx.add('b', 'apple pie recipe', { stopwords: [] });
    const hits = idx.search('apple', { stopwords: [] });
    expect(hits.map((h) => h.id)).toEqual(['a', 'b']);
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
  });

  it('multi-term queries sum per-term contributions', () => {
    const idx = new Bm25Index();
    idx.add('a', 'apple banana', { stopwords: [] });
    const one = idx.search('apple', { stopwords: [] })[0]!.score;
    const both = idx.search('apple banana', { stopwords: [] })[0]!.score;
    expect(both).toBeCloseTo(2 * one, 12); // symmetric corpus → equal idf/tf parts
  });

  it('tf saturation: score growth is sublinear', () => {
    const mk = (tf: number) => {
      const idx = new Bm25Index();
      const words = ['apple', ...Array.from({ length: tf - 1 }, () => 'apple'), 'zebra'];
      idx.add('d', words.join(' '), { stopwords: [] });
      return idx.search('apple', { stopwords: [] })[0]!.score;
    };
    const s1 = mk(1);
    const s2 = mk(2);
    const s4 = mk(4);
    expect(s2).toBeGreaterThan(s1);
    expect(s4 - s2).toBeLessThan(s2 - s1);
  });

  it('length normalization: same tf, longer doc → lower score', () => {
    const idx = new Bm25Index();
    idx.add('short', 'apple zebra', { stopwords: [] });
    idx.add('long', `apple ${'filler '.repeat(20)}zebra`, { stopwords: [] });
    const hits = idx.search('apple', { stopwords: [] });
    const s = Object.fromEntries(hits.map((h) => [h.id, h.score]));
    expect(s['short']).toBeGreaterThan(s['long']!);
  });

  it('OOV terms contribute nothing; no NaN; empty query → no hits', () => {
    const idx = new Bm25Index();
    idx.add('d', 'apple', { stopwords: [] });
    expect(idx.search('unicorn', { stopwords: [] })).toEqual([]);
    expect(idx.search('', { stopwords: [] })).toEqual([]);
    expect(idx.search('... !!!', { stopwords: [] })).toEqual([]);
    for (const h of idx.search('apple unicorn', { stopwords: [] })) {
      expect(Number.isFinite(h.score)).toBe(true);
    }
  });

  it('deterministic + stable id tie-break', () => {
    const mk = () => {
      const idx = new Bm25Index();
      idx.add('b', 'same text', { stopwords: [] });
      idx.add('a', 'same text', { stopwords: [] });
      return idx;
    };
    const h1 = mk().search('same', { stopwords: [] });
    const h2 = mk().search('same', { stopwords: [] });
    expect(h1).toEqual(h2);
    expect(h1.map((h) => h.id)).toEqual(['a', 'b']); // identical docs → id order
  });

  it('topK truncates', () => {
    const idx = new Bm25Index();
    for (const id of ['a', 'b', 'c']) idx.add(id, `apple ${id}`, { stopwords: [] });
    expect(idx.search('apple', { stopwords: [], topK: 2 }).length).toBe(2);
  });

  it('remove() updates stats: N drops, remaining scores change accordingly', () => {
    const idx = new Bm25Index();
    idx.add('x', 'apple tart', { stopwords: [] });
    idx.add('y', 'apple tart', { stopwords: [] });
    const before = idx.search('apple', { stopwords: [] });
    idx.remove('x');
    expect(idx.size).toBe(1);
    const after = idx.search('apple', { stopwords: [] });
    expect(after.length).toBe(1);
    // Lucene IDF: with every doc matching (df=N→df=1,N=1) the term gets
    // MORE discriminative, not less — idf(1/1)=ln(4/3) > idf(2/2)=ln(1.2)
    expect(after[0]!.score).toBeGreaterThan(before[0]!.score);
    expect(idx.avgDocLength).toBeCloseTo(2, 12);
  });

  it('re-adding an id replaces instead of duplicating', () => {
    const idx = new Bm25Index();
    idx.add('d', 'apple apple apple apple', { stopwords: [] });
    idx.add('d', 'apple', { stopwords: [] });
    expect(idx.size).toBe(1);
    const [hit] = idx.search('apple', { stopwords: [] });
    expect(hit!.score).toBeCloseTo(Math.log(4 / 3) * 1, 10); // tf=1, dl=1, avgdl=1
  });
});
