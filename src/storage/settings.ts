/**
 * Settings boundary (M6, ADR 008 D5): the single localStorage window.
 * Values are JSON-encoded under the `waveforge.` namespace; reads are
 * schema-validated where a schema is registered and fall back silently —
 * a corrupt value must never break boot. Legacy `'1'/'0'` flags written by
 * the M1–M5 toggles remain readable through `readBoolSetting`.
 */
import { z } from 'zod';

export const SETTINGS_PREFIX = 'waveforge';

/** Registered schemas — one entry per typed setting. */
const SCHEMAS = {
  autosaveEnabled: z.boolean(),
  volume: z.number().min(0).max(1),
} as const;

export type TypedSettingKey = keyof typeof SCHEMAS;

/**
 * The backing store: global localStorage when present (browser), or the
 * override installed by tests (Node has no localStorage).
 */
let storeOverride: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = null;

/** Test seam — install an in-memory store where localStorage is absent. */
export function installStorageOverride(
  store: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null,
): void {
  storeOverride = store;
}

function store(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  if (storeOverride) return storeOverride;
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function storageKey(key: string): string {
  return `${SETTINGS_PREFIX}.${key}`;
}

export function writeSetting<T>(key: string, value: T): void {
  try {
    store()?.setItem(storageKey(key), JSON.stringify(value));
  } catch {
    /* private mode — the preference simply is not persisted */
  }
}

export function readSetting<T>(key: string, fallback: T): T {
  try {
    const raw = store()?.getItem(storageKey(key)) ?? null;
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    const schema = SCHEMAS[key as TypedSettingKey];
    if (schema) {
      const result = schema.safeParse(parsed);
      return result.success ? (result.data as T) : fallback;
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function clearSetting(key: string): void {
  try {
    store()?.removeItem(storageKey(key));
  } catch {
    /* private mode */
  }
}

/** Boolean settings readable across the legacy `'1'/'0'` and JSON encodings. */
export function readBoolSetting(key: string, fallback: boolean): boolean {
  try {
    const raw = store()?.getItem(storageKey(key)) ?? null;
    if (raw === null) return fallback;
    if (raw === '1') return true;
    if (raw === '0') return false;
    return readSetting(key, fallback);
  } catch {
    return fallback;
  }
}

export function isAutosaveEnabled(): boolean {
  return readSetting('autosaveEnabled', true);
}
