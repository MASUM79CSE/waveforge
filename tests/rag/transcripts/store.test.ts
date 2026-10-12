import { describe, expect, it } from 'vitest';
import { RagQuotaError } from '../../../src/rag/models/storage';
import { createTranscriptStorage, TranscriptDataError, type TranscriptDBLike } from '../../../src/rag/transcripts/store';
import { openTranscriptDB, TRANSCRIPT_DB_VERSION } from '../../../src/rag/transcripts/idb';
import { FakeIDB } from '../helpers/fakeIdb';
import { makeRecord } from '../helpers/transcriptFixtures';

function memoryDb(): TranscriptDBLike & { rows: Map<string, unknown> } {
  const rows = new Map<string, unknown>();
  return {
    rows,
    async get(key) {
      return rows.get(key) as import('../../../src/rag/transcripts/model').TranscriptRecord | undefined;
    },
    async put(record) {
      rows.set(record.id, structuredClone(record));
    },
    async delete(key) {
      return rows.delete(key);
    },
    async listAll() {
      return [...rows.values()] as import('../../../src/rag/transcripts/model').TranscriptRecord[];
    },
  };
}

describe('P2.3 transcript storage', () => {
  it('save + get roundtrip; missing → null', async () => {
    const storage = createTranscriptStorage(memoryDb());
    expect(await storage.get('nope')).toBeNull();
    const rec = makeRecord();
    await storage.save(rec);
    expect(await storage.get(rec.id)).toEqual(rec);
  });

  it('save rejects malformed records with TranscriptDataError', async () => {
    const storage = createTranscriptStorage(memoryDb());
    await expect(storage.save(makeRecord({ segments: [{ start: 5, end: 1, text: 'x' }] }))).rejects.toBeInstanceOf(
      TranscriptDataError,
    );
    await expect(storage.save({} as never)).rejects.toBeInstanceOf(TranscriptDataError);
  });

  it('quota exhaustion maps to RagQuotaError', async () => {
    const db = memoryDb();
    db.put = async () => {
      throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
    };
    await expect(createTranscriptStorage(db).save(makeRecord())).rejects.toBeInstanceOf(RagQuotaError);
  });

  it('list sorts newest first and drops corrupt records', async () => {
    const db = memoryDb();
    await createTranscriptStorage(db).save(makeRecord({ id: 'a', createdAt: 100 }));
    await createTranscriptStorage(db).save(makeRecord({ id: 'b', createdAt: 300 }));
    await createTranscriptStorage(db).save(makeRecord({ id: 'c', createdAt: 200 }));
    db.rows.set('junk', { id: 'junk' });
    const list = await createTranscriptStorage(db).list();
    expect(list.map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('findForFingerprint matches model+version+fingerprint exactly', async () => {
    const storage = createTranscriptStorage(memoryDb());
    await storage.save(makeRecord({ fingerprint: 'feed0001' }));
    expect(await storage.findForFingerprint('whisper-tiny', '1.0.0', 'feed0001')).not.toBeNull();
    expect(await storage.findForFingerprint('whisper-tiny', '1.0.1', 'feed0001')).toBeNull();
    expect(await storage.findForFingerprint('whisper-base', '1.0.0', 'feed0001')).toBeNull();
  });

  it('markStale persists the hint; unknown id → TranscriptDataError', async () => {
    const storage = createTranscriptStorage(memoryDb());
    await storage.save(makeRecord());
    await storage.markStale('whisper-tiny@1.0.0/abc12345');
    expect((await storage.get('whisper-tiny@1.0.0/abc12345'))?.stale).toBe(true);
    await expect(storage.markStale('missing')).rejects.toBeInstanceOf(TranscriptDataError);
  });

  it('remove returns whether the record existed', async () => {
    const storage = createTranscriptStorage(memoryDb());
    await storage.save(makeRecord());
    expect(await storage.remove('whisper-tiny@1.0.0/abc12345')).toBe(true);
    expect(await storage.remove('whisper-tiny@1.0.0/abc12345')).toBe(false);
  });
});

describe('P2.3 IDB adapter + migration (fake IDB)', () => {
  it('fresh open runs the full upgrade chain; store roundtrips through IDB', async () => {
    const fake = new FakeIDB();
    const db = await openTranscriptDB(fake.factory);
    expect(fake.version).toBe(TRANSCRIPT_DB_VERSION);
    expect(fake.upgradesRun).toEqual([TRANSCRIPT_DB_VERSION]);
    expect(fake.keyPaths.get('transcripts')).toBe('id');

    const storage = createTranscriptStorage(db);
    const rec = makeRecord();
    await storage.save(rec);
    expect(await storage.get(rec.id)).toEqual(rec);
    expect(await storage.remove(rec.id)).toBe(true);
    expect(await storage.get(rec.id)).toBeNull();
  });

  it('a v1 database migrates to v2 without touching rows', async () => {
    const fake = new FakeIDB();
    // simulate an old v1 install: store exists, version 1, no index pass
    fake.version = 1;
    const rec = makeRecord();
    fake.stores.set('transcripts', new Map([['k', { value: structuredClone(rec) }]]));

    const db = await openTranscriptDB(fake.factory);
    expect(fake.upgradesRun).toEqual([2]); // only the v2 step ran
    const storage = createTranscriptStorage(db);
    // the pre-existing row is keyed 'k' (old keyPath-less row) — visible via list
    const list = await storage.list();
    expect(list.map((r) => r.id)).toEqual([rec.id]);
  });

  it('quota errors surface through the real adapter too', async () => {
    const fake = new FakeIDB();
    fake.quotaFail = true;
    const storage = createTranscriptStorage(await openTranscriptDB(fake.factory));
    await expect(storage.save(makeRecord())).rejects.toBeInstanceOf(RagQuotaError);
  });

  it('open failure rejects', async () => {
    const fake = new FakeIDB();
    fake.openError = new Error('cannot open');
    await expect(openTranscriptDB(fake.factory)).rejects.toMatchObject({ message: 'cannot open' });
  });
});
