/**
 * P2.5 — ASR worker-boundary schemas (zod).
 */
import { z } from 'zod';

export const AsrInitSchema = z.object({
  modelId: z.string().min(1),
  version: z.string().min(1),
  device: z.enum(['wasm', 'webgpu']).default('wasm'),
});
export type AsrInit = z.infer<typeof AsrInitSchema>;

export const AsrTranscribeSchema = z.object({
  /** 16 kHz mono window PCM (from the feeder, P2.2). */
  samples: z.instanceof(Float32Array),
});
export type AsrTranscribe = z.infer<typeof AsrTranscribeSchema>;

export const AsrSegmentSchema = z.object({
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  text: z.string(),
});
export const AsrResultSchema = z.object({
  segments: z.array(AsrSegmentSchema),
  /** Full-window text join (diagnostics; UI uses segments). */
  text: z.string(),
});

export type AsrResult = z.infer<typeof AsrResultSchema>;
