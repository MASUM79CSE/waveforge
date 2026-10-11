import { describe, expect, test, vi } from 'vitest';
import { FakeWorker } from './helpers/fakeWorker';
import { serveRpc } from '../../src/rag/rpc/server';
import { createRpcClient } from '../../src/rag/rpc/client';

/** Wire a fresh client+server pair over a FakeWorker; returns test handles. */
function wire(handlers: Parameters<typeof serveRpc>[1]) {
  const worker = new FakeWorker();
  serveRpc(worker, handlers);
  const client = createRpcClient(() => worker);
  return { worker, client };
}

const echoHandlers = {
  echo: async (payload: unknown) => payload,
  boom: async () => {
    throw new Error('handler exploded');
  },
  slow: async (_p: unknown, ctx: { signal: AbortSignal }) => {
    await new Promise((resolve, reject) => {
      const t = setTimeout(resolve, 5_000);
      ctx.signal.addEventListener('abort', () => {
        clearTimeout(t);
        reject(new DOMException('aborted', 'AbortError'));
      });
    });
    return 'done';
  },
};

describe('RAG RPC harness (P1.2)', () => {
  test('happy path: call resolves with the handler result', async () => {
    const { client } = wire(echoHandlers);
    await expect(client.call('echo', { x: 42 })).resolves.toEqual({ x: 42 });
  });

  test('progress events arrive in order before the result', async () => {
    const { client } = wire({
      counting: async (_p, ctx) => {
        ctx.progress(10, 'a');
        ctx.progress(50, 'b');
        ctx.progress(90);
        return 'ok';
      },
    });
    const seen: Array<{ pct: number; note?: string }> = [];
    const res = await client.call('counting', null, {
      onProgress: (pct, note) => seen.push({ pct, note }),
    });
    expect(res).toBe('ok');
    expect(seen.map((s) => s.pct)).toEqual([10, 50, 90]);
    expect(seen[0]!.note).toBe('a');
    expect(seen[2]!.note).toBeUndefined();
  });

  test('handler rejection surfaces a typed error envelope', async () => {
    const { client } = wire(echoHandlers);
    await expect(client.call('boom', null)).rejects.toMatchObject({
      code: 'HANDLER_ERROR',
      message: expect.stringContaining('exploded'),
    });
  });

  test('unknown method → METHOD_NOT_FOUND', async () => {
    const { client } = wire(echoHandlers);
    await expect(client.call('nope', null)).rejects.toMatchObject({ code: 'METHOD_NOT_FOUND' });
  });

  test('cancel mid-flight: abort signal → ABORTED and server cancelled', async () => {
    const { client } = wire(echoHandlers);
    const ac = new AbortController();
    const p = client.call('slow', null, { signal: ac.signal });
    setTimeout(() => ac.abort(), 5);
    await expect(p).rejects.toMatchObject({ code: 'ABORTED' });
  });

  test('pre-aborted signal rejects immediately without posting', async () => {
    const { worker, client } = wire(echoHandlers);
    const ac = new AbortController();
    ac.abort();
    await expect(client.call('echo', null, { signal: ac.signal })).rejects.toMatchObject({
      code: 'ABORTED',
    });
    expect(worker.sent).toHaveLength(0);
  });

  test('timeout rejects TIMEOUT and cancels the server op', async () => {
    vi.useFakeTimers();
    try {
      const { client } = wire(echoHandlers);
      const p = client.call('slow', null, { timeoutMs: 20 });
      const expectation = expect(p).rejects.toMatchObject({ code: 'TIMEOUT' });
      await vi.advanceTimersByTimeAsync(30);
      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });

  test('interleaved calls are correlated by id', async () => {
    const { client } = wire({
      slowEcho: async (p) => {
        await new Promise((r) => setTimeout(r, Number((p as { ms: number }).ms)));
        return p;
      },
    });
    const a = client.call('slowEcho', { ms: 30, tag: 'a' });
    const b = client.call('slowEcho', { ms: 5, tag: 'b' });
    await expect(b).resolves.toMatchObject({ tag: 'b' });
    await expect(a).resolves.toMatchObject({ tag: 'a' });
  });

  test('malformed client→worker request is dropped by the server', async () => {
    const { client } = wire(echoHandlers);
    // poke the raw transport with a malformed payload
    const anyClient = client as unknown as { __post: (d: unknown) => void };
    anyClient.__post({ method: 'echo' }); // no id
    anyClient.__post({ id: 'x1', method: 7 }); // bad method type
    await expect(client.call('echo', 'still-alive')).resolves.toBe('still-alive');
  });

  test('malformed worker→main message is ignored by the client', async () => {
    const { worker, client } = wire(echoHandlers);
    const p = client.call('echo', 'x');
    worker.emitMalformedFromWorker();
    worker.onmessage?.({ data: { kind: 'result' } }); // missing id
    await expect(p).resolves.toBe('x');
  });

  test('client-side transfer list reaches the transport', async () => {
    const { worker, client } = wire(echoHandlers);
    const buf = new ArrayBuffer(8);
    await client.call('echo', buf, { transfer: [buf] });
    expect(worker.sent[0]!.transfer).toEqual([buf]);
  });

  test('crash: pending calls reject CRASHED, one automatic restart, next call succeeds', async () => {
    let release: (v: unknown) => void = () => {};
    const gated = {
      hold: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
      ...echoHandlers,
    };
    const workers: FakeWorker[] = [];
    const client = createRpcClient(() => {
      const w = new FakeWorker();
      workers.push(w);
      serveRpc(w, gated);
      return w;
    });
    const p1 = client.call('hold', null);
    await vi.waitFor(() => expect(workers[0]!.sent.length).toBeGreaterThan(0));
    workers[0]!.crash();
    await expect(p1).rejects.toMatchObject({ code: 'CRASHED' });
    release('done'); // settle the old worker's handler (its client is gone)
    const p2 = client.call('echo', 'second');
    await expect(p2).resolves.toBe('second');
    expect(workers).toHaveLength(2);
    // second crash: no more restarts
    workers[1]!.crash();
    const p3 = client.call('echo', 'third');
    await expect(p3).rejects.toMatchObject({ code: 'CRASHED' });
    expect(workers).toHaveLength(2);
  });

  test('close() settles pending calls with CRASHED and closes the worker', async () => {
    const { worker, client } = wire(echoHandlers);
    const p = client.call('echo', 'x');
    client.close();
    await expect(p).rejects.toMatchObject({ code: 'CRASHED' });
    expect(worker.closed).toBe(true);
  });

  test('duplicate registration of the same id is impossible (counter ids)', async () => {
    const { client } = wire(echoHandlers);
    const results = await Promise.all([
      client.call('echo', 1),
      client.call('echo', 2),
      client.call('echo', 3),
    ]);
    expect(results).toEqual([1, 2, 3]);
  });

  test('server reports CANCELLED envelope when the handler honours abort', async () => {
    const { client } = wire({
      cancellable: async (_p, ctx) => {
        await new Promise((_resolve, reject) =>
          ctx.signal.addEventListener('abort', () => reject(new DOMException('x', 'AbortError'))),
        );
        return 'never';
      },
    });
    const ac = new AbortController();
    const p = client.call('cancellable', null, { signal: ac.signal });
    setTimeout(() => ac.abort(), 5);
    await expect(p).rejects.toMatchObject({ code: 'ABORTED' });
  });

  test('onmessageerror alone does not kill the client', async () => {
    const { worker, client } = wire(echoHandlers);
    worker.emitMalformedFromWorker();
    await expect(client.call('echo', 'ok')).resolves.toBe('ok');
  });
});
