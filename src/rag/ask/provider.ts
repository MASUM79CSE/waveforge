/**
 * P4.4 — Ask provider interface (zod-boundaried). A provider turns a
 * query + retrieved evidence into an AskAnswer; EVERY provider output
 * must pass enforceGrounding() (P4.6) before it reaches the UI. The
 * extractive provider is the default and needs no ML at all.
 */
import { z } from 'zod';
import { CitationSchema } from './grounding';

export const AskProviderIdSchema = z.enum(['extractive', 'local-llm']);
export type AskProviderId = z.infer<typeof AskProviderIdSchema>;

export const AskAnswerSchema = z.object({
  status: z.enum(['answer', 'insufficient']),
  /** Answer text (TEXT-NODE-rendered by the UI; may be '' when insufficient). */
  text: z.string().max(2000),
  citations: z.array(CitationSchema).max(4),
  provider: AskProviderIdSchema,
  /** Calibrated confidence in [0,1] (P4.3 calibration of the retrieval). */
  confidence: z.number().min(0).max(1),
});
export type AskAnswer = z.infer<typeof AskAnswerSchema>;

export const AskQuerySchema = z.object({
  query: z.string().min(1).max(500),
});
export type AskQuery = z.infer<typeof AskQuerySchema>;

export interface AskContext {
  /** Evidence chunks retrieved for this query (P3.5 hybrid search). */
  evidence: Array<{ id: string; text: string; startSec: number; endSec: number }>;
  /** Calibrated retrieval confidence from the sufficiency gate (P4.3). */
  confidence: number;
  signal?: AbortSignal;
}

export interface AskProvider {
  readonly id: AskProviderId;
  answer(query: AskQuery, ctx: AskContext): Promise<AskAnswer>;
}
