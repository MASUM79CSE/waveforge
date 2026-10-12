/**
 * P2.5/P2.7 — typed client for the ASR worker (mirrors feederClient).
 * Window samples are transferred (owned fresh copies from the feeder).
 */
import { createRpcClient, type CallOptions, type RpcWorkerLike } from '../rpc/client';
import type { AsrResult } from './asrProtocol';

export interface AsrInitOptions {
  modelId: string;
  version: string;
  device?: 'wasm' | 'webgpu';
}

export interface AsrClient {
  init(opts: AsrInitOptions, call?: CallOptions): Promise<{ ready: boolean; device: string }>;
  transcribe(samples: Float32Array, call?: CallOptions): Promise<AsrResult>;
  dispose(call?: CallOptions): Promise<{ disposed: boolean }>;
  close(): void;
}

export function createAsrClient(makeWorker: () => RpcWorkerLike): AsrClient {
  const rpc = createRpcClient(makeWorker);
  return {
    init: (opts, call) => rpc.call('asr.init', opts, call),
    transcribe: (samples, call) =>
      rpc.call('asr.transcribe', { samples }, { ...call, transfer: call?.transfer ?? [samples.buffer as ArrayBuffer] }),
    dispose: (call) => rpc.call('asr.dispose', undefined, call),
    close: () => rpc.close(),
  };
}

/** Real worker factory (browser only — never imported by unit tests). */
export function createAsrWorker(): Worker {
  return new Worker(new URL('./asr.worker.ts', import.meta.url), { type: 'module' });
}
