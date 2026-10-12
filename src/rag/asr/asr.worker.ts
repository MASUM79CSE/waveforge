/// <reference lib="webworker" />
/**
 * P2.5 — ASR worker: thin RPC shell around asrHandlers with the REAL
 * transformers.js behind a dynamic import (its own lazy chunk; never
 * the entry bundle). Model bytes come exclusively from P1.3 storage
 * via the custom cache — the pipeline itself is offline by contract.
 */
import { serveRpc, workerEndpoint } from '../rpc/server';
import { createModelStorage } from '../models/storage';
import { createAsrHandlers, type TransformersLike } from './asrHandlers';

interface WorkerScope {
  onmessage: ((ev: { data: unknown }) => void) | null;
  postMessage: (data: unknown, transfer?: Transferable[]) => void;
}
const sw = self as unknown as WorkerScope;

serveRpc(
  workerEndpoint(sw),
  createAsrHandlers({
    // worker scope has CacheStorage; the app singleton lives with the
    // main thread's state — keep the worker decoupled from app modules
    storage: createModelStorage(caches),
    importLib: () => import('@huggingface/transformers') as Promise<TransformersLike>,
  }),
);
