import { describe, expect, test } from 'vitest';
import { PeakClient, type PeakWorkerTransport } from '../../src/engine/peakClient';
import { buildMip, sliceTile } from '../../src/engine/peaksCompute';
import type { AudioBufferLike } from '../../src/engine/AudioDocument';

const LEVEL = 16;

function makeBuffer(samples: number[], channels = 1): AudioBufferLike {
  const data = Array.from({ length: channels }, () => new Float32Array(samples));
  return {
    numberOfChannels: channels,
    length: samples.length,
    sampleRate: 48000,
    duration: samples.length / 48000,
    getChannelData: (ch: number) => data[ch] ?? new Float32Array(0),
  };
}

/** Fake worker transport: records posts, lets the test drive responses. */
class FakeTransport implements PeakWorkerTransport {
  sent: unknown[] = [];
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  terminated = false;

  postMessage(msg: unknown): void {
    this.sent.push(msg);
  }

  terminate(): void {
    this.terminated = true;
  }

  lastTilesRequest(): { type: string; id: number; reqs: { ch: number; level: number; tile: number }[] } {
    const msg = [...this.sent].reverse().find((m) => (m as { type: string }).type === 'tiles');
    return msg as never;
  }
}

/** Computes the response the real worker would produce, from channel copies. */
function respondWithTiles(fake: FakeTransport, buffer: AudioBufferLike): void {
  const msg = fake.lastTilesRequest();
  const results = msg.reqs.map((req) => {
    const mip = buildMip(buffer.getChannelData(req.ch), req.level);
    const slice = sliceTile(mip, req.tile, 1024);
    return {
      ch: req.ch,
      level: req.level,
      tile: req.tile,
      mins: slice ? slice.mins.slice() : new Float32Array(0),
      maxs: slice ? slice.maxs.slice() : new Float32Array(0),
      count: slice?.count ?? 0,
    };
  });
  fake.onmessage?.({ data: { type: 'tiles', id: msg.id, results } });
}

describe('PeakClient (protocol integration)', () => {
  test('sends init with copied channels and terminates on dispose', () => {
    const buffer = makeBuffer([0, 1, -1]);
    const fake = new FakeTransport();
    const client = new PeakClient(buffer, () => fake);

    const init = fake.sent[0] as { type: string; channels: unknown[] };
    expect(init.type).toBe('init');
    expect(init.channels.length).toBe(1);

    client.dispose();
    expect(fake.terminated).toBe(true);
  });

  test('requestTiles fills the cache and bucketValue reads it back', async () => {
    const samples: number[] = [];
    for (let i = 0; i < 64; ++i) samples.push(i % 8 === 0 ? 1 : -1);
    const buffer = makeBuffer(samples);
    const fake = new FakeTransport();
    const client = new PeakClient(buffer, () => fake);

    const pending = client.requestTiles([{ ch: 0, level: LEVEL, tile: 0 }]);
    respondWithTiles(fake, buffer);
    await pending;

    const tile = client.peek(0, LEVEL, 0);
    expect(tile).not.toBeUndefined();
    expect(tile?.count).toBeGreaterThan(0);

    const value = client.bucketValue(0, LEVEL, 0);
    expect(value).toEqual({ min: -1, max: 1 });
    client.dispose();
  });

  test('concurrent duplicate requests are sent once and both resolve', async () => {
    const buffer = makeBuffer(new Array(64).fill(0.5));
    const fake = new FakeTransport();
    const client = new PeakClient(buffer, () => fake);

    const p1 = client.requestTiles([{ ch: 0, level: LEVEL, tile: 0 }]);
    const p2 = client.requestTiles([{ ch: 0, level: LEVEL, tile: 0 }]);
    const tilePosts = fake.sent.filter((m) => (m as { type: string }).type === 'tiles').length;
    expect(tilePosts).toBe(1);

    respondWithTiles(fake, buffer);
    await Promise.all([p1, p2]);
    client.dispose();
  });

  test('already-cached requests resolve without a postMessage', async () => {
    const buffer = makeBuffer(new Array(64).fill(0));
    const fake = new FakeTransport();
    const client = new PeakClient(buffer, () => fake);

    const first = client.requestTiles([{ ch: 0, level: LEVEL, tile: 0 }]);
    respondWithTiles(fake, buffer);
    await first;

    await client.requestTiles([{ ch: 0, level: LEVEL, tile: 0 }]);
    const tilePosts = fake.sent.filter((m) => (m as { type: string }).type === 'tiles').length;
    expect(tilePosts).toBe(1);
    client.dispose();
  });

  test('requestRaw round-trips a sample slice', async () => {
    const buffer = makeBuffer([0.25, -0.75, 1]);
    const fake = new FakeTransport();
    const client = new PeakClient(buffer, () => fake);

    const pending = client.requestRaw(0, 1, 2);
    const rawReq = fake.sent.find((m) => (m as { type: string }).type === 'raw') as {
      id: number;
      ch: number;
      start: number;
      count: number;
    };
    expect(rawReq).toMatchObject({ ch: 0, start: 1, count: 2 });

    fake.onmessage?.({ data: { type: 'raw', id: rawReq.id, samples: new Float32Array([-0.75, 1]) } });
    const samples = await pending;
    expect(Array.from(samples)).toEqual([-0.75, 1]);
    client.dispose();
  });
});
