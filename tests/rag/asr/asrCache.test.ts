import { describe, expect, it } from 'vitest';
import { createStorageCache, modelPathFromCacheKey } from '../../../src/rag/asr/asrCache';
import type { ModelStorage } from '../../../src/rag/models/storage';

const MODEL = 'onnx-community/whisper-tiny.en';

function fakeStorage(files: Record<string, ArrayBuffer>): ModelStorage & { puts: number } {
  const fake = {
    puts: 0,
    has: async (id: string) => id === MODEL,
    installedVersion: async () => '1.0.0',
    put: async () => {
      fake.puts++;
    },
    open: async (_id: string, path: string) => files[path] ?? null,
    deleteFile: async () => false,
    delete: async () => true,
    listInstalled: async () => [] as Array<{ id: string; version: string; bytes: number; installedAt: number }>,
    usage: async () => 0,
  };
  return fake;
}

describe('P2.5 modelPathFromCacheKey', () => {
  it('resolves remote huggingface URLs (default proposedCacheKey)', () => {
    expect(modelPathFromCacheKey(`https://huggingface.co/${MODEL}/resolve/main/config.json`, MODEL)).toBe(
      'config.json',
    );
    expect(
      modelPathFromCacheKey(`https://huggingface.co/${MODEL}/resolve/v1-2/onnx/decoder.onnx`, MODEL),
    ).toBe('onnx/decoder.onnx');
  });

  it('resolves local-path keys and bare keys', () => {
    expect(modelPathFromCacheKey(`/models/${MODEL}/tokenizer.json`, MODEL)).toBe('tokenizer.json');
    expect(modelPathFromCacheKey(`${MODEL}/onnx/encoder_model_quantized.onnx`, MODEL)).toBe(
      'onnx/encoder_model_quantized.onnx',
    );
  });

  it('returns null for other models or unrelated keys', () => {
    expect(modelPathFromCacheKey('https://huggingface.co/other/model/resolve/main/config.json', MODEL)).toBeNull();
    expect(modelPathFromCacheKey('https://example.com/whatever', MODEL)).toBeNull();
  });

  it('decodes URL-encoded characters in the path', () => {
    expect(modelPathFromCacheKey(`https://huggingface.co/${MODEL}/resolve/main/a%20b.onnx`, MODEL)).toBe('a b.onnx');
  });
});

describe('P2.5 storage cache adapter', () => {
  it('match serves stored bytes as a Response; miss → undefined', async () => {
    const bytes = new TextEncoder().encode('fake-config');
    const cache = createStorageCache(fakeStorage({ 'config.json': bytes.buffer as ArrayBuffer }), MODEL);
    const hit = await cache.match(`https://huggingface.co/${MODEL}/resolve/main/config.json`);
    expect(hit).toBeDefined();
    expect(new Uint8Array(await hit!.arrayBuffer())).toEqual(bytes);
    expect(await cache.match(`https://huggingface.co/${MODEL}/resolve/main/missing.onnx`)).toBeUndefined();
    expect(await cache.match('https://unrelated.example/x')).toBeUndefined();
  });

  it('put is a no-op — nothing reaches storage outside the consented downloader', async () => {
    const storage = fakeStorage({});
    const cache = createStorageCache(storage, MODEL);
    await cache.put('anything', new Response('x'));
    expect(storage.puts).toBe(0);
  });
});
