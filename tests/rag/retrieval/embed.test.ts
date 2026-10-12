import { describe, expect, it } from 'vitest';
import { serveRpc } from '../../../src/rag/rpc/server';
import { FAKE_EMBED_DIM, cosine, embedText, embedTexts } from '../../../src/rag/retrieval/embedFake';
import { createEmbedClient, createFakeEmbedClient } from '../../../src/rag/retrieval/embedClient';
import { createEmbedHandlers } from '../../../src/rag/retrieval/embedHandlers';
import type { EmbedPipelineLike } from '../../../src/rag/retrieval/embedHandlers';
import type { ModelStorage } from '../../../src/rag/models/storage';
import { FakeWorker } from '../helpers/fakeWorker';

describe('P3.3 deterministic fake embeddings', () => {
  it('dimension + determinism', () => {
    const a = embedText('the quick brown fox');
    expect(a.length).toBe(FAKE_EMBED_DIM);
    expect(Array.from(a)).toEqual(Array.from(embedText('the quick brown fox')));
  });

  it('L2-normalized for non-empty; zero vector when no tokens survive', () => {
    for (const text of ['hello world', 'আমি ভালো', 'x']) {
      const v = embedText(text);
      const norm = Math.sqrt(Array.from(v).reduce((s, x) => s + x * x, 0));
      expect(norm).toBeCloseTo(1, 6);
    }
    const empty = embedText('... !!! the and');
    expect(Array.from(empty).every((x) => x === 0)).toBe(true);
  });

  it('signed hashing: ±1 components only before normalize', () => {
    // single-token text → exactly one ±1/dim component
    const v = embedText('uniqueword');
    const nonZero = Array.from(v).filter((x) => x !== 0);
    expect(nonZero.length).toBe(1);
    expect(Math.abs(nonZero[0]!)).toBeCloseTo(1, 6);
  });

  it('overlap ordering: shared tokens → higher cosine (property)', () => {
    const a = embedText('the engine renders the waveform peaks');
    const b = embedText('the waveform peaks render quickly'); // overlaps: waveform peaks (+ the)
    const c = embedText('export flac encoding worker'); // no overlap
    const ab = cosine(a, b);
    const ac = cosine(a, c);
    expect(ab).toBeGreaterThan(ac);
    // disjoint token sets → near zero, but 256-dim signed hashing allows
    // small collisions; only gross similarity is excluded
    expect(ac).toBeLessThan(0.5);
  });

  it('embedTexts maps one-to-one', () => {
    const vs = embedTexts(['a b', 'c d', 'a b']);
    expect(vs.length).toBe(3);
    expect(Array.from(vs[0]!)).toEqual(Array.from(vs[2]!));
  });
});

function fakeStorage(version: string | null): ModelStorage {
  return {
    has: async () => version !== null,
    installedVersion: async () => version,
    put: async () => {},
    open: async () => null,
    deleteFile: async () => false,
    delete: async () => true,
    listInstalled: async () => [],
    usage: async () => 0,
  };
}

function fakeLib() {
  const env = {
    useCustomCache: false,
    customCache: null,
    allowRemoteModels: true,
    allowLocalModels: true,
    backends: { onnx: { wasm: { wasmPaths: '' } } },
  };
  const pipe: EmbedPipelineLike = async (texts) => {
    // [n, 3] tensor: row i = [i, i+0.5, i+0.25] — NOT normalized (fake)
    const data = new Float32Array(texts.length * 3);
    for (let i = 0; i < texts.length; i++) {
      data[i * 3] = i;
      data[i * 3 + 1] = i + 0.5;
      data[i * 3 + 2] = i + 0.25;
    }
    return { data, dims: [texts.length, 3] };
  };
  const lib = {
    env,
    pipeline: async (_task: string, model: string, opts?: Record<string, unknown>) => {
      expect(model).toBe('Xenova/all-MiniLM-L6-v2');
      expect(opts).toMatchObject({ dtype: 'q8' });
      return pipe;
    },
  };
  return { env, lib };
}

function method(
  h: ReturnType<typeof createEmbedHandlers>,
  name: 'embed.init' | 'embed.embed' | 'embed.dispose',
) {
  const fn = h[name];
  if (!fn) throw new Error(`missing handler ${name}`);
  return fn;
}

describe('P3.3 embed handlers + client', () => {
  it('init enforces the offline env; NOT_INSTALLED without a version', async () => {
    const { env, lib } = fakeLib();
    const h = createEmbedHandlers({ storage: fakeStorage('1.0.0'), importLib: async () => lib });
    const res = (await method(h, 'embed.init')(
      { modelId: 'Xenova/all-MiniLM-L6-v2', version: '1.0.0' },
      {} as never,
    )) as { ready: boolean };
    expect(res.ready).toBe(true);
    expect(env.useCustomCache).toBe(true);
    expect(env.allowRemoteModels).toBe(false);
    expect(env.allowLocalModels).toBe(false);
    expect(env.backends.onnx.wasm.wasmPaths).toBe('/rag-assets/ort/');
    expect(env.customCache).not.toBeNull();

    const h2 = createEmbedHandlers({ storage: fakeStorage(null), importLib: async () => lib });
    await expect(method(h2, 'embed.init')({ modelId: 'x', version: '9', device: 'wasm' as const }, {} as never)).rejects.toMatchObject({
      code: 'MODEL_NOT_INSTALLED',
    });
  });

  it('embed splits the [n,d] tensor into rows; NOT_INITIALIZED before init', async () => {
    const { lib } = fakeLib();
    const fake = new FakeWorker();
    serveRpc(fake, createEmbedHandlers({ storage: fakeStorage('1.0.0'), importLib: async () => lib }));
    const client = createEmbedClient(() => fake);
    await client.init({ modelId: 'Xenova/all-MiniLM-L6-v2', version: '1.0.0' });
    const res = await client.embed(['one', 'two', 'three']);
    expect(res.vectors.length).toBe(3);
    expect(Array.from(res.vectors[1]!)).toEqual([1, 1.5, 1.25]);
    await client.dispose();
    await expect(client.embed(['x'])).rejects.toMatchObject({ code: 'NOT_INITIALIZED' });
    client.close();
  });

  it('result vectors ride the worker→main transfer list', async () => {
    const { lib } = fakeLib();
    const fake = new FakeWorker();
    serveRpc(fake, createEmbedHandlers({ storage: fakeStorage('1.0.0'), importLib: async () => lib }));
    const client = createEmbedClient(() => fake);
    await client.init({ modelId: 'Xenova/all-MiniLM-L6-v2', version: '1.0.0' });
    await client.embed(['a', 'b']);
    const embedResult = fake.fromWorker.find(
      (m) => (m.data as { kind?: string }).kind === 'result' && Array.isArray((m.data as { payload?: { vectors?: unknown[] } }).payload?.vectors),
    );
    expect(embedResult).toBeDefined();
    expect(embedResult!.transfer?.length).toBe(2);
    client.close();
  });

  it('fake client mirrors the EmbedClient contract', async () => {
    const client = createFakeEmbedClient();
    await expect(client.embed(['x'])).rejects.toMatchObject({ code: 'NOT_INITIALIZED' });
    await client.init({ modelId: 'fake', version: '0' });
    const res = await client.embed(['hello world', '']);
    expect(res.vectors[0]!.length).toBe(FAKE_EMBED_DIM);
    expect(Array.from(res.vectors[1]!).every((x) => x === 0)).toBe(true);
    client.close();
  });
});
