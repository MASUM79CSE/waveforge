/**
 * P2.3 — transcript storage: a versioned IDB store owned by Smart RAG,
 * separate from model files (Cache API, P1.3) and never in the SW
 * precache. The storage API is defined over a narrow duck-typed
 * `TranscriptDBLike` so tests run on a fake and the real IDB adapter
 * (`idb.ts`) stays swappable.
 */
import { RagQuotaError } from '../models/storage';
import { TranscriptRecordSchema, type TranscriptRecord } from './model';

/** Narrow store surface the storage needs (duck-typed for fakes). */
export interface TranscriptDBLike {
  get(key: string): Promise<TranscriptRecord | undefined>;
  put(record: TranscriptRecord): Promise<void>;
  delete(key: string): Promise<boolean>;
  listAll(): Promise<TranscriptRecord[]>;
}

export type { TranscriptRecord };

/** Storage-level error (malformed records offered for save). */
export class TranscriptDataError extends Error {
  constructor(message = 'transcript record failed validation') {
    super(message);
    this.name = 'TranscriptDataError';
  }
}

export interface TranscriptStorage {
  get(id: string): Promise<TranscriptRecord | null>;
  /** Validates, then persists. Quota exhaustion → RagQuotaError. */
  save(record: TranscriptRecord): Promise<void>;
  remove(id: string): Promise<boolean>;
  /** All transcripts, newest first. Corrupt records are dropped. */
  list(): Promise<TranscriptRecord[]>;
  /** Exact model+fingerprint match, or null. */
  findForFingerprint(modelId: string, modelVersion: string, fingerprint: string): Promise<TranscriptRecord | null>;
  /** Flag a transcript as stale (audio changed after transcription). */
  markStale(id: string): Promise<void>;
}

function isQuota(err: unknown): boolean {
  const e = err as { name?: string } | null;
  return e?.name === 'QuotaExceededError';
}

/** Validate an unknown record read from disk; null when unusable. */
function validate(record: unknown): TranscriptRecord | null {
  const parsed = TranscriptRecordSchema.safeParse(record);
  return parsed.success ? parsed.data : null;
}

export function createTranscriptStorage(db: TranscriptDBLike): TranscriptStorage {
  return {
    async get(id) {
      const raw = await db.get(id);
      return raw ? validate(raw) : null;
    },

    async save(record) {
      const parsed = TranscriptRecordSchema.safeParse(record);
      if (!parsed.success) throw new TranscriptDataError();
      try {
        await db.put(parsed.data);
      } catch (err) {
        if (isQuota(err)) throw new RagQuotaError();
        throw err;
      }
    },

    async remove(id) {
      return db.delete(id);
    },

    async list() {
      const all = await db.listAll();
      return all
        .map(validate)
        .filter((r): r is TranscriptRecord => r !== null)
        .sort((a, b) => b.createdAt - a.createdAt);
    },

    async findForFingerprint(modelId, modelVersion, fingerprint) {
      // data-driven (not key-driven): legacy/mis-keyed rows still match
      const all = await this.list();
      return (
        all.find(
          (r) => r.modelId === modelId && r.modelVersion === modelVersion && r.fingerprint === fingerprint,
        ) ?? null
      );
    },

    async markStale(id) {
      const rec = await this.get(id);
      if (!rec) throw new TranscriptDataError(`no transcript ${id}`);
      await db.put({ ...rec, stale: true });
    },
  };
}
