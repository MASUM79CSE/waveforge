/**
 * M6 RED: DraftRepository over fake-indexeddb — Repository pattern surface
 * (findAll/findById/save/update/delete), metadata/blob store split, corrupt
 * record surfacing as WF-E402 without blocking the list.
 */
import { describe, expect, test } from 'vitest';
import { openDraftDb } from '../../src/storage/db';
import { IdbDraftRepository } from '../../src/storage/DraftRepository';
import { useFakeIdb } from '../helpers/fakeIdb';

async function makeRepo(): Promise<IdbDraftRepository> {
  useFakeIdb();
  const db = await openDraftDb();
  return new IdbDraftRepository(db);
}

const meta = {
  name: 'night take',
  sampleRate: 44100,
  channels: 2 as const,
  length: 8,
};

function pcm(channels: 1 | 2, length: number): Float32Array[] {
  return Array.from({ length: channels }, () => new Float32Array(length).fill(0.25));
}

describe('IdbDraftRepository', () => {
  test('save → findAll returns metadata only (no payload bytes)', async () => {
    const repo = await makeRepo();
    const saved = await repo.save({ ...meta, audio: pcm(2, 8) });
    const all = await repo.findAll();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: saved.id, name: 'night take', length: 8 });
    expect(all[0]).not.toHaveProperty('payload');
  });

  test('findById joins metadata and PCM bit-exactly', async () => {
    const repo = await makeRepo();
    const audio = pcm(2, 8);
    const saved = await repo.save({ ...meta, audio });
    const loaded = await repo.findById(saved.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.header.name).toBe('night take');
    for (let ch = 0; ch < 2; ++ch) {
      expect(loaded?.channels[ch]).toEqual(audio[ch]);
    }
  });

  test('findById on a missing id returns null', async () => {
    const repo = await makeRepo();
    expect(await repo.findById('nope')).toBeNull();
  });

  test('update renames metadata without re-encoding audio', async () => {
    const repo = await makeRepo();
    const saved = await repo.save({ ...meta, audio: pcm(2, 8) });
    await repo.update(saved.id, { name: 'renamed' });
    const loaded = await repo.findById(saved.id);
    expect(loaded?.header.name).toBe('renamed');
    expect((await repo.findAll())[0]?.name).toBe('renamed');
  });

  test('delete removes both meta and payload rows', async () => {
    const repo = await makeRepo();
    const saved = await repo.save({ ...meta, audio: pcm(2, 8) });
    await repo.delete(saved.id);
    expect(await repo.findAll()).toHaveLength(0);
    expect(await repo.findById(saved.id)).toBeNull();
  });

  test('a corrupt blob row surfaces as WF-E402 and never blocks findAll', async () => {
    useFakeIdb();
    const repo = new IdbDraftRepository(await openDraftDb());
    const saved = await repo.save({ ...meta, audio: pcm(2, 8) });
    await repo.save({ ...meta, name: 'second', audio: pcm(1, 4) });

    // corrupt one payload row behind the repository's back (second handle,
    // same in-memory factory)
    const raw = await openDraftDb();
    const tx = raw.transaction('draftBlobs', 'readwrite');
    await tx.objectStore('draftBlobs').put(new Uint8Array([9, 9, 9]), saved.id);
    await tx.done;
    raw.close();

    const all = await repo.findAll(); // metadata list unaffected
    expect(all).toHaveLength(2);
    await expect(repo.findById(saved.id)).rejects.toMatchObject({ code: 'WF-E402' });
  });

  test('records are isolated between fresh databases', async () => {
    const a = await makeRepo();
    await a.save({ ...meta, audio: pcm(1, 4) });
    const b = await makeRepo();
    expect(await b.findAll()).toHaveLength(0);
  });
});
