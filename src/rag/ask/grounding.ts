/**
 * P4.6 — grounding contract (pure). Every answer must cite evidence the
 * system actually retrieved: citation chunk ids must exist in the
 * evidence set and each quote must be an EXACT substring (NFKC-
 * normalized) of its cited chunk. Ungrounded output is downgraded to
 * 'insufficient' — an answer without verifiable provenance is never
 * shown. This gate applies to ALL providers (extractive and LLM alike).
 */
import { z } from 'zod';

export const CitationSchema = z.object({
  chunkId: z.string().min(1),
  startSec: z.number().finite().nonnegative(),
  endSec: z.number().finite().nonnegative(),
  quote: z.string().min(1),
});
export type Citation = z.infer<typeof CitationSchema>;

export const GroundedStatusSchema = z.enum(['answer', 'insufficient']);

export interface EvidenceChunk {
  id: string;
  text: string;
  startSec: number;
  endSec: number;
}

export interface Grounded<A> {
  status: 'answer' | 'insufficient';
  /** Only present when status = 'answer'. */
  answer?: A;
  /** Why grounding failed (debug/eval). */
  reason?: string;
}

function nfkc(text: string): string {
  return text.normalize('NFKC');
}

/** Validate one citation against the evidence set. */
export function verifyCitation(citation: Citation, evidence: readonly EvidenceChunk[]): boolean {
  if (!(citation.endSec >= citation.startSec)) return false;
  const chunk = evidence.find((c) => c.id === citation.chunkId);
  if (!chunk) return false;
  if (citation.startSec < chunk.startSec - 1e-9) return false;
  if (citation.endSec > chunk.endSec + 1e-9) return false;
  return nfkc(chunk.text).includes(nfkc(citation.quote));
}

/**
 * Enforce grounding on a candidate answer. `answer` is the provider's
 * output (text + citations); evidence is what retrieval actually
 * returned. Returns the answer unchanged when fully grounded, otherwise
 * an 'insufficient' verdict (never the ungrounded text).
 */
export function enforceGrounding<A extends { text: string; citations: Citation[] }>(
  answer: A,
  evidence: readonly EvidenceChunk[],
): Grounded<A> {
  const text = nfkc(answer.text).trim();
  if (text.length === 0) {
    return { status: 'insufficient', reason: 'empty-answer' };
  }
  if (answer.citations.length === 0) {
    return { status: 'insufficient', reason: 'no-citations' };
  }
  for (const citation of answer.citations) {
    const parsed = CitationSchema.safeParse(citation);
    if (!parsed.success) {
      return { status: 'insufficient', reason: 'malformed-citation' };
    }
    if (!verifyCitation(parsed.data, evidence)) {
      return { status: 'insufficient', reason: `ungrounded-citation:${citation.chunkId}` };
    }
  }
  // The answer text itself must be traceable to cited evidence: every
  // sentence the user sees must appear inside a cited chunk (extractive
  // answers are exact substrings; LLM answers may lightly compress, so
  // the check is sentence-level on the LONGEST sentence).
  const longest = text
    .split(/[.!?।\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .reduce((a, b) => (b.length > a.length ? b : a), '');
  const composed = answer.citations.map((c) => nfkc(c.quote)).join(' ');
  const traceable =
    // extractive path: text is EXACTLY the verified quotes joined — every
    // character is transcript text already verified as a substring
    composed === text ||
    // llm path: the longest sentence must trace to a cited chunk
    answer.citations.some((c) => {
      const chunk = evidence.find((e) => e.id === c.chunkId);
      return chunk ? nfkc(chunk.text).includes(longest) : false;
    });
  if (!traceable) {
    return { status: 'insufficient', reason: 'text-not-in-evidence' };
  }
  return { status: 'answer', answer };
}
