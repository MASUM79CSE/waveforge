/**
 * P3.4 — retrieval index storage (IDB). Persists chunks + their embedding
 * vectors per transcript id, owned by Smart RAG, never in the SW precache.
 * Versioned upgrade chain (v1: store + byDocId index) mirrors the
 * transcript store (P2.3); the same fake-IDB pattern drives tests.
 */
import { z } from 'zod';
import { RagQuotaError } from '../models/storage';

export const INDEX_DB = 'waveforge-rag-index';
export const INDEX_STORE = 'chunks';
export const INDEX_DB_VERSION = 1;

export const StoredChunkSchema = z.object({
  id: z.string().min(1),
  transcriptId: z.string().min(1),
  index: z.number().int().nonnegative(),
  text: z.string(),
  startSec: z.number().nonnegative(),
  endSec: z.number().nonnegative(),
  segmentIds: z.array(z.number().int().nonnegative()),
  vector: z.instanceof(Float32Array),
  dim: z.number().int().positive(),
  modelId: z.string().min(1),
  embeddedAt: z.number().int().nonnegative(),
});
export type StoredChunk = z.infer<typeof StoredChunkSchema>;

/** Minimal IDB surfaces (duck-typed for fakes). */
export interface IndexRequestLike {
  result: unknown;
  error: unknown;
  transaction?: { objectStore(name: string): IndexObjectStoreLike };
  onsuccess: ((ev?: unknown) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
  onupgradeneeded: ((ev?: { oldVersion?: number }) => void) | null;
}
export interface IndexObjectStoreLike {
  get(key: string): IndexRequestLike;
  put(value: StoredChunk): IndexRequestLike;
  delete(key: string): IndexRequestLike;
  getAll(): IndexRequestLike;
  createIndex(name: string, keyPath: string): unknown;
}
export interface IndexDatabaseLike {
  objectStoreNames: { contains(name: string): boolean };
  createObjectStore(name: string, opts: { keyPath: string }): IndexObjectStoreLike;
  transaction(name: string, mode?: 'readonly' | 'readwrite'): {
    objectStore(name: string): IndexObjectStoreLike;
  };
}
export interface IndexFactoryLike {
  open(name: string, version: number): IndexRequestLike;
}

/** v1: chunks store keyed by chunk id + byDocId index (advisory). */
export function upgradeIndexDB(db: IndexDatabaseLike, from: number): void {
  if (from < 1) {
    const store = db.createObjectStore(INDEX_STORE, { keyPath: 'id' });
    store.createIndex('by-doc', 'transcriptId');
  }
}

function wire<T>(request: IndexRequestLike): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error ?? new Error('idb error'));
  });
}

/** Open (and migrate) the index DB; resolves to a duck-typed store handle. */
export function openIndexDB(indexedDB: IndexFactoryLike): Promise<IndexDatabaseLike> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(INDEX_DB, INDEX_DB_VERSION);
    open.onupgradeneeded = (ev) => {
      const db = open.result as unknown as IndexDatabaseLike;
      upgradeIndexDB(db, ((ev ?? {}) as { oldVersion?: number }).oldVersion ?? 0);
    };
    open.onsuccess = () => resolve(open.result as unknown as IndexDatabaseLike);
    open.onerror = () => reject(open.error ?? new Error('idb open failed'));
  });
}

export interface IndexDocInfo {
  transcriptId: string;
  chunks: number;
  dim: number;
  modelId: string;
  embeddedAt: number;
}

export interface IndexStorage {
  /** Atomically replace the stored chunks of one transcript. */
  putDoc(transcriptId: string, chunks: readonly StoredChunk[]): Promise<void>;
  deleteDoc(transcriptId: string): Promise<boolean>;
  /** Metadata per indexed transcript, newest first. */
  listDocs(): Promise<IndexDocInfo[]>;
  /** All valid chunk rows (corrupt rows silently dropped). */
  loadAll(): Promise<StoredChunk[]>;
}

function isQuota(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === 'QuotaExceededError';
}

function validate(row: unknown): StoredChunk | null {
  const parsed = StoredChunkSchema.safeParse(row);
  return parsed.success ? parsed.data : null;
}

export function createIndexStorage(db: IndexDatabaseLike): IndexStorage {
  const store = (mode: 'readonly' | 'readwrite') => db.transaction(INDEX_STORE, mode).objectStore(INDEX_STORE);

  return {
    async putDoc(transcriptId, chunks) {
      // validate first — nothing is written when any row is malformed
      const valid: StoredChunk[] = [];
      for (const c of chunks) {
        const parsed = StoredChunkSchema.safeParse(c);
        if (!parsed.success) {
          throw Object.assign(new Error(`index: bad chunk ${c.id}`), { code: 'BAD_CHUNK' });
        }
        valid.push(parsed.data);
      }
      try {
        const all = await wire<unknown[]>(store('readonly').getAll());
        for (const row of all) {
          const rec = validate(row);
          if (rec?.transcriptId === transcriptId) await wire(store('readwrite').delete(rec.id));
        }
        for (const c of valid) await wire(store('readwrite').put(c));
      } catch (err) {
        if (isQuota(err)) throw new RagQuotaError();
        throw err;
      }
    },

    async deleteDoc(transcriptId) {
      try {
        const all = await wire<unknown[]>(store('readonly').getAll());
        let removed = false;
        for (const row of all) {
          const rec = validate(row);
          if (rec?.transcriptId === transcriptId) {
            await wire(store('readwrite').delete(rec.id));
            removed = true;
          }
        }
        return removed;
      } catch (err) {
        if (isQuota(err)) throw new RagQuotaError();
        throw err;
      }
    },

    async listDocs() {
      const all = await wire<unknown[]>(store('readonly').getAll());
      const byDoc = new Map<string, IndexDocInfo>();
      for (const row of all) {
        const rec = validate(row);
        if (!rec) continue;
        const info = byDoc.get(rec.transcriptId);
        if (info) {
          info.chunks += 1;
          if (rec.embeddedAt > info.embeddedAt) info.embeddedAt = rec.embeddedAt;
        } else {
          byDoc.set(rec.transcriptId, {
            transcriptId: rec.transcriptId,
            chunks: 1,
            dim: rec.dim,
            modelId: rec.modelId,
            embeddedAt: rec.embeddedAt,
          });
        }
      }
      return [...byDoc.values()].sort((a, b) => b.embeddedAt - a.embeddedAt);
    },

    async loadAll() {
      const all = await wire<unknown[]>(store('readonly').getAll());
      const out: StoredChunk[] = [];
      for (const row of all) {
        const rec = validate(row);
        if (rec) out.push(rec);
      }
      return out.sort((a, b) => a.transcriptId.localeCompare(b.transcriptId) || a.index - b.index);
    },
  };
}
