/**
 * P3.3 — embedding RPC handlers (worker side). Mirrors asrHandlers:
 * injectable `importLib` keeps transformers.js out of every chunk except
 * this worker's, and out of CI entirely (fakes at the seam).
 * Offline contract identical to P2.5: allowRemoteModels=false + storage
 * custom cache; a missing model file is MODEL_NOT_INSTALLED, never a
 * fetch.
 */
import type { RpcHandlers } from '../rpc/server';
import { withTransfer } from '../rpc/protocol';
import { createStorageCache } from '../asr/asrCache';
import { EmbedInitSchema, EmbedRequestSchema, type EmbedResult } from './embedProtocol';
import type { ModelStorage } from '../models/storage';

/** Minimal surface of the feature-extraction pipeline we use. */
export interface EmbedPipelineLike {
  (
    texts: string[],
    opts?: Record<string, unknown>,
  ): Promise<{ data: Float32Array; dims: number[] }>;
}

export interface EmbedTransformersLike {
  env: {
    useCustomCache: boolean;
    customCache: unknown;
    allowRemoteModels: boolean;
    allowLocalModels: boolean;
    backends: { onnx: { wasm: { wasmPaths: string } } };
  };
  pipeline(task: string, model: string, opts?: Record<string, unknown>): Promise<EmbedPipelineLike>;
}

export interface EmbedDeps {
  storage: ModelStorage;
  importLib: () => Promise<EmbedTransformersLike>;
  ortBasePath?: string;
}

function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}

async function parseOrThrow<T>(
  schema: { safeParse(v: unknown): { success: boolean; data?: T } },
  payload: unknown,
): Promise<T> {
  const parsed = await Promise.resolve(schema.safeParse(payload));
  if (!parsed.success || parsed.data === undefined) fail('BAD_PAYLOAD', 'embed: bad payload');
  return parsed.data;
}

export function createEmbedHandlers(deps: EmbedDeps): RpcHandlers {
  let pipe: EmbedPipelineLike | null = null;

  return {
    'embed.init': async (payload) => {
      const { modelId, version, device } = await parseOrThrow(EmbedInitSchema, payload);
      const installed = await deps.storage.installedVersion(modelId);
      if (installed !== version) {
        fail('MODEL_NOT_INSTALLED', `model ${modelId}@${version} is not installed`);
      }
      const lib = await deps.importLib();
      lib.env.useCustomCache = true;
      lib.env.customCache = createStorageCache(deps.storage, modelId);
      lib.env.allowRemoteModels = false;
      lib.env.allowLocalModels = false;
      lib.env.backends.onnx.wasm.wasmPaths = deps.ortBasePath ?? '/rag-assets/ort/';
      pipe = await lib.pipeline('feature-extraction', modelId, { device, dtype: 'q8' });
      return { ready: true, device };
    },

    'embed.embed': async (payload) => {
      if (!pipe) fail('NOT_INITIALIZED', 'embed: init required');
      const { texts } = await parseOrThrow(EmbedRequestSchema, payload);
      const out = await pipe(texts, { pooling: 'mean', normalize: true });
      // tensor [n, d] → n rows (structured clone keeps Float32Array exact)
      const [n = 0, d = 0] = out.dims;
      const vectors: EmbedResult['vectors'] = [];
      for (let row = 0; row < n; row++) {
        // fresh concrete buffer (typed-array variance under the current lib)
        vectors.push(
          Float32Array.from(out.data.subarray(row * d, (row + 1) * d)) as EmbedResult['vectors'][number],
        );
      }
      const result: EmbedResult = { vectors };
      // zero-copy handoff: every vector buffer rides the transfer list
      return vectors.length > 0
        ? withTransfer(result, vectors.map((v) => v.buffer as ArrayBuffer))
        : result;
    },

    'embed.dispose': async () => {
      pipe = null;
      return { disposed: true };
    },
  };
}
