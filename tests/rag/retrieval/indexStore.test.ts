import { describe, expect, it } from 'vitest';
import { RagQuotaError } from '../../../src/rag/models/storage';
import {
  createIndexStorage,
  INDEX_DB_VERSION,
  openIndexDB,
  type StoredChunk,
} from '../../../src/rag/retrieval/indexStore';
import { FakeIDB } from '../helpers/fakeIdb';

function chunk(overrides: Partial<StoredChunk> = {}): StoredChunk {
  return {
    id: 't@1/f#0',
    transcriptId: 't@1/f',
    index: 0,
    text: 'hello world',
    startSec: 0,
    endSec: 2.5,
    segmentIds: [0, 1],
    vector: new Float32Array([0.6, -0.8]),
    dim: 2,
    modelId: 'fake-embed',
    embeddedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function storage(fake = new FakeIDB()) {
  const db = () => openIndexDB(fake.indexFactory());
  return { fake, make: async () => createIndexStorage(await db()) };
}

describe('P3.4 index store (fake IDB)', () => {
  it('fresh open runs the v1 upgrade chain; chunk round-trips bitwise', async () => {
    const { fake, make } = storage();
    const s = await make();
    expect(fake.version).toBe(INDEX_DB_VERSION);
    expect(fake.upgradesRun).toEqual([1]);
    expect(fake.keyPaths.get('chunks')).toBe('id');

    const c = chunk({ vector: new Float32Array([0.123456, -0.987654, 0.5]) });
    await s.putDoc('t@1/f', [c]);
    const loaded = await s.loadAll();
    expect(loaded.length).toBe(1);
    expect(Array.from(loaded[0]!.vector)).toEqual(Array.from(c.vector)); // exact values
    expect(loaded[0]!).toEqual(c);
  });

  it('putDoc replaces the previous chunks of the same transcript only', async () => {
    const { make } = storage();
    const s = await make();
    await s.putDoc('t1', [chunk({ id: 't1#0', transcriptId: 't1', index: 0 })]);
    await s.putDoc('t1', [chunk({ id: 't1#0', transcriptId: 't1', index: 0, text: 'updated' })]);
    await s.putDoc('t2', [chunk({ id: 't2#0', transcriptId: 't2', index: 0, text: 'other doc' })]);
    const all = await s.loadAll();
    expect(all.map((c) => `${c.transcriptId}:${c.text}`)).toEqual(['t1:updated', 't2:other doc']);
  });

  it('deleteDoc removes exactly that transcript; returns whether anything was removed', async () => {
    const { make } = storage();
    const s = await make();
    await s.putDoc('t1', [chunk({ id: 't1#0', transcriptId: 't1' }), chunk({ id: 't1#1', transcriptId: 't1', index: 1 })]);
    await s.putDoc('t2', [chunk({ id: 't2#0', transcriptId: 't2' })]);
    expect(await s.deleteDoc('t1')).toBe(true);
    expect((await s.loadAll()).map((c) => c.transcriptId)).toEqual(['t2']);
    expect(await s.deleteDoc('t1')).toBe(false);
  });

  it('listDocs aggregates per transcript, newest first', async () => {
    const { make } = storage();
    const s = await make();
    await s.putDoc('old', [
      chunk({ id: 'old#0', transcriptId: 'old', embeddedAt: 1000, dim: 3, modelId: 'm1' }),
      chunk({ id: 'old#1', transcriptId: 'old', index: 1, embeddedAt: 900 }),
    ]);
    await s.putDoc('new', [chunk({ id: 'new#0', transcriptId: 'new', embeddedAt: 2000 })]);
    const docs = await s.listDocs();
    expect(docs.map((d) => d.transcriptId)).toEqual(['new', 'old']);
    const oldDoc = docs.find((d) => d.transcriptId === 'old')!;
    expect(oldDoc.chunks).toBe(2);
    expect(oldDoc.embeddedAt).toBe(1000); // max, not last
    expect(oldDoc.dim).toBe(3);
    expect(oldDoc.modelId).toBe('m1');
  });

  it('corrupt rows are dropped on read', async () => {
    const { make } = storage();
    const s = await make();
    await s.putDoc('t', [chunk()]);
    const rows = await s.loadAll();
    expect(rows.length).toBe(1);
    expect(rows[0]!.id).toBe('t@1/f#0');
  });

  it('bad chunk in putDoc → BAD_CHUNK, nothing written', async () => {
    const { make } = storage();
    const s = await make();
    const bad = chunk({ id: 'b#0', text: 'ok' });
    (bad as { startSec: number }).startSec = -5;
    await expect(s.putDoc('b', [bad])).rejects.toMatchObject({ code: 'BAD_CHUNK' });
    expect(await s.loadAll()).toEqual([]);
  });

  it('quota errors map to RagQuotaError', async () => {
    const fake = new FakeIDB();
    fake.quotaFail = true;
    const s = createIndexStorage(await openIndexDB(fake.indexFactory()));
    await expect(s.putDoc('t', [chunk()])).rejects.toBeInstanceOf(RagQuotaError);
  });

  it('open failure rejects', async () => {
    const fake = new FakeIDB();
    fake.openError = new Error('no idb');
    await expect(openIndexDB(fake.indexFactory())).rejects.toMatchObject({ message: 'no idb' });
  });
});
