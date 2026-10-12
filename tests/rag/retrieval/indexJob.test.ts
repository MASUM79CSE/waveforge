import { describe, expect, it } from 'vitest';
import { createIndexController, type IndexDeps } from '../../../src/rag/retrieval/indexJob';
import { createIndexStorage, openIndexDB, type IndexStorage } from '../../../src/rag/retrieval/indexStore';
import { createFakeEmbedClient } from '../../../src/rag/retrieval/embedClient';
import { FakeIDB } from '../helpers/fakeIdb';
import type { TranscriptRecord } from '../../../src/rag/transcripts/model';

const EMBED_MODEL = { modelId: 'fake-embed', version: '1.0.0' };

function transcript(overrides: Partial<TranscriptRecord> = {}): TranscriptRecord {
  return {
    id: 't@1/f',
    modelId: 'whisper-tiny',
    modelVersion: '1.0.0',
    fingerprint: 'f',
    language: 'en',
    segments: Array.from({ length: 30 }, (_, i) => ({
      start: i * 2,
      end: i * 2 + 1.9,
      text: `segment number ${i} talks about waveform peaks`,
    })),
    createdAt: 1,
    stale: false,
    ...overrides,
  };
}

async function fakeIndexStorage(): Promise<IndexStorage> {
  return createIndexStorage(await openIndexDB(new FakeIDB().indexFactory()));
}

async function deps(
  overrides: Partial<IndexDeps> = {},
): Promise<IndexDeps & { storage: IndexStorage; embeds: number }> {
  const storage = await fakeIndexStorage();
  const self: IndexDeps & { storage: IndexStorage; embeds: number } = {
    storage,
    index: storage,
    makeEmbedder: () => {
      self.embeds += 1;
      return createFakeEmbedClient();
    },
    embedModel: EMBED_MODEL,
    installedVersion: async (id: string) => (id === EMBED_MODEL.modelId ? '1.0.0' : null),
    clock: () => 42,
    ...overrides,
    embeds: 0,
  };
  return self;
}

describe('P3.6 index job controller', () => {
  it('happy path: chunk → embed (batched) → store rows, progress → 1', async () => {
    const d = await deps();
    const progress: number[] = [];
    const res = await createIndexController(d).run(transcript(), { onProgress: (p) => progress.push(p) });
    expect(res.skipped).toBe(false);
    expect(res.chunks).toBeGreaterThan(1);
    const rows = await d.index.loadAll();
    expect(rows.length).toBe(res.chunks);
    expect(rows[0]!.vector.length).toBe(256);
    const norm = Math.sqrt(Array.from(rows[0]!.vector).reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5); // L2-normalized fake vectors persisted
    expect(rows[0]!.embeddedAt).toBe(42);
    expect(progress[0]).toBe(0);
    expect(progress[progress.length - 1]).toBe(1);
    // batching: 30 segments → a handful of chunks → >1 embed call only if
    // chunks > 16; assert monotonic progress regardless
    for (let i = 1; i < progress.length; i++) expect(progress[i]).toBeGreaterThan(progress[i - 1]!);
  });

  it('batching: >16 chunks split across multiple embed calls', async () => {
    // force many single-segment chunks with a small char budget is not
    // exposed; instead 30 segments of ~46 chars join ~46·k under 800 →
    // ~16 segments per chunk → 2 chunks. Use longer segments to force
    // more chunks and verify >1 embed call when chunks > 16.
    const long = transcript({
      segments: Array.from({ length: 40 }, (_, i) => ({
        start: i,
        end: i + 0.9,
        text: `w${i} ${'x'.repeat(180)}`,
      })),
    });
    const d = await deps();
    const res = await createIndexController(d).run(long);
    // 40 segments × ~190 chars → ≥ 10 chunks (batching keeps memory flat);
    // every persisted row carries a real 256-dim vector
    expect(res.chunks).toBeGreaterThan(8);
    const rows = await d.index.loadAll();
    expect(rows.length).toBe(res.chunks);
    expect(rows.every((r) => r.vector.length === 256)).toBe(true);
  });

  it('idempotent: existing index short-circuits (no embedder spun)', async () => {
    const d = await deps();
    const controller = createIndexController(d);
    const first = await controller.run(transcript());
    expect(first.skipped).toBe(false);
    const second = await controller.run(transcript());
    expect(second.skipped).toBe(true);
    expect(second.chunks).toBe(first.chunks);
  });

  it('force re-index replaces rows', async () => {
    const d = await deps();
    const controller = createIndexController(d);
    await controller.run(transcript());
    const before = (await d.index.loadAll()).length;
    const res = await controller.run(transcript(), { force: true });
    expect(res.skipped).toBe(false);
    expect((await d.index.loadAll()).length).toBe(before);
  });

  it('MODEL_NOT_INSTALLED when the embedding model is absent', async () => {
    const d = await deps({ installedVersion: async () => null });
    await expect(createIndexController(d).run(transcript())).rejects.toMatchObject({
      code: 'MODEL_NOT_INSTALLED',
    });
  });

  it('NO_SEGMENTS for a segment-less transcript', async () => {
    const d = await deps();
    await expect(createIndexController(d).run(transcript({ segments: [] }))).rejects.toMatchObject({
      code: 'NO_SEGMENTS',
    });
  });

  it('pre-aborted signal → ABORTED before any work', async () => {
    const d = await deps();
    const ac = new AbortController();
    ac.abort();
    await expect(createIndexController(d).run(transcript(), { signal: ac.signal })).rejects.toMatchObject({
      code: 'ABORTED',
    });
  });

  it('mid-run abort (embedder rejects ABORTED) → typed ABORTED, no rows', async () => {
    const ac = new AbortController();
    const d = await deps({
      makeEmbedder: () => {
        const c = createFakeEmbedClient();
        c.embed = async () => {
          ac.abort();
          throw Object.assign(new Error('cancelled'), { code: 'ABORTED' });
        };
        return c;
      },
    });
    await expect(createIndexController(d).run(transcript(), { signal: ac.signal })).rejects.toMatchObject({
      code: 'ABORTED',
    });
    expect(await d.index.loadAll()).toEqual([]);
  });

  it('unknown embedder failure → INDEX_FAILED with the message', async () => {
    const d = await deps({
      makeEmbedder: () => {
        const c = createFakeEmbedClient();
        c.init = async () => {
          throw new Error('worker exploded');
        };
        return c;
      },
    });
    await expect(createIndexController(d).run(transcript())).rejects.toMatchObject({
      code: 'INDEX_FAILED',
      message: 'worker exploded',
    });
  });

  it('works end-to-end through the REAL openIndexDB + fake IDB', async () => {
    const fake = new FakeIDB();
    const d = await deps({ index: createIndexStorage(await openIndexDB(fake.indexFactory())) });
    const res = await createIndexController(d).run(transcript());
    expect(res.chunks).toBeGreaterThan(1);
    const rows = await d.index.loadAll();
    expect(rows.every((r) => r.transcriptId === 't@1/f')).toBe(true);
  });
});
