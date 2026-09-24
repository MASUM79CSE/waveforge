/**
 * DraftRepository (M6, ADR 008 D1/D3/D4): the Repository-pattern boundary
 * over IndexedDB. Draft metadata and payloads live in separate stores
 * (cheap lists); the autosave ring is a single overwritten record. Quota
 * failures map to WF-E401, corrupt payloads to WF-E402 — the list never
 * blocks, and audio bytes are validated on every read.
 */
import { makeError } from '../core/errors';
import type { DraftDb, DraftMetaRow } from './db';
import {
  decodeDraft,
  draftHeaderSchema,
  encodeDraft,
  hashPcm,
  supportsCompression,
  type DraftHeader,
} from './draftPayload';

export interface DraftSummary {
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

export interface DraftInput {
  name: string;
  sampleRate: number;
  channels: 1 | 2;
  length: number;
  audio: Float32Array[];
  cursor?: number;
  selection?: { start: number; end: number };
  /** E6a noise print (per-bin magnitudes) — persisted via the header (M7). */
  noisePrint?: number[];
}

export interface DraftRecord {
  header: DraftHeader;
  channels: Float32Array[];
}

export const AUTOSAVE_ID = 'ring';

export class IdbDraftRepository {
  constructor(private readonly db: DraftDb) {}

  async findAll(): Promise<DraftSummary[]> {
    const rows = await this.db.getAll('drafts');
    return rows
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(rowToSummary);
  }

  async findById(id: string): Promise<DraftRecord | null> {
    const meta = await this.db.get('drafts', id);
    if (!meta) return null;
    const payload = await this.db.get('draftBlobs', id);
    if (!payload) throw makeError('WF-E402', { id, detail: 'payload row missing' });
    const record = await decodeDraft(payload); // WF-E402 propagates
    // the meta row is authoritative for identity — renames never re-encode
    record.header.name = meta.name;
    return record;
  }

  async save(input: DraftInput): Promise<DraftSummary> {
    const { id, now } = this.reserveRow();
    const meta = await this.writeSnapshot(input, now, id);
    return rowToSummary(meta);
  }

  async update(id: string, patch: { name: string }): Promise<void> {
    const meta = await this.db.get('drafts', id);
    if (!meta) throw makeError('WF-E402', { id, detail: 'cannot rename missing draft' });
    const next: DraftMetaRow = { ...meta, name: patch.name, updatedAt: Date.now() };
    await this.db.put('drafts', next);
  }

  async delete(id: string): Promise<void> {
    const tx = this.db.transaction(['drafts', 'draftBlobs'], 'readwrite');
    await Promise.all([
      tx.objectStore('drafts').delete(id),
      tx.objectStore('draftBlobs').delete(id),
      tx.done,
    ]);
  }

  // ---- autosave ring (single overwritten record) ----

  async writeAutosave(input: DraftInput): Promise<void> {
    const header: DraftHeader = draftHeaderSchema.parse({
      v: 1,
      name: input.name,
      sampleRate: input.sampleRate,
      channels: input.channels,
      length: input.length,
      savedAt: Date.now(),
      cursor: input.cursor,
      selection: input.selection,
      noisePrint: input.noisePrint,
    });
    const payload = await encodeDraft(header, input.audio, { compress: supportsCompression() });
    const hash = await hashPcm(input.audio);
    const meta: DraftMetaRow = {
      id: AUTOSAVE_ID,
      name: input.name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sampleRate: input.sampleRate,
      channels: input.channels,
      length: input.length,
      hash,
      payloadBytes: payload.length,
      compressed: supportsCompression(),
    };
    try {
      await this.db.put('autosave', { id: AUTOSAVE_ID, meta, payload, savedAt: Date.now() });
    } catch (error) {
      throw quotaOrRethrow(error);
    }
  }

  async readAutosave(): Promise<DraftRecord | null> {
    const row = await this.db.get('autosave', AUTOSAVE_ID);
    if (!row) return null;
    try {
      const record = await decodeDraft(row.payload);
      record.header.name = row.meta.name;
      return record;
    } catch {
      return null; // a corrupt autosave must never block boot (§6.3)
    }
  }

  async readAutosaveStamp(): Promise<number | null> {
    const row = await this.db.get('autosave', AUTOSAVE_ID);
    return row ? row.savedAt : null;
  }

  async clearAutosave(): Promise<void> {
    await this.db.delete('autosave', AUTOSAVE_ID);
  }

  // ---- internals ----

  private reserveRow(): { id: string; now: number } {
    const id =
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `draft-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    return { id, now: Date.now() };
  }

  /** Encode + store meta/payload in one transaction; returns the meta row. */
  private async writeSnapshot(
    input: DraftInput,
    createdAt: number,
    id: string,
  ): Promise<DraftMetaRow> {
    const compress = supportsCompression();
    const header: DraftHeader = draftHeaderSchema.parse({
      v: 1,
      name: input.name,
      sampleRate: input.sampleRate,
      channels: input.channels,
      length: input.length,
      savedAt: Date.now(),
      cursor: input.cursor,
      selection: input.selection,
      noisePrint: input.noisePrint,
    });
    const payload = await encodeDraft(header, input.audio, { compress });
    const hash = await hashPcm(input.audio);
    const meta: DraftMetaRow = {
      id,
      name: input.name,
      createdAt,
      updatedAt: Date.now(),
      sampleRate: input.sampleRate,
      channels: input.channels,
      length: input.length,
      hash,
      payloadBytes: payload.length,
      compressed: compress,
    };
    try {
      const tx = this.db.transaction(['drafts', 'draftBlobs'], 'readwrite');
      await Promise.all([
        tx.objectStore('drafts').put(meta),
        tx.objectStore('draftBlobs').put(payload, id),
        tx.done,
      ]);
    } catch (error) {
      throw quotaOrRethrow(error);
    }
    return meta;
  }
}

function rowToSummary(row: DraftMetaRow): DraftSummary {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sampleRate: row.sampleRate,
    channels: row.channels,
    length: row.length,
    hash: row.hash,
    payloadBytes: row.payloadBytes,
    compressed: row.compressed,
  };
}

function quotaOrRethrow(error: unknown): Error {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return makeError('WF-E401', {}, error);
  }
  return error instanceof Error ? error : new Error(String(error));
}
