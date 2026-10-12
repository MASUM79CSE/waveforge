/**
 * P2.5 — ASR worker handlers. The heavy library is reached ONLY through
 * the injected `importLib` (in the real worker: `() => import(
 * '@huggingface/transformers')`; in tests: a fake). That keeps the
 * dependency out of every chunk except the worker's own, and keeps CI
 * model-free by construction.
 *
 * Network contract (structural): `allowRemoteModels=false` + the P1.3
 * storage cache (asrCache.ts) — model files must already be installed
 * via the consented downloader; a missing file is a typed
 * MODEL_NOT_INSTALLED error, never a fetch.
 */
import type { RpcHandlers } from '../rpc/server';
import { createStorageCache } from './asrCache';
import { AsrInitSchema, AsrTranscribeSchema, type AsrResult } from './asrProtocol';
import type { ModelStorage } from '../models/storage';
import type { TranscriptSegment } from '../transcripts/model';

/** Minimal surface of @huggingface/transformers the handlers use. */
export interface AsrPipelineLike {
  (
    audio: Float32Array,
    opts?: Record<string, unknown>,
  ): Promise<{
    text?: string;
    chunks?: Array<{ text?: string; timestamp?: [number | null, number | null] }>;
  }>;
}

export interface TransformersLike {
  env: {
    useCustomCache: boolean;
    customCache: unknown;
    allowRemoteModels: boolean;
    allowLocalModels: boolean;
    backends: { onnx: { wasm: { wasmPaths: string } } };
  };
  pipeline(task: string, model: string, opts?: Record<string, unknown>): Promise<AsrPipelineLike>;
}

export interface AsrDeps {
  storage: ModelStorage;
  importLib: () => Promise<TransformersLike>;
  /** Base path of the vendored ort wasm assets. Default `/rag-assets/ort/`. */
  ortBasePath?: string;
}

function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}

async function parseOrThrow<T>(schema: { safeParse(v: unknown): { success: boolean; data?: T } }, payload: unknown): Promise<T> {
  const parsed = await Promise.resolve(schema.safeParse(payload));
  if (!parsed.success || parsed.data === undefined) fail('BAD_PAYLOAD', 'asr: bad payload');
  return parsed.data;
}

export function createAsrHandlers(deps: AsrDeps): RpcHandlers {
  let pipe: AsrPipelineLike | null = null;

  return {
    /** Init: verify install, configure env (no network), build pipeline. */
    'asr.init': async (payload) => {
      const { modelId, version, device } = await parseOrThrow(AsrInitSchema, payload);
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
      pipe = await lib.pipeline('automatic-speech-recognition', modelId, {
        device,
        dtype: 'q8',
      });
      return { ready: true, device };
    },

    /** Transcribe one 16 kHz mono window. */
    'asr.transcribe': async (payload) => {
      if (!pipe) fail('NOT_INITIALIZED', 'asr: init required');
      const { samples } = await parseOrThrow(AsrTranscribeSchema, payload);
      const out = await pipe(samples, {
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5,
      });
      const segments: TranscriptSegment[] = [];
      let prevEnd = 0;
      for (const chunk of out.chunks ?? []) {
        const text = chunk.text ?? '';
        const start = chunk.timestamp?.[0] ?? prevEnd;
        const rawEnd = chunk.timestamp?.[1];
        // Whisper's last chunk often has a null end — close at start+1
        const end = rawEnd ?? start + 1;
        if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
        prevEnd = end;
        segments.push({ start: Math.max(0, start), end: Math.max(start, end), text });
      }
      const result: AsrResult = { segments, text: out.text ?? '' };
      return result;
    },

    /** Release the pipeline (model weights become GC-able). */
    'asr.dispose': async () => {
      pipe = null;
      return { disposed: true };
    },
  };
}
