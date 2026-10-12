/**
 * P4.5 — LLM worker-boundary schemas (zod). Text generation on-device
 * via the SAME transformers.js dependency as embeddings (D10 — no new
 * dependency), behind the identical P2.5 offline contract. The prompt
 * is built by the caller (sanitize.ts); the worker only generates.
 */
import { z } from 'zod';

export const LlmInitSchema = z.object({
  modelId: z.string().min(1),
  version: z.string().min(1),
  device: z.enum(['wasm', 'webgpu']).default('wasm'),
});
export type LlmInit = z.infer<typeof LlmInitSchema>;

export const LlmGenerateSchema = z.object({
  prompt: z.string().min(1).max(24_000),
  maxNewTokens: z.number().int().min(1).max(512).default(256),
  temperature: z.number().min(0).max(2).default(0),
});
export type LlmGenerate = z.infer<typeof LlmGenerateSchema>;

export const LlmResultSchema = z.object({
  text: z.string().max(8192),
});
export type LlmResult = z.infer<typeof LlmResultSchema>;
