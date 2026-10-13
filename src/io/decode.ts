/**
 * Decode pipeline. The AudioContext is created lazily and shared;
 * decodeAudioData must run on the main thread (browser limitation).
 */
import { logger } from '../core/logger-instance';
import { WaveForgeError, getErrorMessage } from '../core/errors';

let sharedCtx: AudioContext | null = null;

export function getSharedContext(): AudioContext {
  if (!sharedCtx) sharedCtx = new AudioContext();
  return sharedCtx;
}

/** Resume the shared context if it exists (never creates one). */
export function resumeSharedContext(): void {
  if (sharedCtx && sharedCtx.state !== 'running') {
    void sharedCtx.resume().catch(() => {});
  }
}

/**
 * WF-009 — decode limits. A compressed file within the 512 MB import cap
 * can still decode to gigabytes of PCM (1 h stereo 48 kHz = 1.38 GB), so
 * the DECODED size is guarded after decode, and a watchdog prevents a
 * hung `decodeAudioData` from leaving the loading spinner up forever.
 */
export const DECODED_BUDGET_BYTES = 512 * 1024 * 1024; // 512 MiB of float32 PCM
export const DECODE_TIMEOUT_MS = 60_000;

/** Decoded in-memory size: frames × channels × 4 bytes (IEEE float32). */
export function estimateDecodedBytes(buffer: {
  length: number;
  numberOfChannels: number;
}): number {
  return buffer.length * buffer.numberOfChannels * 4;
}

/** Rejects (typed WF-E103) when the decoded buffer exceeds the budget. */
export function assertDecodedBudget(
  buffer: { length: number; numberOfChannels: number },
  budget: number = DECODED_BUDGET_BYTES,
): void {
  const bytes = estimateDecodedBytes(buffer);
  if (bytes > budget) {
    throw new WaveForgeError('WF-E103', 'decoded audio beyond memory budget', {
      context: { decodedBytes: bytes, budgetBytes: budget },
    });
  }
}

/** Rejects (typed WF-E104) when `decode` does not settle within `ms`. */
export function withDecodeTimeout<T>(
  decode: Promise<T>,
  ms: number = DECODE_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const watchdog = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new WaveForgeError('WF-E104', 'decode timed out'));
    }, ms);
  });
  return Promise.race([
    decode.finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    }),
    watchdog,
  ]);
}

export function decodeArrayBuffer(data: ArrayBuffer): Promise<AudioBuffer> {
  const ctx = getSharedContext();
  return new Promise((resolve, reject) => {
    ctx.decodeAudioData(
      data,
      (buffer) => resolve(buffer),
      (error) => {
        logger.error('decodeAudioData failed', { detail: getErrorMessage(error) });
        reject(error ?? new Error('decode failed'));
      },
    );
  });
}

export async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const data = await blob.arrayBuffer();
  const buffer = await withDecodeTimeout(decodeArrayBuffer(data));
  assertDecodedBudget(buffer);
  return buffer;
}
