/**
 * RAG model storage (P1.3): Cache-API-backed, version-aware, never part of
 * the service-worker precache. An index entry (JSON in the same cache)
 * tracks the installed version per model id; `put` with a new version
 * evicts the old version's files first.
 */
import { z } from 'zod';

export const CACHE_NAME = 'waveforge-rag-models-v1';

/** Minimal Cache-API surface used here (duck-typed for fakes). */
export interface CacheLike {
  match: (key: string | Request) => Promise<Response | undefined>;
  put: (key: string | Request, resp: Response) => Promise<void>;
  delete: (key: string | Request) => Promise<boolean>;
}
export interface CachesLike {
  open: (name: string) => Promise<CacheLike>;
}

export class RagQuotaError extends Error {
  constructor(message = 'storage quota exceeded') {
    super(message);
    this.name = 'RagQuotaError';
  }
}

const IndexSchema = z.object({
  version: z.string(),
  files: z.array(z.object({ path: z.string(), bytes: z.number() })),
  installedAt: z.number(),
});
type IndexEntry = z.infer<typeof IndexSchema>;
type Index = Record<string, IndexEntry>;

const INDEX_KEY = '__index__';

function fileKey(modelId: string, version: string, path: string): string {
  return `models/${modelId}@${version}/${path}`;
}

async function readIndex(cache: CacheLike): Promise<Index> {
  const resp = await cache.match(INDEX_KEY);
  if (!resp) return {};
  const body = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  const out: Index = {};
  for (const [id, v] of Object.entries(body)) {
    const ok = IndexSchema.safeParse(v);
    if (ok.success) out[id] = ok.data;
  }
  return out;
}

async function writeIndex(cache: CacheLike, index: Index): Promise<void> {
  await cache.put(INDEX_KEY, new Response(JSON.stringify(index)));
}

export interface ModelStorage {
  has(modelId: string): Promise<boolean>;
  installedVersion(modelId: string): Promise<string | null>;
  put(modelId: string, version: string, path: string, data: ArrayBuffer): Promise<void>;
  open(modelId: string, path: string): Promise<ArrayBuffer | null>;
  delete(modelId: string): Promise<boolean>;
  listInstalled(): Promise<Array<{ id: string; version: string; bytes: number; installedAt: number }>>;
  usage(): Promise<number>;
}

export function createModelStorage(caches: CachesLike, cacheName = CACHE_NAME): ModelStorage {
  async function cache(): Promise<CacheLike> {
    return caches.open(cacheName);
  }

  async function evictVersion(cache: CacheLike, index: Index, modelId: string): Promise<void> {
    const old = index[modelId];
    if (!old) return;
    for (const f of old.files) {
      await cache.delete(fileKey(modelId, old.version, f.path));
    }
    delete index[modelId];
  }

  return {
    async has(modelId) {
      const c = await cache();
      return (await readIndex(c))[modelId] !== undefined;
    },

    async installedVersion(modelId) {
      const c = await cache();
      return (await readIndex(c))[modelId]?.version ?? null;
    },

    async put(modelId, version, path, data) {
      const c = await cache();
      const index = await readIndex(c);
      const existing = index[modelId];
      if (existing && existing.version !== version) {
        await evictVersion(c, index, modelId);
      } else if (existing) {
        // same version: drop the stale copy of just this path
        await c.delete(fileKey(modelId, version, path));
        existing.files = existing.files.filter((f) => f.path !== path);
      }
      try {
        await c.put(fileKey(modelId, version, path), new Response(data));
      } catch (err) {
        if (err instanceof DOMException && err.name === 'QuotaExceededError') {
          throw new RagQuotaError();
        }
        throw err;
      }
      const entry: IndexEntry = existing && existing.version === version
        ? {
            ...existing,
            files: [...existing.files.filter((f) => f.path !== path), { path, bytes: data.byteLength }],
          }
        : { version, files: [{ path, bytes: data.byteLength }], installedAt: Date.now() };
      index[modelId] = entry;
      await writeIndex(c, index);
    },

    async open(modelId, path) {
      const c = await cache();
      const index = await readIndex(c);
      const entry = index[modelId];
      if (!entry) return null;
      const resp = await c.match(fileKey(modelId, entry.version, path));
      return resp ? resp.arrayBuffer() : null;
    },

    async delete(modelId) {
      const c = await cache();
      const index = await readIndex(c);
      const entry = index[modelId];
      if (!entry) return false;
      await evictVersion(c, index, modelId);
      await writeIndex(c, index);
      return true;
    },

    async listInstalled() {
      const c = await cache();
      const index = await readIndex(c);
      return Object.entries(index)
        .map(([id, e]) => ({
          id,
          version: e.version,
          bytes: e.files.reduce((s, f) => s + f.bytes, 0),
          installedAt: e.installedAt,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
    },

    async usage() {
      const c = await cache();
      const index = await readIndex(c);
      return Object.values(index).reduce((s, e) => s + e.files.reduce((x, f) => x + f.bytes, 0), 0);
    },
  };
}
