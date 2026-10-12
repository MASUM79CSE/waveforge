/**
 * P3.3 — typed embedding client + real worker factory + in-memory fake
 * client (deterministic embedFake — CI/e2e).
 */
import { createRpcClient, type CallOptions, type RpcWorkerLike } from '../rpc/client';
import type { z } from 'zod';
import type { EmbedInitSchema, EmbedResult } from './embedProtocol';

/** Input type — `device` optional (schema default). */
export type EmbedInitInput = z.input<typeof EmbedInitSchema>;
import { embedTexts } from './embedFake';

export interface EmbedClient {
  init(opts: EmbedInitInput, call?: CallOptions): Promise<{ ready: boolean; device: string }>;
  embed(texts: string[], call?: CallOptions): Promise<EmbedResult>;
  dispose(call?: CallOptions): Promise<{ disposed: boolean }>;
  close(): void;
}

export function createEmbedClient(makeWorker: () => RpcWorkerLike): EmbedClient {
  const rpc = createRpcClient(makeWorker);
  return {
    init: (opts, call) => rpc.call('embed.init', opts, call),
    embed: (texts, call) => rpc.call('embed.embed', { texts }, call),
    dispose: (call) => rpc.call('embed.dispose', undefined, call),
    close: () => rpc.close(),
  };
}

/** In-memory fake over the deterministic embedder (no worker, no ML). */
export function createFakeEmbedClient(): EmbedClient {
  let ready = false;
  return {
    init: async () => {
      ready = true;
      return { ready: true, device: 'wasm-fake' };
    },
    embed: async (texts: string[]) => {
      if (!ready) throw Object.assign(new Error('embed not initialized'), { code: 'NOT_INITIALIZED' });
      return { vectors: embedTexts(texts) } as EmbedResult;
    },
    dispose: async () => {
      ready = false;
      return { disposed: true };
    },
    close: () => {
      ready = false;
    },
  };
}

/** Real worker factory (browser only — never imported by unit tests). */
export function createEmbedWorker(): Worker {
  return new Worker(new URL('./embed.worker.ts', import.meta.url), { type: 'module' });
}
