/**
 * P3.3 — embedding worker-boundary schemas + client + handlers.
 * The real encoder is transformers.js feature-extraction behind the SAME
 * offline contract as the ASR worker (storage-backed custom cache,
 * allowRemoteModels=false); tests drive the seam with a fake pipeline.
 */
import { z } from 'zod';

export const EmbedInitSchema = z.object({
  modelId: z.string().min(1),
  version: z.string().min(1),
  device: z.enum(['wasm', 'webgpu']).default('wasm'),
});
export type EmbedInit = z.infer<typeof EmbedInitSchema>;

export const EmbedRequestSchema = z.object({
  texts: z.array(z.string().max(8192)).max(64),
});
export type EmbedRequest = z.infer<typeof EmbedRequestSchema>;

export const EmbedResultSchema = z.object({
  vectors: z.array(z.instanceof(Float32Array)),
});
export type EmbedResult = z.infer<typeof EmbedResultSchema>;
