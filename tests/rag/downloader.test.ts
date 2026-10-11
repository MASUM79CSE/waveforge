import { describe, expect, test } from 'vitest';
import { createModelStorage } from '../../src/rag/models/storage';
import { downloadFile, downloadModel, DownloadError } from '../../src/rag/models/downloader';
import { fakeCaches } from './helpers/fakeCaches';

const enc = new TextEncoder();
const dec = new TextDecoder();

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function setup() {
  const caches = fakeCaches();
  const storage = createModelStorage(caches as never);
  return { caches, storage };
}

const SPEC = (body: string) => ({
  path: 'model.onnx',
  url: 'https://models.example/x.onnx',
  bytes: body.length,
  sha256: '', // filled per test
});

function okFetch(body: string) {
  return (async () => new Response(enc.encode(body))) as unknown as typeof fetch;
}

describe('RAG model downloader (P1.4)', () => {
  test('full download: verifies sha256 and stores the file', async () => {
    const { storage } = setup();
    const body = 'hello-model';
    const spec = { ...SPEC(body), sha256: await sha256Hex(enc.encode(body).buffer as ArrayBuffer) };
    await downloadFile('m1', '1.0.0', spec, { storage, fetchImpl: okFetch(body) });
    expect(dec.decode((await storage.open('m1', 'model.onnx'))!)).toBe(body);
  });

  test('progress callbacks increase monotonically to 100', async () => {
    const { storage } = setup();
    const body = 'abcdefgh';
    const spec = { ...SPEC(body), sha256: await sha256Hex(enc.encode(body).buffer as ArrayBuffer) };
    const pcts: number[] = [];
    await downloadFile('m1', '1.0.0', spec, {
      storage,
      fetchImpl: (async () =>
        new Response(
          new ReadableStream({
            start(c) {
              for (const ch of ['ab', 'cd', 'ef', 'gh']) c.enqueue(enc.encode(ch));
              c.close();
            },
          }),
        )) as unknown as typeof fetch,
      onProgress: (pct) => pcts.push(pct),
    });
    expect(pcts.length).toBeGreaterThanOrEqual(2);
    expect([...pcts].sort((a, b) => a - b)).toEqual(pcts);
    expect(pcts[pcts.length - 1]).toBe(100);
    await storage.open('m1', 'model.onnx'); // smoke
  });

  test('integrity failure → INTEGRITY error and nothing stored (no partials)', async () => {
    const { storage } = setup();
    const body = 'tampered';
    const spec = { ...SPEC(body), sha256: 'f'.repeat(64) };
    await expect(downloadFile('m1', '1.0.0', spec, { storage, fetchImpl: okFetch(body) })).rejects.toMatchObject({
      code: 'INTEGRITY',
    });
    expect(await storage.open('m1', 'model.onnx')).toBeNull();
    expect(await storage.open('m1', 'model.onnx.partial')).toBeNull();
  });

  test('resume: 206 with the tail completes the file', async () => {
    const { storage } = setup();
    const body = 'abcdef';
    const spec = { ...SPEC(body), sha256: await sha256Hex(enc.encode(body).buffer as ArrayBuffer) };
    // seed a 3-byte partial
    await storage.put('m1', '1.0.0', 'model.onnx.partial', enc.encode('abc').buffer as ArrayBuffer);
    const ranged = (async () =>
      new Response(enc.encode('def'), {
        status: 206,
        headers: { 'content-range': 'bytes 3-5/6' },
      })) as unknown as typeof fetch;
    await downloadFile('m1', '1.0.0', spec, { storage, fetchImpl: ranged, initial: await storage.open('m1', 'model.onnx.partial') ?? undefined });
    expect(dec.decode((await storage.open('m1', 'model.onnx'))!)).toBe('abcdef');
    expect(await storage.open('m1', 'model.onnx.partial')).toBeNull();
  });

  test('server ignores Range (200) → clean restart, no duplication', async () => {
    const { storage } = setup();
    const body = 'full';
    const spec = { ...SPEC(body), sha256: await sha256Hex(enc.encode(body).buffer as ArrayBuffer) };
    await storage.put('m1', '1.0.0', 'model.onnx.partial', enc.encode('stale').buffer as ArrayBuffer);
    const plain200 = (async () => new Response(enc.encode(body))) as unknown as typeof fetch;
    await downloadFile('m1', '1.0.0', spec, { storage, fetchImpl: plain200, initial: await storage.open('m1', 'model.onnx.partial') ?? undefined });
    expect(dec.decode((await storage.open('m1', 'model.onnx'))!)).toBe('full');
  });

  test('flaky network: one failure then success (retry with backoff)', async () => {
    const { storage } = setup();
    const body = 'retry-me';
    const spec = { ...SPEC(body), sha256: await sha256Hex(enc.encode(body).buffer as ArrayBuffer) };
    let calls = 0;
    const flaky = (async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('network gone');
      return new Response(enc.encode(body));
    }) as unknown as typeof fetch;
    await downloadFile('m1', '1.0.0', spec, { storage, fetchImpl: flaky, backoffMs: () => 0 });
    expect(calls).toBe(2);
    expect(dec.decode((await storage.open('m1', 'model.onnx'))!)).toBe(body);
  });

  test('persistent failure → NETWORK after max attempts (partial kept for resume)', async () => {
    const { storage } = setup();
    const spec = { ...SPEC('x'), sha256: 'a'.repeat(64) };
    const always = (async () => {
      throw new TypeError('down');
    }) as unknown as typeof fetch;
    await expect(
      downloadFile('m1', '1.0.0', spec, { storage, fetchImpl: always, backoffMs: () => 0, maxAttempts: 3 }),
    ).rejects.toMatchObject({ code: 'NETWORK' });
  });

  test('abort mid-stream → ABORTED, partial retained for resume', async () => {
    const { storage } = setup();
    const body = 'a'.repeat(16);
    const spec = { ...SPEC(body), sha256: 'b'.repeat(64) };
    const ac = new AbortController();
    const stream = (async () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(enc.encode('12345678'));
            setTimeout(() => ac.abort(), 5);
            // never closes
          },
        }),
      )) as unknown as typeof fetch;
    await expect(
      downloadFile('m1', '1.0.0', spec, { storage, fetchImpl: stream, signal: ac.signal }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
    // partial content remains available (bytes already received)
    const partial = await storage.open('m1', 'model.onnx.partial');
    expect(partial).not.toBeNull();
    expect(partial!.byteLength).toBe(8);
  });

  test('pre-aborted signal never calls fetch', async () => {
    const { storage } = setup();
    let calls = 0;
    const spec = { ...SPEC('x'), sha256: 'c'.repeat(64) };
    const ac = new AbortController();
    ac.abort();
    await expect(
      downloadFile('m1', '1.0.0', spec, {
        storage,
        fetchImpl: (async () => {
          calls += 1;
          return new Response(enc.encode('x'));
        }) as unknown as typeof fetch,
        signal: ac.signal,
      }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
    expect(calls).toBe(0);
  });

  test('quota errors from storage surface as RagQuotaError (not swallowed)', async () => {
    const { storage } = setup();
    const body = 'x';
    const spec = { ...SPEC(body), sha256: await sha256Hex(enc.encode(body).buffer as ArrayBuffer) };
    const quotaStorage = {
      open: storage.open.bind(storage),
      put: async () => {
        const e = new DOMException('quota', 'QuotaExceededError');
        throw e;
      },
      delete: storage.delete.bind(storage),
    };
    await expect(
      downloadFile('m1', '1.0.0', spec, { storage: quotaStorage as never, fetchImpl: okFetch(body) }),
    ).rejects.toMatchObject({ code: 'QUOTA' });
  });

  test('downloadModel: concurrency limit 2 with three files', async () => {
    const { storage } = setup();
    const files = ['a', 'b', 'c'].map((n) => {
      const body = `file-${n}`;
      return {
        path: `${n}.bin`,
        url: `https://models.example/${n}`,
        bytes: body.length,
        sha256: '', // set after (async)
      };
    });
    for (const f of files) f.sha256 = await sha256Hex(enc.encode(`file-${f.path[0]}`).buffer as ArrayBuffer);
    let inFlight = 0;
    let peak = 0;
    const traced = (async (url: unknown) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      const n = String(url).split('/').pop()!;
      return new Response(enc.encode(`file-${n}`));
    }) as unknown as typeof fetch;
    const model = { version: '1.0.0', files };
    await downloadModel('m1', model, {
      storage,
      fetchImpl: traced,
      concurrency: 2,
      backoffMs: () => 0,
    });
    expect(peak).toBe(2);
    expect(dec.decode((await storage.open('m1', 'a.bin'))!)).toBe('file-a');
    expect(dec.decode((await storage.open('m1', 'c.bin'))!)).toBe('file-c');
  });

  test('DownloadError carries code and is an Error', () => {
    const e = new DownloadError('NETWORK', 'x');
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe('NETWORK');
  });
});
