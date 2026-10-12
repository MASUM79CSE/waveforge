/**
 * P4.5 — opt-in local-LLM Ask provider. OFF by default; the model is
 * downloaded only through the consented P1.4 flow into P1.3 storage.
 * Pipeline: buildGroundedPrompt (P4.7 defenses) → generate →
 * enforceGrounding (P4.6). Ungrounded or refusing output NEVER reaches
 * the UI — the provider falls back to the extractive answer for the
 * same evidence (deterministic, grounded by construction).
 */
import {
  buildGroundedPrompt,
  isRefusal,
} from './sanitize';
import { enforceGrounding, type Citation } from './grounding';
import type { AskAnswer, AskProvider, AskContext, AskQuery } from './provider';
import type { LlmClient } from './llmClient';
import { createExtractiveProvider } from './extractive';

export interface LlmProviderDeps {
  client: LlmClient;
  modelId: string;
  version: string;
}

export function createLlmProvider(deps: LlmProviderDeps): AskProvider {
  const extractive = createExtractiveProvider();
  return {
    id: 'local-llm',
    async answer(query: AskQuery, ctx: AskContext): Promise<AskAnswer> {
      const insufficient: AskAnswer = {
        status: 'insufficient',
        text: '',
        citations: [],
        provider: 'local-llm',
        confidence: ctx.confidence,
      };
      if (ctx.evidence.length === 0 || ctx.signal?.aborted) return insufficient;
      // the LLM must be installed AND initialized; anything else falls
      // back to extractive (opt-in feature degrades silently, never breaks)
      try {
        await deps.client.init({ modelId: deps.modelId, version: deps.version });
        const prompt = buildGroundedPrompt(query.query, ctx);
        const res = await deps.client.generate(
          { prompt, maxNewTokens: 256, temperature: 0 },
          { signal: ctx.signal } as never,
        );
        if (isRefusal(res.text)) {
          return insufficient;
        }
        // citations: the evidence blocks we offered (validated below —
        // the text must independently trace to them)
        const citations: Citation[] = ctx.evidence.slice(0, 2).map((c) => ({
          chunkId: c.id,
          startSec: c.startSec,
          endSec: c.endSec,
          quote: c.text.slice(0, 80),
        }));
        const grounded = enforceGrounding({ text: res.text, citations }, ctx.evidence);
        if (grounded.status === 'answer' && grounded.answer) {
          return {
            status: 'answer',
            text: grounded.answer.text,
            citations: grounded.answer.citations,
            provider: 'local-llm',
            confidence: ctx.confidence,
          };
        }
        // ungrounded → extractive fallback (grounded by construction)
        return await extractive.answer(query, ctx);
      } catch {
        // worker/typed errors (NOT_INITIALIZED, MODEL_NOT_INSTALLED, abort
        // races) — degrade to the deterministic default, never throw past
        // the UI boundary
        if (ctx.signal?.aborted) return insufficient;
        return await extractive.answer(query, ctx);
      }
    },
  };
}
