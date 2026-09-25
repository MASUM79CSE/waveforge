/**
 * C3 — user chain presets (docs/fxchains-plan.md). Tiny IndexedDB store —
 * database `waveforge-presets` v1, one record per named preset holding the
 * exported chain JSON (drafts precedent; `idb` v8 opens through the global
 * `indexedDB` — tests install fake-indexeddb as that global).
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

interface PresetRow {
  name: string;
  chain: string;
}

interface PresetDbSchema extends DBSchema {
  presets: { key: string; value: PresetRow };
}

async function open(): Promise<IDBPDatabase<PresetDbSchema>> {
  return openDB<PresetDbSchema>('waveforge-presets', 1, {
    upgrade(db) {
      db.createObjectStore('presets', { keyPath: 'name' });
    },
  });
}

/** All user preset names, sorted (the list the Rack shows). */
export async function listUserPresets(): Promise<string[]> {
  const db = await open();
  try {
    const rows = await db.getAll('presets');
    return rows.map((r) => r.name).sort((a, b) => a.localeCompare(b));
  } finally {
    db.close();
  }
}

export async function loadUserPreset(name: string): Promise<string | undefined> {
  const db = await open();
  try {
    const row = await db.get('presets', name);
    return row?.chain;
  } finally {
    db.close();
  }
}

export async function saveUserPreset(name: string, chain: string): Promise<void> {
  const db = await open();
  try {
    await db.put('presets', { name, chain });
  } finally {
    db.close();
  }
}

export async function deleteUserPreset(name: string): Promise<void> {
  const db = await open();
  try {
    await db.delete('presets', name);
  } finally {
    db.close();
  }
}
