/**
 * Export service (M4): main-thread façade over the three encoder workers.
 * WAV/MP3 run in module workers; FLAC in a classic worker over the vendored
 * emscripten build (ADR 006 §2; WAV moved off-thread by WF-003). All three
 * stream real progress, honour cancel, and return transferables.
 */
import { z } from 'zod';
import type { WavEncoding } from './wavEncoder';
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
  /**
   * WF-002: declare that the caller owns these channel arrays outright
   * (e.g. fresh `sliceRegion` copies) and they are never read again —
   * the worker request is then transferred (zero-copy move) instead of
   * structured-cloned. Default (undefined/false) NEVER transfers: the
   * clone keeps canonical AudioDocument data intact.
   */
  transferChannels?: boolean;
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
  if (format === 'wav') return runWavWorker(job);
  if (format === 'mp3') return runMp3Worker(job);
  return runFlacWorker(job);
}

function spawnWavWorker(): Worker {
  return new Worker(new URL('../workers/wavExport.worker.ts', import.meta.url), {
    type: 'module',
  });
}

async function runWavWorker(job: ExportJob): Promise<ExportResult> {
  const worker = spawnWavWorker();
  const id = nextJobId++;
  const encoding: WavEncoding =
    job.options.quality === 'pcm24' ? 'pcm24' : job.options.quality === 'float32' ? 'float32' : 'pcm16';
  const left = job.channels[0] ?? new Float32Array(0);
  const right = job.channels[1];
  // transfer only caller-owned buffers; the default clones (WF-002)
  const transfer: Transferable[] | undefined = job.transferChannels
    ? right
      ? [left.buffer, right.buffer]
      : [left.buffer]
    : undefined;
  const result = await driveWorker(
    worker,
    id,
    job,
    () => ({
      cmd: 'encode',
      id,
      sampleRate: job.sampleRate,
      encoding,
      left,
      right,
    }),
    transfer,
  );
  return { ...result, mimeType: 'audio/wav' };
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
  const left = job.channels[0] ?? new Float32Array(0);
  const right = job.channels[1];
  // transfer only caller-owned buffers; the default clones (WF-002)
  const transfer: Transferable[] | undefined = job.transferChannels
    ? right
      ? [left.buffer, right.buffer]
      : [left.buffer]
    : undefined;
  return driveWorker(
    worker,
    id,
    job,
    () => ({
      cmd: 'encode',
      id,
      sampleRate: job.sampleRate,
      kbps,
      left,
      right,
    }),
    transfer,
  );
}

function spawnFlacWorker(): Worker {
  return new Worker('/workers/flac-export.worker.js'); // classic — importScripts inside
}

async function runFlacWorker(job: ExportJob): Promise<ExportResult> {
  const worker = spawnFlacWorker();
  const id = nextJobId++;
  const frames = job.channels[0]?.length ?? 0;
  const left = job.channels[0] ?? new Float32Array(0);
  const right = job.channels[1];
  // transfer only caller-owned buffers; the default clones (WF-002)
  const transfer: Transferable[] | undefined = job.transferChannels
    ? right
      ? [left.buffer, right.buffer]
      : [left.buffer]
    : undefined;
  return driveWorker(
    worker,
    id,
    job,
    () => ({
      cmd: 'encode',
      id,
      sampleRate: job.sampleRate,
      channels: job.channels.length >= 2 ? 2 : 1,
      bits: job.options.quality === '24' ? 24 : 16,
      level: Number(job.options.quality) || 5,
      frames,
      left,
      right,
    }),
    transfer,
  );
}

/** Shared request/response plumbing: progress, cancel, cleanup, typing. */
function driveWorker(
  worker: Worker,
  id: number,
  job: ExportJob,
  makeRequest: () => Record<string, unknown>,
  transfer?: Transferable[],
): Promise<ExportResult> {
  return new Promise((resolve, reject) => {
    // WF-001: the cancel watcher is cancellable itself — cleanup() stops
    // it on every terminal path, so no timer (and no retained job closure)
    // outlives the export and no `cancel` is ever posted after settlement.
    let watchTimer: ReturnType<typeof setTimeout> | undefined;
    let watchStopped = false;
    const stopWatcher = (): void => {
      watchStopped = true;
      if (watchTimer !== undefined) clearTimeout(watchTimer);
      watchTimer = undefined;
    };
    const cleanup = (): void => {
      stopWatcher();
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
    if (transfer) worker.postMessage(makeRequest(), transfer);
    else worker.postMessage(makeRequest());
    // watch the cancel signal (stopped by cleanup() on every terminal path)
    const watch = (): void => {
      if (watchStopped) return;
      if (job.signal?.cancelled) {
        worker.postMessage({ cmd: 'cancel', id });
        return;
      }
      watchTimer = setTimeout(watch, 120);
    };
    watch();
  });
}
