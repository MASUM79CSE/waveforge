/**
 * P2.2 — typed client for the feeder worker. Built on the P1.2 RPC
 * client: every call is id-correlated, cancelable (AbortSignal), and
 * transfer-aware. Input channel buffers are transferred by default —
 * callers must pass buffers they own (e.g. per-block copies); the
 * decoded AudioBuffer itself can never be transferred.
 */
import { createRpcClient, type CallOptions, type RpcWorkerLike } from '../rpc/client';
import type { FeederOptions, FeedResult } from './feeder';

export interface FeederClient {
  init(
    opts: FeederOptions,
    call?: CallOptions,
  ): Promise<{ accepted: boolean; winLen: number; hopLen: number; dstRate: number }>;
  /** Feed one block; resolves with the windows that became ready. */
  feed(channels: Float32Array[], call?: CallOptions): Promise<FeedResult>;
  /** End of input; flushes and emits the final window. */
  finish(call?: CallOptions): Promise<FeedResult>;
  close(): void;
}

/** Deduplicate the buffers behind `channels` for the transfer list. */
function channelTransfer(channels: Float32Array[]): Transferable[] {
  const seen = new Set<ArrayBuffer>();
  for (const ch of channels) {
    const buf = ch.buffer as ArrayBuffer;
    if (buf instanceof ArrayBuffer) seen.add(buf);
  }
  return [...seen];
}

export function createFeederClient(makeWorker: () => RpcWorkerLike): FeederClient {
  const rpc = createRpcClient(makeWorker);
  return {
    init: (opts, call) => rpc.call('feeder.init', opts, call),
    feed: (channels, call) =>
      rpc.call('feeder.feed', { channels }, { ...call, transfer: call?.transfer ?? channelTransfer(channels) }),
    finish: (call) => rpc.call('feeder.finish', undefined, call),
    close: () => rpc.close(),
  };
}

/** Real worker factory (browser only — never imported by unit tests). */
export function createFeederWorker(): Worker {
  return new Worker(new URL('./feeder.worker.ts', import.meta.url), { type: 'module' });
}
