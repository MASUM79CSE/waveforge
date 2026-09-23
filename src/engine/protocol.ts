/**
 * Peaks worker message protocol (ADR 003): Zod-validated at both ends.
 */
import { z } from 'zod';

export const PEAK_TILE = 1024;

export interface TileReq {
  ch: number;
  level: number;
  tile: number;
}

/** Tile requests covering the sample range [startSample, endSample). */
export function tilesForRange(ch: number, level: number, startSample: number, endSample: number): TileReq[] {
  if (endSample <= startSample) return [];
  const first = Math.floor(startSample / level / PEAK_TILE);
  const last = Math.floor((endSample - 1) / level / PEAK_TILE);
  const reqs: TileReq[] = [];
  for (let tile = first; tile <= last; ++tile) reqs.push({ ch, level, tile });
  return reqs;
}

// ---- message schemas ----

export const initRequestSchema = z.object({
  type: z.literal('init'),
  channels: z.array(z.instanceof(ArrayBuffer)).min(1),
});

export const tilesRequestSchema = z.object({
  type: z.literal('tiles'),
  id: z.number(),
  reqs: z.array(
    z.object({
      ch: z.number().int().nonnegative(),
      level: z.number().int().positive(),
      tile: z.number().int().nonnegative(),
    }),
  ),
});

export const rawRequestSchema = z.object({
  type: z.literal('raw'),
  id: z.number(),
  ch: z.number().int().nonnegative(),
  start: z.number().int().nonnegative(),
  count: z.number().int().positive(),
});

export const tilesResultItemSchema = z.object({
  ch: z.number().int().nonnegative(),
  level: z.number().int().positive(),
  tile: z.number().int().nonnegative(),
  mins: z.instanceof(Float32Array),
  maxs: z.instanceof(Float32Array),
  count: z.number().int().nonnegative(),
});

export const tilesResponseSchema = z.object({
  type: z.literal('tiles'),
  id: z.number(),
  results: z.array(tilesResultItemSchema),
});

export const rawResponseSchema = z.object({
  type: z.literal('raw'),
  id: z.number(),
  samples: z.instanceof(Float32Array),
});

export type TilesRequest = z.infer<typeof tilesRequestSchema>;
export type TilesResponse = z.infer<typeof tilesResponseSchema>;
export type RawResponse = z.infer<typeof rawResponseSchema>;
