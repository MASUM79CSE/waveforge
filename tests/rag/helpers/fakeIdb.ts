/**
 * P2.3 — in-memory fake IndexedDB, shaped exactly around the surfaces
 * `src/rag/transcripts/idb.ts` uses: `open(name, version)` with async
 * `onupgradeneeded` (carrying `oldVersion` and a version transaction),
 * request callbacks fired via microtasks, upgrade history recorded.
 * Reusable for later IDB-backed stores (P2.5 cache, P3.4 index).
 */
import type {
  IDBDatabaseLike,
  IDBObjectStoreLike,
  IDBRequestLike,
} from '../../../src/rag/transcripts/idb';
import type { IndexFactoryLike } from '../../../src/rag/retrieval/indexStore';

interface FakeRow {
  value: Record<string, unknown>;
}

type FakeRequest = IDBRequestLike & { _set: (v?: unknown) => void; _fail: (e: unknown) => void };

function mkRequest(): FakeRequest {
  const req = {
    result: undefined as unknown,
    error: null as unknown,
    transaction: undefined as unknown,
    onsuccess: null as ((ev?: unknown) => void) | null,
    onerror: null as ((ev?: unknown) => void) | null,
    onupgradeneeded: null as ((ev?: { oldVersion?: number }) => void) | null,
    _set(v?: unknown) {
      queueMicrotask(() => {
        req.result = v as unknown;
        req.onsuccess?.({});
      });
    },
    _fail(e: unknown) {
      queueMicrotask(() => {
        req.error = e;
        req.onerror?.({});
      });
    },
  };
  return req as FakeRequest;
}

/** Wide store shape — satisfies both the transcript and index interfaces. */
function mkStore(db: FakeIDB, name: string): IDBObjectStoreLike {
  const rows = db.stores.get(name) ?? new Map<string, FakeRow>();
  db.stores.set(name, rows);
  const store = {
    get(key: string) {
      const r = db.request();
      r._set(rows.get(key)?.value);
      return r;
    },
    put(value: Record<string, unknown>) {
      const r = db.request();
      if (db.quotaFail) {
        r._fail(Object.assign(new Error('quota'), { name: 'QuotaExceededError' }));
      } else {
        const keyPath = db.keyPaths.get(name) ?? 'id';
        const key = (value as Record<string, unknown>)[keyPath] as string;
        rows.set(key, { value: structuredClone(value) });
        r._set(key);
      }
      return r;
    },
    delete(key: string) {
      const r = db.request();
      rows.delete(key);
      r._set(undefined);
      return r;
    },
    getAll() {
      const r = db.request();
      r._set([...rows.values()].map((row) => row.value));
      return r;
    },
    createIndex() {
      /* index existence only — ordering stays in JS */
      return undefined;
    },
  };
  return store;
}

export class FakeIDB {
  version = 0;
  /** store name → key → row */
  readonly stores = new Map<string, Map<string, FakeRow>>();
  readonly upgradesRun: number[] = [];
  /** When true, puts fail with a QuotaExceededError-named error. */
  quotaFail = false;
  /** When set, opening rejects with this error. */
  openError: unknown = null;
  /** store name → keyPath (set by createObjectStore). */
  readonly keyPaths = new Map<string, string>();

  request(): FakeRequest {
    return mkRequest();
  }

  storeHandle(name: string): IDBObjectStoreLike {
    return mkStore(this, name);
  }

  /** Same factory, typed for the P3.4 index-store interfaces. */
  indexFactory(): IndexFactoryLike {
    return this.factory as unknown as IndexFactoryLike;
  }

  readonly factory = {
    open: (_name: string, version: number): IDBRequestLike => {
      const r = this.request();
      queueMicrotask(() => {
        if (this.openError) {
          r._fail(this.openError);
          return;
        }
        const database: IDBDatabaseLike = {
          objectStoreNames: { contains: (n) => this.stores.has(n) },
          createObjectStore: (n, opts) => {
            this.stores.set(n, new Map());
            this.keyPaths.set(n, opts.keyPath);
            return this.storeHandle(n);
          },
          transaction: () => ({ objectStore: (s: string) => this.storeHandle(s) }),
        };
        // real IDB: request.result is available during onupgradeneeded
        r.result = database;
        if (version > this.version) {
          const oldVersion = this.version;
          r.transaction = database.transaction('transcripts');
          r.onupgradeneeded?.({ oldVersion });
          this.upgradesRun.push(version);
          this.version = version;
        }
        queueMicrotask(() => r.onsuccess?.({}));
      });
      return r;
    },
  };
}
