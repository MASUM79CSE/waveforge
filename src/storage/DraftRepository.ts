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
  encodeDraftProject,
  encodeDraftTracks,
  hashPcm,
  supportsCompression,
  type DraftAssetPayload,
  type DraftHeader,
  type DraftTrackPayload,
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
  /** M8e: v2 lanes (track 1 included) — encoded as per-track PCM blocks.
   * M9f: when `assets` is present the snapshot upgrades to v3 (clips ride
   * the track metas; PCM = deduped per-asset blocks). */
  tracks?: DraftTrackPayload[];
  assets?: DraftAssetPayload[];
}

export interface DraftRecord {
  header: DraftHeader;
  channels: Float32Array[];
  /** M8e: present when the draft was saved from a multitrack project. */
  tracks?: DraftTrackPayload[];
  /** M9f: present on v3 records — deduped per-asset PCM blocks. */
  assets?: DraftAssetPayload[];
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
    const meta = input.tracks
      ? await this.writeSnapshotTracks(input, now, id)
      : await this.writeSnapshot(input, now, id);
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

  /** M8e/M9f: project snapshot — v2 per-track blocks, or v3 per-ASSET
   * blocks + clip lists when `input.assets` is present. */
  private async writeSnapshotTracks(
    input: DraftInput,
    now: number,
    id: string,
  ): Promise<DraftMetaRow> {
    const primary = input.tracks![0]!;
    if (input.assets) {
      const header3: DraftHeader = draftHeaderSchema.parse({
        v: 3,
        name: input.name,
        sampleRate: input.sampleRate,
        channels: primary.channels.length === 1 ? 1 : 2,
        length: primary.channels[0]?.length ?? 0,
        savedAt: now,
        tracks: input.tracks!.map((t) => ({ ...t.meta, clips: t.clips ?? t.meta.clips })),
        assets: input.assets.map((a) => a.meta),
      });
      const payload3 = await encodeDraftProject(header3, input.tracks!, input.assets, {
        compress: supportsCompression(),
      });
      const hash3 = await hashPcm(input.assets.flatMap((a) => a.channels));
      const meta3: DraftMetaRow = {
        id,
        name: input.name,
        createdAt: now,
        updatedAt: now,
        sampleRate: input.sampleRate,
        channels: header3.channels,
        length: header3.length,
        hash: hash3,
        payloadBytes: payload3.length,
        compressed: supportsCompression(),
      };
      const tx3 = this.db.transaction(['drafts', 'draftBlobs'], 'readwrite');
      await Promise.all([
        tx3.objectStore('drafts').put(meta3),
        tx3.objectStore('draftBlobs').put(payload3, id),
        tx3.done,
      ]);
      return meta3;
    }
    const header: DraftHeader = draftHeaderSchema.parse({
      v: 2,
      name: input.name,
      sampleRate: input.sampleRate,
      channels: primary.channels.length === 1 ? 1 : 2,
      length: primary.channels[0]?.length ?? 0,
      savedAt: now,
      tracks: input.tracks!.map((t) => t.meta),
    });
    const payload = await encodeDraftTracks(header, input.tracks!, {
      compress: supportsCompression(),
    });
    const hash = await hashPcm(input.tracks!.flatMap((t) => t.channels));
    const meta: DraftMetaRow = {
      id,
      name: input.name,
      createdAt: now,
      updatedAt: now,
      sampleRate: input.sampleRate,
      channels: header.channels,
      length: header.length,
      hash,
      payloadBytes: payload.length,
      compressed: supportsCompression(),
    };
    const tx = this.db.transaction(['drafts', 'draftBlobs'], 'readwrite');
    await Promise.all([
      tx.objectStore('drafts').put(meta),
      tx.objectStore('draftBlobs').put(payload, id),
      tx.done,
    ]);
    return meta;
  }

  // ---- autosave ring (single overwritten record) ----

  async writeAutosave(input: DraftInput): Promise<void> {
    if (input.tracks) {
      const primaryT = input.tracks[0]!;
      const headerT: DraftHeader = draftHeaderSchema.parse(
        input.assets
          ? {
              v: 3,
              name: input.name,
              sampleRate: input.sampleRate,
              channels: primaryT.channels.length === 1 ? 1 : 2,
              length: primaryT.channels[0]?.length ?? 0,
              savedAt: Date.now(),
              tracks: input.tracks.map((t) => ({ ...t.meta, clips: t.clips ?? t.meta.clips })),
              assets: input.assets!.map((a) => a.meta),
            }
          : {
              v: 2,
              name: input.name,
              sampleRate: input.sampleRate,
              channels: primaryT.channels.length === 1 ? 1 : 2,
              length: primaryT.channels[0]?.length ?? 0,
              savedAt: Date.now(),
              tracks: input.tracks.map((t) => t.meta),
            },
      );
      const payloadT = input.assets
        ? await encodeDraftProject(headerT, input.tracks, input.assets, {
            compress: supportsCompression(),
          })
        : await encodeDraftTracks(headerT, input.tracks, {
            compress: supportsCompression(),
          });
      const hashT = input.assets
        ? await hashPcm(input.assets.flatMap((a) => a.channels))
        : await hashPcm(input.tracks.flatMap((t) => t.channels));
      const metaT: DraftMetaRow = {
        id: AUTOSAVE_ID,
        name: input.name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sampleRate: input.sampleRate,
        channels: headerT.channels,
        length: headerT.length,
        hash: hashT,
        payloadBytes: payloadT.length,
        compressed: supportsCompression(),
      };
      const txT = this.db.transaction(['drafts', 'draftBlobs'], 'readwrite');
      await Promise.all([
        txT.objectStore('drafts').put(metaT),
        txT.objectStore('draftBlobs').put(payloadT, AUTOSAVE_ID),
        txT.done,
      ]);
      return;
    }
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
