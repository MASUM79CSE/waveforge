/// <reference lib="webworker" />
/**
 * P3.3 — embedding worker: thin RPC shell around embedHandlers with the
 * REAL transformers.js behind a dynamic import (worker-only chunk).
 * Model files come exclusively from P1.3 storage — offline by contract.
 */
import { serveRpc, workerEndpoint } from '../rpc/server';
import { createModelStorage } from '../models/storage';
import { createEmbedHandlers, type EmbedTransformersLike } from './embedHandlers';

interface WorkerScope {
  onmessage: ((ev: { data: unknown }) => void) | null;
  postMessage: (data: unknown, transfer?: Transferable[]) => void;
}
const sw = self as unknown as WorkerScope;

serveRpc(
  workerEndpoint(sw),
  createEmbedHandlers({
    storage: createModelStorage(caches),
    importLib: () => import('@huggingface/transformers') as Promise<EmbedTransformersLike>,
  }),
);
