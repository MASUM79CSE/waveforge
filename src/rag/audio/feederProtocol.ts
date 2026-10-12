/**
 * P2.2 — feeder worker-boundary schemas (zod). Payloads crossing the
 * RPC boundary are validated before any processing (zod boundary
 * invariant); Float32Array channel blocks arrive via structured clone /
 * transfer and stay Float32Array on both sides.
 */
import { z } from 'zod';
import { WHISPER_RATE } from './resample';

export const FeederInitSchema = z.object({
  srcRate: z.number().positive(),
  totalFrames: z.number().int().nonnegative(),
  dstRate: z.number().positive().default(WHISPER_RATE),
  windowSec: z.number().positive().default(30),
  overlapSec: z.number().nonnegative().default(1),
});
export type FeederInit = z.infer<typeof FeederInitSchema>;

export const FeederFeedSchema = z.object({
  channels: z.array(z.instanceof(Float32Array)).min(1),
});

export const FeederWindowSchema = z.object({
  index: z.number().int().nonnegative(),
  t0: z.number().nonnegative(),
  samples: z.instanceof(Float32Array),
});

export const FeederResultSchema = z.object({
  windows: z.array(FeederWindowSchema),
  progress: z.number().min(0).max(1),
  done: z.boolean(),
});
