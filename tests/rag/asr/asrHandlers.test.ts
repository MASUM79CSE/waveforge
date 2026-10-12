import { describe, expect, it } from 'vitest';
import { createAsrHandlers, type TransformersLike } from '../../../src/rag/asr/asrHandlers';
import type { ModelStorage } from '../../../src/rag/models/storage';

const MODEL = 'onnx-community/whisper-tiny.en';

function fakeStorage(version: string | null): ModelStorage & { openCalls: string[] } {
  const fake = {
    openCalls: [] as string[],
    has: async () => version !== null,
    installedVersion: async () => version,
    put: async () => {},
    open: async (_id: string, path: string) => {
      fake.openCalls.push(path);
      return null;
    },
    deleteFile: async () => false,
    delete: async () => true,
    listInstalled: async () => [] as Array<{ id: string; version: string; bytes: number; installedAt: number }>,
    usage: async () => 0,
  };
  return fake;
}

function fakeLib() {
  const pipeCalls: Array<{ audio: Float32Array; opts: Record<string, unknown> }> = [];
  const env: TransformersLike['env'] = {
    useCustomCache: false,
    customCache: null,
    allowRemoteModels: true,
    allowLocalModels: true,
    backends: { onnx: { wasm: { wasmPaths: '' } } },
  };
  const lib: TransformersLike = {
    env,
    pipeline: async (_task, model, opts) => {
      expect(model).toBe(MODEL);
      expect((opts as { dtype?: string }).dtype).toBe('q8');
      return async (audio: Float32Array, opts: Record<string, unknown> = {}) => {
        pipeCalls.push({ audio, opts });
        return {
          text: 'hello world',
          chunks: [
            { text: ' hello', timestamp: [0, 1.2] },
            { text: ' world', timestamp: [1.2, null] },
          ],
        };
      };
    },
  };
  return { lib, env, pipeCalls };
}

function handlers(storage: ModelStorage, lib: TransformersLike) {
  return createAsrHandlers({ storage, importLib: async () => lib });
}

/** Record<string, …> index access is possibly undefined under strict + noUncheckedIndexedAccess. */
function method(h: ReturnType<typeof createAsrHandlers>, name: 'asr.init' | 'asr.transcribe' | 'asr.dispose') {
  const fn = h[name];
  if (!fn) throw new Error(`missing handler ${name}`);
  return fn;
}

describe('P2.5 ASR handlers', () => {
  it('init configures the env for OFFLINE operation and builds the pipeline', async () => {
    const storage = fakeStorage('1.0.0');
    const { lib, env } = fakeLib();
    const h = handlers(storage, lib);
    const res = (await method(h, 'asr.init')({ modelId: MODEL, version: '1.0.0' }, {} as never)) as { ready: boolean };
    expect(res.ready).toBe(true);
    expect(env.useCustomCache).toBe(true);
    expect(env.allowRemoteModels).toBe(false);
    expect(env.allowLocalModels).toBe(false);
    expect(env.backends.onnx.wasm.wasmPaths).toBe('/rag-assets/ort/');
    expect(env.customCache).not.toBeNull();
  });

  it('init rejects MODEL_NOT_INSTALLED when the version is absent', async () => {
    const { lib } = fakeLib();
    const h = handlers(fakeStorage(null), lib);
    await expect(method(h, 'asr.init')({ modelId: MODEL, version: '9.9.9' }, {} as never)).rejects.toMatchObject({
      code: 'MODEL_NOT_INSTALLED',
    });
  });

  it('init rejects BAD_PAYLOAD on garbage', async () => {
    const { lib } = fakeLib();
    const h = handlers(fakeStorage('1.0.0'), lib);
    await expect(method(h, 'asr.init')({ modelId: '' }, {} as never)).rejects.toMatchObject({ code: 'BAD_PAYLOAD' });
  });

  it('transcribe maps chunks to segments; null end closes at start+1', async () => {
    const { lib } = fakeLib();
    const h = handlers(fakeStorage('1.0.0'), lib);
    await method(h, 'asr.init')({ modelId: MODEL, version: '1.0.0' }, {} as never);
    const samples = new Float32Array(1600);
    const res = (await method(h, 'asr.transcribe')({ samples }, {} as never)) as {
      segments: Array<{ start: number; end: number; text: string }>;
      text: string;
    };
    expect(res.text).toBe('hello world');
    expect(res.segments).toEqual([
      { start: 0, end: 1.2, text: ' hello' },
      { start: 1.2, end: 2.2, text: ' world' },
    ]);
  });

  it('transcribe passes windowed-decoding options to the pipeline', async () => {
    const { lib, pipeCalls } = fakeLib();
    const h = handlers(fakeStorage('1.0.0'), lib);
    await method(h, 'asr.init')({ modelId: MODEL, version: '1.0.0' }, {} as never);
    await method(h, 'asr.transcribe')({ samples: new Float32Array(8) }, {} as never);
    expect(pipeCalls[0]!.opts).toMatchObject({ return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 });
  });

  it('transcribe before init → NOT_INITIALIZED; dispose releases the pipeline', async () => {
    const { lib } = fakeLib();
    const h = handlers(fakeStorage('1.0.0'), lib);
    await expect(method(h, 'asr.transcribe')({ samples: new Float32Array(8) }, {} as never)).rejects.toMatchObject({
      code: 'NOT_INITIALIZED',
    });
    await method(h, 'asr.init')({ modelId: MODEL, version: '1.0.0' }, {} as never);
    await method(h, 'asr.dispose')({}, {} as never);
    await expect(method(h, 'asr.transcribe')({ samples: new Float32Array(8) }, {} as never)).rejects.toMatchObject({
      code: 'NOT_INITIALIZED',
    });
  });
});
