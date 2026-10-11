import { describe, expect, test } from 'vitest';
import {
  MODEL_REGISTRY,
  ModelEntrySchema,
  getModel,
  totalBytes,
  type ModelEntry,
} from '../../src/rag/models/manifest';
import { createModelStorage, RagQuotaError } from '../../src/rag/models/storage';

function fakeCaches() {
  // Mirrors real Cache semantics: bodies are stored as bytes and every
  // match() hands back a FRESH Response (single-use bodies!).
  const stores = new Map<string, Map<string, ArrayBuffer>>();
  return {
    async open(name: string) {
      let m = stores.get(name);
      if (!m) {
        m = new Map();
        stores.set(name, m);
      }
      const store = m;
      return {
        async match(key: string | Request): Promise<Response | undefined> {
          const body = store.get(String(key));
          return body ? new Response(body.slice(0)) : undefined;
        },
        async put(key: string | Request, resp: Response): Promise<void> {
          const body = await resp.arrayBuffer();
          store.set(String(key), body);
        },
        async delete(key: string | Request): Promise<boolean> {
          return store.delete(String(key));
        },
        async keys(): Promise<string[]> {
          return [...store.keys()];
        },
      };
    },
    _stores: stores,
  };
}

const entry: ModelEntry = {
  id: 'whisper-tiny',
  kind: 'asr',
  version: '1.0.0',
  files: [{ path: 'model.onnx', url: 'https://models.example/whisper-tiny.onnx', bytes: 40_000_000, sha256: 'a'.repeat(64) }],
  licence: 'MIT',
  sourceUrl: 'https://huggingface.co/Xenova/whisper-tiny',
  minProfile: 'low',
};

describe('model manifest (P1.3)', () => {
  test('accepts a valid entry', () => {
    expect(ModelEntrySchema.parse(entry)).toMatchObject({ id: 'whisper-tiny', kind: 'asr' });
  });

  test('rejects an unknown kind', () => {
    expect(() => ModelEntrySchema.parse({ ...entry, kind: 'gpu' })).toThrow();
  });

  test('rejects a file without a sha256', () => {
    const bad = { ...entry, files: [{ path: 'm', url: 'https://x/y', bytes: 1 }] };
    expect(() => ModelEntrySchema.parse(bad)).toThrow();
  });

  test('rejects a negative byte size', () => {
    const bad = { ...entry, files: [{ ...entry.files[0], bytes: -1 }] };
    expect(() => ModelEntrySchema.parse(bad)).toThrow();
  });

  test('registry ships empty-but-valid; getModel unknown → undefined', () => {
    expect(Array.isArray(MODEL_REGISTRY)).toBe(true);
    expect(MODEL_REGISTRY).toHaveLength(0); // entries appended in P2/P3/P4
    expect(getModel('definitely-not-a-model')).toBeUndefined();
  });

  test('totalBytes sums all files', () => {
    expect(
      totalBytes({
        ...entry,
        files: [...entry.files, { ...entry.files[0]!, path: 'tok', bytes: 1_000 }],
      }),
    ).toBe(40_001_000);
  });
});

describe('model storage (P1.3)', () => {
  test('put/open roundtrip; has() reflects installation', async () => {
    const storage = createModelStorage(fakeCaches() as never);
    await storage.put('m1', '1.0.0', 'model.onnx', new TextEncoder().encode('abc').buffer as ArrayBuffer);
    expect(await storage.has('m1')).toBe(true);
    const data = await storage.open('m1', 'model.onnx');
    expect(new TextDecoder().decode(data!)).toBe('abc');
  });

  test('has() false and open() null for unknown models', async () => {
    const storage = createModelStorage(fakeCaches() as never);
    expect(await storage.has('nope')).toBe(false);
    expect(await storage.open('nope', 'x')).toBeNull();
  });

  test('version bump evicts the old version file', async () => {
    const storage = createModelStorage(fakeCaches() as never);
    await storage.put('m1', '1.0.0', 'model.onnx', new TextEncoder().encode('v1').buffer as ArrayBuffer);
    await storage.put('m1', '2.0.0', 'model.onnx', new TextEncoder().encode('v2').buffer as ArrayBuffer);
    expect(new TextDecoder().decode((await storage.open('m1', 'model.onnx'))!)).toBe('v2');
    expect(await storage.installedVersion('m1')).toBe('2.0.0');
  });

  test('delete() removes files and index entry; unknown id is a no-op', async () => {
    const storage = createModelStorage(fakeCaches() as never);
    await storage.put('m1', '1.0.0', 'model.onnx', new TextEncoder().encode('x').buffer as ArrayBuffer);
    expect(await storage.delete('m1')).toBe(true);
    expect(await storage.has('m1')).toBe(false);
    expect(await storage.open('m1', 'model.onnx')).toBeNull();
    expect(await storage.delete('m1')).toBe(false);
  });

  test('listInstalled reports id/version/bytes and usage() sums', async () => {
    const storage = createModelStorage(fakeCaches() as never);
    await storage.put('a', '1.0.0', 'f', new ArrayBuffer(100));
    await storage.put('b', '3.1.0', 'f', new ArrayBuffer(250));
    const list = await storage.listInstalled();
    expect(list.map((x) => x.id).sort()).toEqual(['a', 'b']);
    expect(list.find((x) => x.id === 'b')?.version).toBe('3.1.0');
    expect(await storage.usage()).toBe(350);
  });

  test('quota errors surface as typed RagQuotaError', async () => {
    const caches = fakeCaches();
    const origOpen = caches.open.bind(caches);
    caches.open = async (n: string) => {
      const c = await origOpen(n);
      return {
        ...c,
        async put(): Promise<void> {
          throw new DOMException('quota', 'QuotaExceededError');
        },
      };
    };
    const storage = createModelStorage(caches as never);
    await expect(
      storage.put('m1', '1.0.0', 'f', new ArrayBuffer(4)),
    ).rejects.toBeInstanceOf(RagQuotaError);
  });

  test('storage survives across instances with the same cache name', async () => {
    const caches = fakeCaches();
    const s1 = createModelStorage(caches as never);
    await s1.put('m1', '1.0.0', 'model.onnx', new TextEncoder().encode('persist').buffer as ArrayBuffer);
    const s2 = createModelStorage(caches as never);
    expect(await s2.has('m1')).toBe(true);
    expect(new TextDecoder().decode((await s2.open('m1', 'model.onnx'))!)).toBe('persist');
  });

  test('multiple files per model tracked in the index', async () => {
    const storage = createModelStorage(fakeCaches() as never);
    await storage.put('m1', '1.0.0', 'model.onnx', new ArrayBuffer(10));
    await storage.put('m1', '1.0.0', 'tokenizer.json', new ArrayBuffer(5));
    const list = await storage.listInstalled();
    expect(list[0]!.bytes).toBe(15);
    await storage.delete('m1');
    expect(await storage.open('m1', 'tokenizer.json')).toBeNull();
  });
});
