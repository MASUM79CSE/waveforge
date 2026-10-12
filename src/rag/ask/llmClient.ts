/**
 * P4.5 — typed LLM client + real worker factory + deterministic fake
 * client. The fake (CI/e2e) parrots the FIRST evidence sentence style:
 * it cannot download anything and always produces grounded-compatible
 * output for the e2e journeys.
 */
import { createRpcClient, type CallOptions, type RpcWorkerLike } from '../rpc/client';
import type { z } from 'zod';
import type { LlmInitSchema, LlmResult } from './llmProtocol';

/** Input type — `device` optional (schema default). */
export type LlmInitInput = z.input<typeof LlmInitSchema>;

export interface LlmClient {
  init(opts: LlmInitInput, call?: CallOptions): Promise<{ ready: boolean; device: string }>;
  generate(
    req: { prompt: string; maxNewTokens?: number; temperature?: number },
    call?: CallOptions,
  ): Promise<LlmResult>;
  dispose(call?: CallOptions): Promise<{ disposed: boolean }>;
  close(): void;
}

export function createLlmClient(makeWorker: () => RpcWorkerLike): LlmClient {
  const rpc = createRpcClient(makeWorker);
  return {
    init: (opts, call) => rpc.call('llm.init', opts, call),
    generate: (req, call) => rpc.call('llm.generate', req, call),
    dispose: (call) => rpc.call('llm.dispose', undefined, call),
    close: () => rpc.close(),
  };
}

/**
 * Deterministic fake generator — the TEST seam. Given the prompt it
 * echoes the last non-empty evidence line it can find (the extraction
 * the real model is asked to do), or NOT IN TRANSCRIPT when the prompt
 * has no evidence blocks. Never networked; ignores init model.
 */
export function createFakeLlmClient(): LlmClient {
  let ready = false;
  return {
    init: async () => {
      ready = true;
      return { ready: true, device: 'wasm-fake' };
    },
    generate: async (req) => {
      if (!ready) throw Object.assign(new Error('llm not initialized'), { code: 'NOT_INITIALIZED' });
      const blocks = req.prompt.split('<<<EVIDENCE').slice(1);
      if (blocks.length === 0) {
        return { text: 'NOT IN TRANSCRIPT' } as LlmResult;
      }
      // deterministic "generation": first sentence of the first block
      const body = blocks[0]!.split('\n').slice(1).join('\n');
      const sentence = body.split(/(?<=[.!?।])\s+|\n/).find((s) => s.trim().length > 0) ?? '';
      return { text: sentence.trim() || 'NOT IN TRANSCRIPT' } as LlmResult;
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
export function createLlmWorker(): Worker {
  return new Worker(new URL('./llm.worker.ts', import.meta.url), { type: 'module' });
}
