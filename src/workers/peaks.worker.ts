/**
 * Peaks worker (ADR 003): owns private channel copies, builds min/max mips
 * on demand with a byte-budget cache, serves tiles and raw slices.
 * All kernels are pure functions from peaksCompute (ADR 004 exception).
 */
import { buildMip, sliceTile, type PeakMip } from '../engine/peaksCompute';
import {
  initRequestSchema,
  rawRequestSchema,
  tilesRequestSchema,
  PEAK_TILE,
} from '../engine/protocol';

interface WorkerScope {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  onmessage: ((ev: MessageEvent) => void) | null;
}

const sw = self as unknown as WorkerScope;

const channels: Float32Array[] = [];
const mips = new Map<string, PeakMip>(); // `${ch}:${level}`
let mipBytes = 0;
const MIP_BUDGET_BYTES = 384 * 1024 * 1024;

function getMip(ch: number, level: number): PeakMip | null {
  const data = channels[ch];
  if (!data) return null;
  const key = `${ch}:${level}`;
  const existing = mips.get(key);
  if (existing) return existing;

  const mip = buildMip(data, level);
  const add = mip.mins.byteLength + mip.maxs.byteLength;
  while (mipBytes + add > MIP_BUDGET_BYTES && mips.size > 0) {
    const oldest = mips.keys().next();
    if (oldest.done) break;
    const evicted = mips.get(oldest.value);
    if (evicted) {
      mipBytes -= evicted.mins.byteLength + evicted.maxs.byteLength;
    }
    mips.delete(oldest.value);
  }
  mips.set(key, mip);
  mipBytes += add;
  return mip;
}

function handleTiles(id: number, reqs: { ch: number; level: number; tile: number }[]): void {
  const results: Array<{
    ch: number;
    level: number;
    tile: number;
    mins: Float32Array;
    maxs: Float32Array;
    count: number;
  }> = [];
  const transfer: Transferable[] = [];

  for (const req of reqs) {
    const mip = getMip(req.ch, req.level);
    if (!mip) continue;
    const slice = sliceTile(mip, req.tile, PEAK_TILE);
    if (!slice) continue;
    transfer.push(slice.mins.buffer, slice.maxs.buffer);
    results.push({ ch: req.ch, level: req.level, tile: req.tile, ...slice });
  }

  sw.postMessage({ type: 'tiles', id, results }, transfer);
}

function handleRaw(id: number, ch: number, start: number, count: number): void {
  const data = channels[ch] ?? new Float32Array(0);
  const s = Math.max(0, Math.min(data.length, start));
  const e = Math.max(s, Math.min(data.length, start + count));
  const samples = data.slice(s, e);
  sw.postMessage({ type: 'raw', id, samples }, [samples.buffer]);
}

sw.onmessage = (ev: MessageEvent) => {
  const init = initRequestSchema.safeParse(ev.data);
  if (init.success) {
    for (const buffer of init.data.channels) channels.push(new Float32Array(buffer));
    return;
  }

  const tiles = tilesRequestSchema.safeParse(ev.data);
  if (tiles.success) {
    handleTiles(tiles.data.id, tiles.data.reqs);
    return;
  }

  const raw = rawRequestSchema.safeParse(ev.data);
  if (raw.success) {
    handleRaw(raw.data.id, raw.data.ch, raw.data.start, raw.data.count);
  }
};
