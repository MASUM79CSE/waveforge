/**
 * Export service (M4): main-thread façade over the two encoder workers.
 * WAV encodes inline (memcpy-speed); MP3 runs in a module worker, FLAC in
 * a classic worker over the vendored emscripten build (ADR 006 §2).
 * Both workers stream progress, honour cancel, and return transferables.
 */
import { z } from 'zod';
import { encodeWav, type WavEncoding } from './wavEncoder';
import type { ExportFormat } from './exportName';

export interface ExportOptions {
  format: ExportFormat;
  /** wav: pcm16|pcm24|float32 · mp3: '128'|'192'|'256'|'320' · flac: '0'..'8' */
  quality: string;
}

export interface ExportJob {
  channels: Float32Array[];
  sampleRate: number;
  options: ExportOptions;
  onProgress?: (fraction: number) => void;
  signal?: { cancelled: boolean };
}

export interface ExportResult {
  blob: Blob;
  mimeType: string;
}

const workerProgress = z.object({
  type: z.literal('progress'),
  done: z.number(),
  total: z.number().positive(),
});
const workerDone = z.object({ type: z.literal('done'), data: z.instanceof(ArrayBuffer) });
const workerFail = z.union([
  z.object({ type: z.literal('cancelled') }),
  z.object({ type: z.literal('error'), detail: z.string() }),
]);

let nextJobId = 1;

export async function runExport(job: ExportJob): Promise<ExportResult> {
  const { format } = job.options;
  if (format === 'wav') {
    const encoding: WavEncoding =
      job.options.quality === 'pcm24' ? 'pcm24' : job.options.quality === 'float32' ? 'float32' : 'pcm16';
    job.onProgress?.(0.5);
    const buffer = encodeWav(job.channels, job.sampleRate, encoding);
    job.onProgress?.(1);
    return { blob: new Blob([buffer], { type: 'audio/wav' }), mimeType: 'audio/wav' };
  }
  if (format === 'mp3') return runMp3Worker(job);
  return runFlacWorker(job);
}

function spawnMp3Worker(): Worker {
  return new Worker(new URL('../workers/mp3Export.worker.ts', import.meta.url), {
    type: 'module',
  });
}

async function runMp3Worker(job: ExportJob): Promise<ExportResult> {
  const worker = spawnMp3Worker();
  const id = nextJobId++;
  const kbps = (['128', '192', '256', '320'].includes(job.options.quality)
    ? Number(job.options.quality)
    : 192) as 128 | 192 | 256 | 320;
  return driveWorker(worker, id, job, () => ({
    cmd: 'encode',
    id,
    sampleRate: job.sampleRate,
    kbps,
    left: job.channels[0] ?? new Float32Array(0),
    right: job.channels[1],
  }));
}

function spawnFlacWorker(): Worker {
  return new Worker('/workers/flac-export.worker.js'); // classic — importScripts inside
}

async function runFlacWorker(job: ExportJob): Promise<ExportResult> {
  const worker = spawnFlacWorker();
  const id = nextJobId++;
  const frames = job.channels[0]?.length ?? 0;
  return driveWorker(worker, id, job, () => ({
    cmd: 'encode',
    id,
    sampleRate: job.sampleRate,
    channels: job.channels.length >= 2 ? 2 : 1,
    bits: job.options.quality === '24' ? 24 : 16,
    level: Number(job.options.quality) || 5,
    frames,
    left: job.channels[0] ?? new Float32Array(0),
    right: job.channels[1],
  }));
}

/** Shared request/response plumbing: progress, cancel, cleanup, typing. */
function driveWorker(
  worker: Worker,
  id: number,
  job: ExportJob,
  makeRequest: () => Record<string, unknown>,
): Promise<ExportResult> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    };
    worker.onmessage = (event: MessageEvent) => {
      const parsedFail = workerFail.safeParse(event.data);
      if (parsedFail.success) {
        cleanup();
        if (parsedFail.data.type === 'cancelled') reject(new Error('cancelled'));
        else reject(new Error(parsedFail.data.detail));
        return;
      }
      const progress = workerProgress.safeParse(event.data);
      if (progress.success) {
        job.onProgress?.(progress.data.done / progress.data.total);
        return;
      }
      const done = workerDone.safeParse(event.data);
      if (done.success) {
        job.onProgress?.(1);
        cleanup();
        resolve({ blob: new Blob([done.data.data]), mimeType: 'application/octet-stream' });
      }
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || 'worker failure'));
    };
    worker.postMessage(makeRequest());
    // watch the cancel signal
    const watch = (): void => {
      if (job.signal?.cancelled) {
        worker.postMessage({ cmd: 'cancel', id });
        return;
      }
      setTimeout(watch, 120);
    };
    watch();
  });
}
