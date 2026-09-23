/**
 * Test helper: install a complete fake-indexeddb global family (idb v8 opens
 * through the global `indexedDB` and type-checks against `IDBRequest`).
 * Returns the factory so a second handle can simulate a "page reload"
 * against the same in-memory database.
 */
import {
  IDBCursor,
  IDBDatabase,
  IDBFactory,
  IDBIndex,
  IDBKeyRange,
  IDBObjectStore,
  IDBOpenDBRequest,
  IDBRequest,
  IDBTransaction,
  IDBVersionChangeEvent,
} from 'fake-indexeddb';

export function useFakeIdb(): IDBFactory {
  const globals = globalThis as unknown as Record<string, unknown>;
  const factory = new IDBFactory();
  globals.indexedDB = factory;
  globals.IDBCursor = IDBCursor;
  globals.IDBDatabase = IDBDatabase;
  globals.IDBFactory = IDBFactory;
  globals.IDBIndex = IDBIndex;
  globals.IDBKeyRange = IDBKeyRange;
  globals.IDBObjectStore = IDBObjectStore;
  globals.IDBOpenDBRequest = IDBOpenDBRequest;
  globals.IDBRequest = IDBRequest;
  globals.IDBTransaction = IDBTransaction;
  globals.IDBVersionChangeEvent = IDBVersionChangeEvent;
  return factory;
}
