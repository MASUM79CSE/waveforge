/**
 * Main-thread client for the peaks worker (ADR 003). Batched tile requests,
 * deduped in-flight keys, waiter fan-out, tiny tile cache. The worker is
 * injectable for protocol tests.
 */
import type { AudioBufferLike } from './AudioDocument';
import {
  PEAK_TILE,
  rawResponseSchema,
  tilesResponseSchema,
  type TileReq,
} from './protocol';
import { logger } from '../core/logger-instance';

export interface Tile {
  ch: number;
  level: number;
  tile: number;
  mins: Float32Array;
  maxs: Float32Array;
  count: number;
}

export interface PeakWorkerTransport {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  terminate(): void;
}

function defaultMakeWorker(): PeakWorkerTransport {
  const worker = new Worker(new URL('../workers/peaks.worker.ts', import.meta.url), {
    type: 'module',
  });
  return worker as unknown as PeakWorkerTransport;
}

interface Waiter {
  keys: string[];
  res: () => void;
}

export class PeakClient {
  private worker: PeakWorkerTransport;
  private id = 0;
  private cache = new Map<string, Tile>();
  private inFlight = new Set<string>();
  private waiters: Waiter[] = [];
  private rawWaiters = new Map<number, (samples: Float32Array) => void>();

  constructor(buffer: AudioBufferLike, makeWorker: () => PeakWorkerTransport = defaultMakeWorker) {
    this.worker = makeWorker();
    this.worker.onmessage = (ev: { data: unknown }) => this.handle(ev.data);

    const channels: ArrayBuffer[] = [];
    const transfer: Transferable[] = [];
    for (let ch = 0; ch < buffer.numberOfChannels; ++ch) {
      const copy = buffer.getChannelData(ch).slice();
      channels.push(copy.buffer);
      transfer.push(copy.buffer);
    }
    this.worker.postMessage({ type: 'init', channels }, transfer);
  }

  peek(ch: number, level: number, tile: number): Tile | undefined {
    return this.cache.get(tileKey(ch, level, tile));
  }

  bucketValue(ch: number, level: number, bucket: number): { min: number; max: number } | null {
    const tile = Math.floor(bucket / PEAK_TILE);
    const t = this.peek(ch, level, tile);
    if (!t) return null;
    const idx = bucket - tile * PEAK_TILE;
    if (idx >= t.count) return null;
    return { min: t.mins[idx] ?? 0, max: t.maxs[idx] ?? 0 };
  }

  /** Resolves when every requested tile is cached (immediately if already so). */
  requestTiles(reqs: TileReq[]): Promise<void> {
    const keys = reqs.map((r) => tileKey(r.ch, r.level, r.tile));
    const uncachedKeys = keys.filter((k) => !this.cache.has(k));
    if (uncachedKeys.length === 0) return Promise.resolve();

    return new Promise<void>((res) => {
      this.waiters.push({ keys: uncachedKeys, res });

      const toFetch = reqs.filter((_req, i) => {
        const key = keys[i] ?? '';
        return !this.cache.has(key) && !this.inFlight.has(key);
      });
      if (toFetch.length === 0) return;

      for (const r of toFetch) this.inFlight.add(tileKey(r.ch, r.level, r.tile));
      this.id += 1;
      this.worker.postMessage({ type: 'tiles', id: this.id, reqs: toFetch });
    });
  }

  requestRaw(ch: number, start: number, count: number): Promise<Float32Array> {
    this.id += 1;
    const id = this.id;
    return new Promise<Float32Array>((res) => {
      this.rawWaiters.set(id, res);
      this.worker.postMessage({ type: 'raw', id, ch, start, count });
    });
  }

  dispose(): void {
    this.worker.terminate();
    this.cache.clear();
    this.inFlight.clear();
    this.waiters = [];
    this.rawWaiters.clear();
  }

  private handle(data: unknown): void {
    const tiles = tilesResponseSchema.safeParse(data);
    if (tiles.success) {
      for (const item of tiles.data.results) {
        this.cache.set(tileKey(item.ch, item.level, item.tile), item);
        this.inFlight.delete(tileKey(item.ch, item.level, item.tile));
      }
      this.resolveWaiters();
      return;
    }

    const raw = rawResponseSchema.safeParse(data);
    if (raw.success) {
      const res = this.rawWaiters.get(raw.data.id);
      if (res) {
        this.rawWaiters.delete(raw.data.id);
        res(raw.data.samples);
      }
      return;
    }

    logger.error('peaks worker sent an unrecognized message');
  }

  private resolveWaiters(): void {
    this.waiters = this.waiters.filter((waiter) => {
      if (waiter.keys.every((k) => this.cache.has(k))) {
        waiter.res();
        return false;
      }
      return true;
    });
  }
}

function tileKey(ch: number, level: number, tile: number): string {
  return `${ch}:${level}:${tile}`;
}
