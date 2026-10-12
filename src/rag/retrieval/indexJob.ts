/**
 * P3.6 — index job controller: transcript → chunk → embed → store.
 * Same discipline as the P2.7 transcription controller: injected deps,
 * typed errors (ABORTED / MODEL_NOT_INSTALLED / INDEX_FAILED), progress
 * in [0,1] (1 exactly at completion), and idempotency — an existing
 * index for the same transcript+model short-circuits unless `force`
 * (re-index = atomic replace via putDoc). Cancel = cancel + re-run: no
 * partial rows survive (putDoc is the only writer, on success only).
 */
import type { CallOptions } from '../rpc/client';
import type { EmbedClient } from './embedClient';
import { chunkTranscript } from './chunk';
import type { IndexStorage } from './indexStore';
import type { TranscriptRecord } from '../transcripts/model';

export type IndexErrorCode = 'NO_SEGMENTS' | 'MODEL_NOT_INSTALLED' | 'ABORTED' | 'INDEX_FAILED';

export class IndexError extends Error {
  readonly code: IndexErrorCode;
  constructor(code: IndexErrorCode, message: string) {
    super(message);
    this.name = 'IndexError';
    this.code = code;
  }
}

export interface IndexDeps {
  index: IndexStorage;
  makeEmbedder: () => EmbedClient;
  /** The embedding model that must be installed (e.g. MiniLM class). */
  embedModel: { modelId: string; version: string };
  /** Returns the installed version of a model, or null (typed dep). */
  installedVersion: (modelId: string) => Promise<string | null>;
  clock: () => number;
}

export interface IndexRunOptions {
  signal?: AbortSignal;
  onProgress?: (pct: number) => void;
  device?: 'wasm' | 'webgpu';
  /** Re-index even when an up-to-date index exists. */
  force?: boolean;
}

export interface IndexRunResult {
  transcriptId: string;
  chunks: number;
  skipped: boolean;
}

/** Embedding batch size (texts per embed call). */
const BATCH = 16;

function codeOf(err: unknown): string | undefined {
  return (err as { code?: string } | null)?.code;
}

export function createIndexController(deps: IndexDeps) {
  return {
    async run(transcript: TranscriptRecord, opts: IndexRunOptions = {}): Promise<IndexRunResult> {
      const { signal, onProgress, device = 'wasm', force = false } = opts;
      if (signal?.aborted) throw new IndexError('ABORTED', 'aborted before start');
      if (transcript.segments.length === 0) {
        throw new IndexError('NO_SEGMENTS', 'transcript has no segments to index');
      }
      const version = await deps.installedVersion(deps.embedModel.modelId);
      if (!version) {
        throw new IndexError(
          'MODEL_NOT_INSTALLED',
          `embedding model ${deps.embedModel.modelId} is not installed — request it first`,
        );
      }

      // idempotency: an existing index for this transcript + embed model
      // (any version of it already installed) short-circuits unless forced
      if (!force) {
        const docs = await deps.index.listDocs();
        const existing = docs.find((d) => d.transcriptId === transcript.id);
        if (existing) {
          onProgress?.(1);
          return { transcriptId: transcript.id, chunks: existing.chunks, skipped: true };
        }
      }

      const chunks = chunkTranscript(transcript.id, transcript.segments);
      const embedder = deps.makeEmbedder();
      try {
        await embedder.init(
          { modelId: deps.embedModel.modelId, version, device },
          { signal } as CallOptions,
        );
        const rows = chunks.map((c, i) => ({
          id: c.id,
          transcriptId: transcript.id,
          index: i,
          text: c.text,
          startSec: c.startSec,
          endSec: c.endSec,
          segmentIds: c.segmentIds,
          vector: new Float32Array(0),
          dim: 0,
          modelId: deps.embedModel.modelId,
          embeddedAt: deps.clock(),
        }));
        const total = rows.length;
        let done = 0;
        onProgress?.(0);
        for (let off = 0; off < total; off += BATCH) {
          const batch = chunks.slice(off, off + BATCH).map((c) => c.text);
          const res = await embedder.embed(batch, { signal } as CallOptions);
          res.vectors.forEach((v, j) => {
            const row = rows[off + j];
            if (!row) return;
            row.vector = v;
            row.dim = v.length;
          });
          done += batch.length;
          onProgress?.(Math.min(0.999, done / total));
        }
        await deps.index.putDoc(transcript.id, rows);
        onProgress?.(1);
        return { transcriptId: transcript.id, chunks: total, skipped: false };
      } catch (err) {
        if (signal?.aborted || codeOf(err) === 'ABORTED') {
          throw new IndexError('ABORTED', 'indexing cancelled');
        }
        if (err instanceof IndexError) throw err;
        if (codeOf(err) === 'MODEL_NOT_INSTALLED') {
          throw new IndexError('MODEL_NOT_INSTALLED', (err as Error).message);
        }
        throw new IndexError('INDEX_FAILED', (err as Error)?.message ?? 'indexing failed');
      } finally {
        embedder.close();
      }
    },
  };
}

export type IndexController = ReturnType<typeof createIndexController>;
