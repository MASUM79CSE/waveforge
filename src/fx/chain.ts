/**
 * C1 — FX chain model (docs/fxchains-plan.md): a serial chain of registry
 * effects with per-entry params + bypass. The boundary (import/share JSON)
 * is untrusted: zod enforces the shape, the registry enforces effect
 * existence and param ranges (validateParams clamps — the specs are the
 * single source of truth). The fold is a pure sequential stage fold with an
 * injected runner; the app layer (C2) supplies the real runner on top of
 * renderEffectOffline / def.process.
 */
import { z } from 'zod';
import { getEffect, validateParams } from './registry';
import type { Params } from './types';

export interface ChainEntry {
  effectId: string;
  params: Params;
  bypass: boolean;
}

export type Chain = ChainEntry[];

export type ParseResult = { ok: true; chain: Chain } | { ok: false; error: string };

/** Sanity cap — a serial chain beyond this is almost certainly a mistake. */
const CHAIN_MAX = 16;

/** bool params coerce numbers/strings in the registry — bypass matches. */
const bypassSchema = z.preprocess(
  (v): boolean => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') return v.toLowerCase() !== 'false' && v !== '0';
    return false;
  },
  z.boolean(),
);

const entrySchema = z.object({
  effectId: z.string().min(1),
  params: z.record(z.string(), z.unknown()),
  bypass: z.optional(bypassSchema),
});

const chainSchema = z.array(entrySchema).max(CHAIN_MAX);

/** Stable, minimal JSON shape (share/import — Audacity-macro precedent). */
export function exportChain(chain: Chain): string {
  return JSON.stringify(
    chain.map((e) => ({ effectId: e.effectId, params: e.params, bypass: e.bypass })),
  );
}

export function parseChain(raw: unknown): ParseResult {
  const parsed = chainSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `invalid chain${issue ? `: ${issue.message}` : ''}` };
  }
  const chain: Chain = [];
  for (const entry of parsed.data) {
    const def = getEffect(entry.effectId);
    if (!def) return { ok: false, error: `unknown effect: ${entry.effectId}` };
    chain.push({
      effectId: entry.effectId,
      params: validateParams(def, entry.params),
      bypass: entry.bypass ?? false,
    });
  }
  return { ok: true, chain };
}

/** The app layer supplies this: kernel process or offline graph render. */
export type StageRunner = (
  effectId: string,
  channels: Float32Array[],
  sampleRate: number,
  params: Params,
) => Float32Array[];

/**
 * Sequential fold; bypass entries never run; all-bypassed/empty returns the
 * input arrays unchanged (bit-exact identity); length-changing stages feed
 * their whole output to the next stage.
 */
export function foldChain(
  channels: Float32Array[],
  sampleRate: number,
  chain: Chain,
  run: StageRunner,
): Float32Array[] {
  let current = channels;
  for (const entry of chain) {
    if (entry.bypass) continue;
    current = run(entry.effectId, current, sampleRate, entry.params);
  }
  return current;
}

/** C2: graph stages render offline — the runner awaits per stage. */
export type AsyncStageRunner = (
  effectId: string,
  channels: Float32Array[],
  sampleRate: number,
  params: Params,
) => Promise<Float32Array[]>;

/** Sequential fold with async stages (same bypass/identity laws). */
export async function foldChainAsync(
  channels: Float32Array[],
  sampleRate: number,
  chain: Chain,
  run: AsyncStageRunner,
): Promise<Float32Array[]> {
  let current = channels;
  for (const entry of chain) {
    if (entry.bypass) continue;
    current = await run(entry.effectId, current, sampleRate, entry.params);
  }
  return current;
}
