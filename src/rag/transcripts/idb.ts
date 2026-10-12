/**
 * P2.3 — real IndexedDB adapter for transcript storage. Versioned with
 * an explicit upgrade chain (v1: store; v2: createdAt index) so future
 * schema changes migrate in place. All callbacks are duck-typed
 * (`IDBFactoryLike`) — unit tests drive it on a fake IDB.
 */
import type { TranscriptDBLike } from './store';
import type { TranscriptRecord } from './model';

export const TRANSCRIPT_DB = 'waveforge-rag-transcripts';
export const TRANSCRIPT_STORE = 'transcripts';
export const TRANSCRIPT_DB_VERSION = 2;

/** Minimal IDB surfaces used here (duck-typed for fakes). */
export interface IDBRequestLike {
  result: unknown;
  error: unknown;
  transaction?: { objectStore(name: string): IDBObjectStoreLike };
  onsuccess: ((ev?: unknown) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
  onupgradeneeded: ((ev?: { oldVersion?: number }) => void) | null;
}
export interface IDBObjectStoreLike {
  get(key: string): IDBRequestLike;
  put(value: TranscriptRecord): IDBRequestLike;
  delete(key: string): IDBRequestLike;
  getAll(): IDBRequestLike;
  createIndex(name: string, keyPath: string): unknown;
}
export interface IDBDatabaseLike {
  objectStoreNames: { contains(name: string): boolean };
  createObjectStore(name: string, opts: { keyPath: string }): IDBObjectStoreLike;
  transaction(name: string, mode?: 'readonly' | 'readwrite'): {
    objectStore(name: string): IDBObjectStoreLike;
  };
}
export interface IDBFactoryLike {
  open(
    name: string,
    version: number,
  ): IDBRequestLike;
}

interface UpgradeEvent {
  oldVersion: number;
}

/**
 * Upgrade chain — `from` = old version; each step idempotent. v1
 * creates the store; v2 adds the createdAt index (advisory — list
 * ordering stays in JS, the index supports future cursor pagination).
 */
export function upgradeTranscriptDB(
  db: IDBDatabaseLike,
  tx: { objectStore(name: string): IDBObjectStoreLike } | undefined,
  from: number,
): void {
  if (from < 1) {
    const store = db.createObjectStore(TRANSCRIPT_STORE, { keyPath: 'id' });
    store.createIndex('by-createdAt', 'createdAt');
    return;
  }
  if (from < 2) {
    const store = tx
      ? tx.objectStore(TRANSCRIPT_STORE)
      : db.transaction(TRANSCRIPT_STORE, 'readwrite').objectStore(TRANSCRIPT_STORE);
    store.createIndex('by-createdAt', 'createdAt');
  }
}

function wire<T>(request: IDBRequestLike): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error ?? new Error('idb error'));
  });
}

/** Open (and migrate) the transcript DB; resolves to a TranscriptDBLike. */
export function openTranscriptDB(indexedDB: IDBFactoryLike): Promise<TranscriptDBLike> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(TRANSCRIPT_DB, TRANSCRIPT_DB_VERSION);
    open.onupgradeneeded = (ev) => {
      const db = open.result as unknown as IDBDatabaseLike;
      upgradeTranscriptDB(db, open.transaction, ((ev ?? {}) as UpgradeEvent).oldVersion ?? 0);
    };
    open.onsuccess = () => {
      const db = open.result as unknown as {
        transaction(name: string, mode: 'readonly' | 'readwrite'): {
          objectStore(name: string): IDBObjectStoreLike;
        };
      };
      const store = (mode: 'readonly' | 'readwrite') =>
        db.transaction(TRANSCRIPT_STORE, mode).objectStore(TRANSCRIPT_STORE);
      resolve({
        get: (key) => wire(store('readonly').get(key)),
        put: (record) => wire(store('readwrite').put(record)),
        delete: async (key) => {
          await wire(store('readwrite').delete(key));
          return true;
        },
        listAll: () => wire(store('readonly').getAll()),
      });
    };
    open.onerror = () => reject(open.error ?? new Error('idb open failed'));
  });
}
