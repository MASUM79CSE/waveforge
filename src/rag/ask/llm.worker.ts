/// <reference lib="webworker" />
/**
 * P4.5 — LLM worker: thin RPC shell around llmHandlers with the REAL
 * transformers.js behind a dynamic import (worker-only chunk, D10 — no
 * new dependency). Model files come exclusively from P1.3 storage —
 * offline by contract; missing model never triggers a fetch.
 */
import { serveRpc, workerEndpoint } from '../rpc/server';
import { createModelStorage } from '../models/storage';
import { createLlmHandlers, type LlmTransformersLike } from './llmHandlers';

interface WorkerScope {
  onmessage: ((ev: { data: unknown }) => void) | null;
  postMessage: (data: unknown, transfer?: Transferable[]) => void;
}
const sw = self as unknown as WorkerScope;

serveRpc(
  workerEndpoint(sw),
  createLlmHandlers({
    storage: createModelStorage(caches),
    importLib: () => import('@huggingface/transformers') as Promise<LlmTransformersLike>,
    ortBasePath: '/rag-assets/ort/',
  }),
);
