/**
 * IndexedDB handle (M6, ADR 008 D1). Database `waveforge` v1 keeps draft
 * metadata and payloads in separate stores so the drafts list never
 * deserializes PCM; the autosave ring is a single-record store.
 * (`idb` v8 opens through the global `indexedDB` — tests install
 * fake-indexeddb as that global.)
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface DraftMetaRow {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  sampleRate: number;
  channels: 1 | 2;
  length: number;
  hash: string;
  payloadBytes: number;
  compressed: boolean;
}

export interface AutosaveRow {
  id: 'ring';
  meta: DraftMetaRow;
  payload: Uint8Array;
  savedAt: number;
}

interface WaveforgeDbSchema extends DBSchema {
  drafts: { key: string; value: DraftMetaRow };
  draftBlobs: { key: string; value: Uint8Array };
  autosave: { key: string; value: AutosaveRow };
}

export type DraftDb = IDBPDatabase<WaveforgeDbSchema>;

export async function openDraftDb(): Promise<DraftDb> {
  return openDB<WaveforgeDbSchema>('waveforge', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('draftBlobs')) {
        db.createObjectStore('draftBlobs');
      }
      if (!db.objectStoreNames.contains('autosave')) {
        db.createObjectStore('autosave', { keyPath: 'id' });
      }
    },
  });
}
