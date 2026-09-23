/**
 * M6 integration: full persistence round-trip over fake-indexeddb —
 * encode → save → (new handle) → findAll → findById → decode → PCM + hash
 * identical. Mirrors plan §7.3 flow #5's identity contract.
 */
import { describe, expect, test } from 'vitest';
import { openDraftDb } from '../../src/storage/db';
import { IdbDraftRepository } from '../../src/storage/DraftRepository';
import { hashPcm } from '../../src/storage/draftPayload';
import { useFakeIdb } from '../helpers/fakeIdb';

function signal(length: number, channels: 1 | 2): Float32Array[] {
  return Array.from({ length: channels }, (_, ch) => {
    const data = new Float32Array(length);
    for (let i = 0; i < length; ++i) {
      data[i] = Math.sin((2 * Math.PI * (110 + ch * 220) * i) / 44100);
    }
    return data;
  });
}

describe('draft round-trip (save → reload → open)', () => {
  test('audio is bit-identical and the hash matches after a fresh open', async () => {
    const channels = 2 as const;
    const length = 44100; // 1 s stereo
    const audio = signal(length, channels);
    const originalHash = await hashPcm(audio);

    useFakeIdb();
    const writer = new IdbDraftRepository(await openDraftDb());
    const saved = await writer.save({
      name: 'roundtrip',
      sampleRate: 44100,
      channels,
      length,
      audio,
    });

    // "page reload": brand-new handles over the same persisted database
    const reader = new IdbDraftRepository(await openDraftDb());
    const summaries = await reader.findAll();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ id: saved.id, name: 'roundtrip', hash: originalHash });

    const loaded = await reader.findById(saved.id);
    expect(loaded).not.toBeNull();
    expect(await hashPcm(loaded!.channels)).toBe(originalHash);
    for (let ch = 0; ch < channels; ++ch) {
      expect(loaded?.channels[ch]).toEqual(audio[ch]);
    }
  });

  test('the autosave store holds exactly one ring record and restores it', async () => {
    useFakeIdb();
    const writer = new IdbDraftRepository(await openDraftDb());
    const audio = signal(2048, 1);
    await writer.writeAutosave({
      name: 'autosaved session',
      sampleRate: 44100,
      channels: 1,
      length: 2048,
      audio,
    });
    await writer.writeAutosave({
      name: 'autosaved session 2',
      sampleRate: 44100,
      channels: 1,
      length: 2048,
      audio,
    });

    const reader = new IdbDraftRepository(await openDraftDb());
    const latest = await reader.readAutosave();
    expect(latest).not.toBeNull();
    expect(latest?.header.name).toBe('autosaved session 2'); // ring keeps only the newest

    await reader.clearAutosave();
    expect(await reader.readAutosave()).toBeNull();
  });

  test('rename survives a reload and updates the updatedAt stamp', async () => {
    useFakeIdb();
    const writer = new IdbDraftRepository(await openDraftDb());
    const saved = await writer.save({
      name: 'before',
      sampleRate: 48000,
      channels: 1,
      length: 64,
      audio: signal(64, 1),
    });
    const before = (await writer.findAll())[0]?.updatedAt ?? 0;
    await new Promise((resolve) => setTimeout(resolve, 5));
    const reader = new IdbDraftRepository(await openDraftDb());
    await reader.update(saved.id, { name: 'after' });
    const after = (await reader.findAll())[0];
    expect(after?.name).toBe('after');
    expect((after?.updatedAt ?? 0) - before).toBeGreaterThanOrEqual(4);
  });
});
