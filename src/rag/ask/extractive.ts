/**
 * P4.4 — extractive answer provider (the Ask default; zero ML).
 * Deterministic pipeline over retrieved evidence: split chunks into
 * sentences → IDF-weighted coverage scoring against the query → take
 * the best sentences (original order, ≤2 / ≤400 chars) as the answer.
 * The answer text is ALWAYS composed of exact transcript substrings, so
 * grounding (P4.6) holds by construction — and is still enforced.
 */
import { tokenize } from '../retrieval/bm25';
import { enforceGrounding, type Citation } from './grounding';
import type { AskAnswer, AskProvider, AskQuery, AskContext } from './provider';

/** Sentence split: latin terminators + bn daṛi, then trim. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?।])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const MAX_SENTENCES = 2;
const MAX_CHARS = 400;

interface Scored {
  chunkId: string;
  chunkStart: number;
  chunkEnd: number;
  sentence: string;
  /** Fraction of distinct query tokens present (0..1). */
  coverage: number;
  /** Σ idf of the matched tokens (tie-break after coverage). */
  mass: number;
  order: number;
}

/** IDF over the evidence's sentences: ln(1 + N/df). */
function sentenceIdf(sentences: string[]): Map<string, number> {
  const n = Math.max(1, sentences.length);
  const df = new Map<string, number>();
  for (const s of sentences) {
    for (const t of new Set(tokenize(s, { stopwords: undefined }))) {
      df.set(t, (df.get(t) ?? 0) + 1);
    }
  }
  const idf = new Map<string, number>();
  for (const [t, count] of df) {
    idf.set(t, Math.log(1 + n / count));
  }
  return idf;
}

function scoreEvidence(query: string, ctx: AskContext): Scored[] {
  const qTokens = [...new Set(tokenize(query, { stopwords: undefined }))];
  if (qTokens.length === 0) return [];
  const flat: Array<{ chunkId: string; chunkStart: number; chunkEnd: number; s: string; i: number }> = [];
  for (const chunk of ctx.evidence) {
    splitSentences(chunk.text).forEach((s, i) => {
      flat.push({ chunkId: chunk.id, chunkStart: chunk.startSec, chunkEnd: chunk.endSec, s, i });
    });
  }
  const idf = sentenceIdf(flat.map((f) => f.s));
  const totalIdf = qTokens.reduce((sum, t) => sum + (idf.get(t) ?? Math.log(1 + flat.length)), 0);
  const scored: Scored[] = flat.map((f, order) => {
    const tokens = new Set(tokenize(f.s, { stopwords: undefined }));
    let mass = 0;
    for (const t of qTokens) {
      if (tokens.has(t)) mass += idf.get(t) ?? 0;
    }
    return {
      chunkId: f.chunkId,
      chunkStart: f.chunkStart,
      chunkEnd: f.chunkEnd,
      sentence: f.s,
      coverage: totalIdf > 0 ? mass / totalIdf : 0,
      mass,
      order,
    };
  });
  return scored;
}

export function createExtractiveProvider(): AskProvider {
  return {
    id: 'extractive',
    async answer(query: AskQuery, ctx: AskContext): Promise<AskAnswer> {
      if (ctx.signal?.aborted || ctx.evidence.length === 0) {
        return { status: 'insufficient', text: '', citations: [], provider: 'extractive', confidence: ctx.confidence };
      }
      const scored = scoreEvidence(query.query, ctx);
      const relevant = scored.filter((s) => s.coverage > 0);
      if (relevant.length === 0) {
        return { status: 'insufficient', text: '', citations: [], provider: 'extractive', confidence: ctx.confidence };
      }
      // rank: coverage desc, mass desc, original order asc
      const ranked = [...relevant].sort(
        (a, b) => b.coverage - a.coverage || b.mass - a.mass || a.order - b.order,
      );
      const picked: Scored[] = [];
      let chars = 0;
      for (const cand of ranked) {
        if (picked.length >= MAX_SENTENCES) break;
        if (chars + cand.sentence.length > MAX_CHARS) {
          // run-on chunk (transcript segments carry no sentence marks):
          // truncate at a word boundary — a slice is STILL an exact
          // transcript substring, so grounding holds
          if (picked.length === 0) {
            const cut = cand.sentence.slice(0, MAX_CHARS);
            const lastSpace = cut.lastIndexOf(' ');
            picked.push({ ...cand, sentence: lastSpace > 40 ? cut.slice(0, lastSpace) : cut });
          }
          break;
        }
        picked.push(cand);
        chars += cand.sentence.length;
      }
      // restore original document order in the answer text
      picked.sort((a, b) => a.order - b.order);
      const text = picked.map((p) => p.sentence).join(' ');
      // one citation per sentence (quotes are exact by construction)
      const citations: Citation[] = picked.map((p) => ({
        chunkId: p.chunkId,
        startSec: p.chunkStart,
        endSec: p.chunkEnd,
        quote: p.sentence,
      }));
      const grounded = enforceGrounding({ text, citations }, ctx.evidence);
      if (grounded.status !== 'answer' || !grounded.answer) {
        return { status: 'insufficient', text: '', citations: [], provider: 'extractive', confidence: ctx.confidence };
      }
      return {
        status: 'answer',
        text: grounded.answer.text,
        citations: grounded.answer.citations,
        provider: 'extractive',
        confidence: ctx.confidence,
      };
    },
  };
}
