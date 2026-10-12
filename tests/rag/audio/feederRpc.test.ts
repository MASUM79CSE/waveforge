import { describe, expect, it } from 'vitest';
import { serveRpc } from '../../../src/rag/rpc/server';
import { RagRpcError } from '../../../src/rag/rpc/protocol';
import { createFeederClient } from '../../../src/rag/audio/feederClient';
import { createFeederHandlers } from '../../../src/rag/audio/feederHandlers';
import { FakeWorker } from '../helpers/fakeWorker';

/** Fresh fake worker + fresh pump state per test. */
function wired() {
  const fake = new FakeWorker();
  serveRpc(fake, createFeederHandlers());
  const client = createFeederClient(() => fake);
  return { fake, client };
}

describe('P2.2 feeder over RPC (fake worker)', () => {
  it('init → feed → finish returns windows with transferable buffers', async () => {
    const { fake, client } = wired();

    const init = await client.init({ srcRate: 16_000, totalFrames: 300, windowSec: 0.01, overlapSec: 0.0025 });
    expect(init.accepted).toBe(true);
    expect(init.winLen).toBe(160);
    expect(init.hopLen).toBe(120);

    const x = new Float32Array(300);
    for (let i = 0; i < 300; i++) x[i] = i / 300;
    const r1 = await client.feed([x]);
    // streaming semantics: window 1 needs input beyond sample 300 to be
    // fully determined (tap window), so it only appears after finish()
    expect(r1.windows.map((w) => w.index)).toEqual([0]);
    expect(r1.windows[0]!.t0).toBe(0);
    // f32 samples vs f64 literals — compare with f32-precision tolerance
    const s0 = r1.windows[0]!.samples;
    for (let j = 0; j < 4; j++) expect(s0[j]).toBeCloseTo(j / 300, 7);

    const r2 = await client.finish();
    expect(r2.done).toBe(true);
    expect(r2.progress).toBe(1);
    expect(r2.windows.map((w) => w.index)).toEqual([1, 2]);
    const all = [...r1.windows, ...r2.windows];
    expect(all.map((w) => w.samples.length)).toEqual([160, 160, 60]);

    // worker→main: window buffers ride the transfer list — 1 on feed,
    // 2 on finish (windows 1 and 2)
    const withWindows = fake.fromWorker.filter(
      (m) =>
        (m.data as { kind?: string }).kind === 'result' &&
        Array.isArray((m.data as { payload?: { windows?: unknown[] } }).payload?.windows),
    );
    expect(withWindows.length).toBe(2);
    expect(withWindows[0]!.transfer?.length).toBe(1);
    expect(withWindows[1]!.transfer?.length).toBe(2);

    // main→worker: the channel buffer was transferred, not cloned
    const feedSent = fake.sent.find((m) => (m.data as { method?: string }).method === 'feeder.feed');
    expect(feedSent?.transfer).toContain(x.buffer);
    client.close();
  }, 20_000);

  it('feed without channels is rejected BAD_PAYLOAD', async () => {
    const { client } = wired();
    await client.init({ srcRate: 16_000, totalFrames: 10 });
    await expect(client.feed([])).rejects.toMatchObject({ code: 'BAD_PAYLOAD' });
    client.close();
  }, 20_000);

  it('feed before init is rejected NOT_INITIALIZED', async () => {
    const { client } = wired();
    await expect(client.feed([new Float32Array(10)])).rejects.toMatchObject({ code: 'NOT_INITIALIZED' });
    client.close();
  }, 20_000);

  it('init with invalid options is rejected BAD_PAYLOAD', async () => {
    const { client } = wired();
    await expect(client.init({ srcRate: -1, totalFrames: 0 })).rejects.toMatchObject({ code: 'BAD_PAYLOAD' });
    client.close();
  }, 20_000);

  it('an in-flight feed settles ABORTED when the signal fires', async () => {
    const fake = new FakeWorker(); // bare — no server: nothing ever resolves
    const client = createFeederClient(() => fake);
    const ac = new AbortController();
    const pending = client.feed([new Float32Array(10)], { signal: ac.signal });
    ac.abort();
    await expect(pending).rejects.toBeInstanceOf(RagRpcError);
    await expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
    client.close();
  }, 20_000);
});
