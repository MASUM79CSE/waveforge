/**
 * RAG model downloader (P1.4): resumable, integrity-verified, cancelable,
 * retrying, concurrency-limited. Partials are stored next to the target
 * file as `<path>.partial` inside the same model cache, so a reload can
 * resume via HTTP Range. Verify-then-commit: the final file only appears
 * in storage if the SHA-256 matches.
 */
import type { ModelEntry, ModelFile } from './manifest';
import type { ModelStorage } from './storage';
import { RagQuotaError } from './storage';

export type DownloadErrorCode = 'NETWORK' | 'INTEGRITY' | 'QUOTA' | 'ABORTED';

export class DownloadError extends Error {
  readonly code: DownloadErrorCode;
  constructor(code: DownloadErrorCode, message: string) {
    super(message);
    this.name = 'DownloadError';
    this.code = code;
  }
}

export interface DownloadFileSpec extends Pick<ModelFile, 'path' | 'url' | 'sha256'> {
  bytes?: number;
}

export interface DownloadOptions {
  storage: ModelStorage;
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
  onProgress?: (pct: number) => void;
  /** Bytes already downloaded for this file (from a previous session). */
  initial?: ArrayBuffer;
  maxAttempts?: number;
  backoffMs?: (attempt: number) => number;
}

const DEFAULT_ATTEMPTS = 3;
const defaultBackoff = (attempt: number) => Math.min(1000, 2 ** attempt * 100);

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function merge(chunks: ArrayBuffer[]): ArrayBuffer {
  const total = chunks.reduce((s, c) => s + c.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(new Uint8Array(c), off);
    off += c.byteLength;
  }
  return out.buffer;
}

export async function downloadFile(
  modelId: string,
  version: string,
  spec: DownloadFileSpec,
  opts: DownloadOptions,
): Promise<void> {
  const { storage, fetchImpl, signal, onProgress } = opts;
  const maxAttempts = opts.maxAttempts ?? DEFAULT_ATTEMPTS;
  const backoffMs = opts.backoffMs ?? defaultBackoff;
  const partialPath = `${spec.path}.partial`;

  if (signal?.aborted) {
    throw new DownloadError('ABORTED', 'aborted before start');
  }

  const savePartial = (parts: ArrayBuffer[]): Promise<void> =>
    storage.put(modelId, version, partialPath, merge(parts)).catch(() => {});

  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, backoffMs(attempt)));
      if (signal?.aborted) throw new DownloadError('ABORTED', 'aborted during backoff');
    }
    const base = opts.initial ?? (await storage.open(modelId, partialPath)) ?? undefined;
    const baseLen = base?.byteLength ?? 0;
    try {
      const headers: Record<string, string> = baseLen > 0 ? { Range: `bytes=${baseLen}-` } : {};
      const resp = await fetchImpl(spec.url, { headers, signal });
      if (!resp.ok && resp.status !== 206) {
        throw new DownloadError('NETWORK', `HTTP ${resp.status} for ${spec.url}`);
      }
      const resumed206 = resp.status === 206 && baseLen > 0;
      const parts: ArrayBuffer[] = resumed206 && base ? [base] : [];
      const contentTotal =
        Number(resp.headers.get('content-length') ?? 0) + (resumed206 ? baseLen : 0) ||
        (spec.bytes ?? 0);

      let received = resumed206 ? baseLen : 0;
      if (!resumed206 && baseLen > 0) {
        // server ignored Range: clean restart
        await storage.deleteFile(modelId, partialPath).catch(() => {});
      }
      if (onProgress && contentTotal > 0) {
        onProgress(Math.min(100, Math.round((received / contentTotal) * 100)));
      }

      const reader = resp.body?.getReader();
      const onAbort = () => reader?.cancel().catch(() => {});
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        if (!reader) {
          const buf = await resp.arrayBuffer();
          parts.push(buf);
          received += buf.byteLength;
        } else {
          for (;;) {
            if (signal?.aborted) break;
            const { done, value } = await reader.read();
            if (done) break;
            parts.push(value.buffer as ArrayBuffer);
            received += value.byteLength;
            if (onProgress && contentTotal > 0) {
              onProgress(Math.min(100, Math.round((received / contentTotal) * 100)));
            }
          }
        }
      } finally {
        signal?.removeEventListener('abort', onAbort);
      }

      if (signal?.aborted) {
        // keep the partial for a future resume
        await savePartial(parts);
        throw new DownloadError('ABORTED', 'aborted mid-stream');
      }

      const final = merge(parts);
      const hex = await sha256Hex(final);
      if (hex !== spec.sha256.toLowerCase()) {
        await storage.deleteFile(modelId, partialPath).catch(() => {});
        throw new DownloadError('INTEGRITY', `sha256 mismatch for ${spec.path}`);
      }
      try {
        await storage.put(modelId, version, spec.path, final);
      } catch (err) {
        if (err instanceof RagQuotaError || (err instanceof DOMException && err.name === 'QuotaExceededError')) {
          throw new DownloadError('QUOTA', `storage quota exceeded while storing ${spec.path}`);
        }
        throw err;
      }
      await storage.deleteFile(modelId, partialPath).catch(() => {});
      onProgress?.(100);
      return;
    } catch (err) {
      if (err instanceof DownloadError && err.code === 'ABORTED') throw err;
      if (err instanceof DownloadError && err.code === 'QUOTA') throw err;
      if (err instanceof DownloadError && err.code === 'INTEGRITY') throw err;
      if (signal?.aborted) throw new DownloadError('ABORTED', 'aborted');
      lastError = err;
    }
  }
  throw new DownloadError(
    'NETWORK',
    `download failed after ${maxAttempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

export interface DownloadModelOptions extends Omit<DownloadOptions, 'initial'> {
  concurrency?: number;
}

/** Downloads every file of a model with a small worker pool (default 2). */
export async function downloadModel(
  modelId: string,
  model: Pick<ModelEntry, 'version' | 'files'>,
  opts: DownloadModelOptions,
): Promise<void> {
  const limit = opts.concurrency ?? 2;
  const queue = [...model.files];
  const workers: Promise<void>[] = [];
  const errors: DownloadError[] = [];
  const n = Math.min(limit, queue.length);
  for (let i = 0; i < n; i++) {
    workers.push(
      (async () => {
        for (;;) {
          const file = queue.shift();
          if (!file) return;
          try {
            await downloadFile(modelId, model.version, file, opts);
          } catch (err) {
            if (err instanceof DownloadError) errors.push(err);
            else errors.push(new DownloadError('NETWORK', String(err)));
            if (err instanceof DownloadError && (err.code === 'ABORTED' || err.code === 'QUOTA')) {
              // drain the queue fast on fatal conditions
              queue.length = 0;
            }
          }
        }
      })(),
    );
  }
  await Promise.all(workers);
  if (errors.length > 0) throw errors[0]!;
}
