/**
 * P4.5 — LLM RPC handlers (worker side). Mirrors embedHandlers:
 * injectable `importLib` keeps transformers.js out of every chunk except
 * this worker's, and out of CI entirely (fakes at the seam). Offline
 * contract identical to P2.5: allowRemoteModels=false + storage custom
 * cache; a missing model is MODEL_NOT_INSTALLED, never a fetch.
 */
import type { RpcHandlers } from '../rpc/server';
import { createStorageCache } from '../asr/asrCache';
import { LlmInitSchema, LlmGenerateSchema } from './llmProtocol';
import type { ModelStorage } from '../models/storage';

/** Minimal surface of the text-generation pipeline we use. */
export interface LlmPipelineLike {
  (prompt: string, opts?: Record<string, unknown>): Promise<
    Array<{ generated_text: string }>
  >;
  dispose?: () => Promise<void>;
}

export interface LlmTransformersLike {
  env: {
    useCustomCache: boolean;
    customCache: unknown;
    allowRemoteModels: boolean;
    allowLocalModels: boolean;
    backends: { onnx: { wasm: { wasmPaths: string } } };
  };
  pipeline(task: string, model: string, opts?: Record<string, unknown>): Promise<LlmPipelineLike>;
}

export interface LlmDeps {
  storage: ModelStorage;
  importLib: () => Promise<LlmTransformersLike>;
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
  if (!parsed.success || parsed.data === undefined) fail('BAD_PAYLOAD', 'llm: bad payload');
  return parsed.data;
}

export function createLlmHandlers(deps: LlmDeps): RpcHandlers {
  let pipe: LlmPipelineLike | null = null;

  return {
    'llm.init': async (payload) => {
      const { modelId, version, device } = await parseOrThrow(LlmInitSchema, payload);
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
      pipe = await lib.pipeline('text-generation', modelId, { device, dtype: 'q4' });
      return { ready: true, device };
    },

    'llm.generate': async (payload) => {
      if (!pipe) fail('NOT_INITIALIZED', 'llm: init required');
      const { prompt, maxNewTokens, temperature } = await parseOrThrow(LlmGenerateSchema, payload);
      const out = await pipe(prompt, {
        max_new_tokens: maxNewTokens,
        do_sample: temperature > 0,
        temperature,
      });
      const first = out[0]?.generated_text ?? '';
      // some models echo the prompt back — strip a leading copy (deterministic)
      const text = first.startsWith(prompt) ? first.slice(prompt.length) : first;
      return { text: text.trim() };
    },

    'llm.dispose': async () => {
      if (pipe?.dispose) await pipe.dispose();
      pipe = null;
      return { disposed: true };
    },
  };
}
