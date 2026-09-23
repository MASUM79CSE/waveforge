/**
 * Decode pipeline. The AudioContext is created lazily and shared;
 * decodeAudioData must run on the main thread (browser limitation).
 */
import { logger } from '../core/logger-instance';
import { getErrorMessage } from '../core/errors';

let sharedCtx: AudioContext | null = null;

export function getSharedContext(): AudioContext {
  if (!sharedCtx) sharedCtx = new AudioContext();
  return sharedCtx;
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
  return decodeArrayBuffer(await blob.arrayBuffer());
}
