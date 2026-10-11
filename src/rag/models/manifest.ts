/**
 * RAG model manifest (P1.3). The registry ships empty-but-valid: entries are
 * appended by the phases that actually use them (P2 ASR, P3 embeddings,
 * P4 LLM), filled with real byte sizes and SHA-256 hashes measured from a
 * one-time download — never guessed.
 */
import { z } from 'zod';

export const ModelFileSchema = z.object({
  path: z.string().min(1),
  url: z.string().url(),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

export const ModelEntrySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['asr', 'embed', 'llm']),
  version: z.string().min(1),
  files: z.array(ModelFileSchema).min(1),
  licence: z.string().min(1),
  sourceUrl: z.string().url(),
  minProfile: z.enum(['low', 'standard', 'high']),
});

export type ModelFile = z.infer<typeof ModelFileSchema>;
export type ModelEntry = z.infer<typeof ModelEntrySchema>;

/**
 * Registry (P2/P3/P4 will append; keep entries pinned and hash-verified):
 * TODO(P2): tiny + base multilingual Whisper ONNX (asr).
 * TODO(P3): multilingual-e5-small embeddings (embed) + EN-only light option.
 * TODO(P4): small quantized local LLM (llm, WebGPU-only).
 */
export const MODEL_REGISTRY: readonly ModelEntry[] = [];

export function getModel(id: string, version?: string): ModelEntry | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id && (version === undefined || m.version === version));
}

export function totalBytes(entry: ModelEntry): number {
  return entry.files.reduce((sum, f) => sum + f.bytes, 0);
}
