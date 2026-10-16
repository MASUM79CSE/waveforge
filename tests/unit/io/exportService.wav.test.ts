/**
 * WF-003 — WAV export must run OFF the main thread. The service used to
 * call the pure `encodeWav` inline (blocking the UI thread for the whole
 * encode, with synthesized 0.5/1 progress and no cancel). These tests pin
 * the worker-based contract: same module-worker protocol as MP3/FLAC
 * (progress, cancel, zod-typed messages), result still audio/wav,
 * transfer semantics identical to the other formats (WF-002).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runExport } from '../../../src/io/exportService';

type Message = { data: unknown };

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: Message) => void) | null = null;
  onerror: ((event: { message?: string }) => void) | null = null;
  terminated = false;
  readonly sent: unknown[] = [];
  readonly transfers: (Transferable | undefined)[] = [];
  constructor() {
    FakeWorker.instances.push(this);
  }
  terminate(): void {
    this.terminated = true;
  }
  postMessage(msg: unknown, transfer?: Transferable[]): void {
    if (this.terminated) throw new Error('postMessage on terminated FakeWorker');
    this.sent.push(msg);
    this.transfers.push(transfer);
  }
  reply(msg: unknown): void {
    this.onmessage?.({ data: msg });
  }
}

function lastWorker(): FakeWorker {
  return FakeWorker.instances[FakeWorker.instances.length - 1]!;
}

function wavJob(overrides: Record<string, unknown> = {}): Parameters<typeof runExport>[0] {
  return {
    channels: [new Float32Array([0.1, -0.2, 0.3]), new Float32Array([0.4, -0.5, 0.6])],
    sampleRate: 44100,
    options: { format: 'wav', quality: 'pcm24' },
    ...overrides,
  } as Parameters<typeof runExport>[0];
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('exportService WAV worker path (WF-003)', () => {
  it('wav export goes through a Worker (off the main thread)', async () => {
    const pending = runExport(wavJob());
    expect(FakeWorker.instances).toHaveLength(1); // RED pre-fix: no worker spawned
    const worker = lastWorker();
    worker.reply({ type: 'done', data: new ArrayBuffer(64) });
    const result = await pending;
    expect(result.mimeType).toBe('audio/wav'); // service keeps the WAV contract
    expect(result.blob.size).toBe(64);
  });

  it('request carries {cmd:"encode", sampleRate, encoding, left, right}', async () => {
    const left = new Float32Array([0.1, -0.2, 0.3]);
    const right = new Float32Array([0.4, -0.5, 0.6]);
    const pending = runExport(wavJob({ channels: [left, right], options: { format: 'wav', quality: 'float32' } }));
    const msg = lastWorker().sent[0] as {
      cmd: string;
      sampleRate: number;
      encoding: string;
      left: Float32Array;
      right: Float32Array;
    };
    expect(msg.cmd).toBe('encode');
    expect(msg.sampleRate).toBe(44100);
    expect(msg.encoding).toBe('float32');
    expect(Array.from(msg.left)).toEqual(Array.from(new Float32Array([0.1, -0.2, 0.3])));
    expect(Array.from(msg.right)).toEqual(Array.from(new Float32Array([0.4, -0.5, 0.6])));
    lastWorker().reply({ type: 'done', data: new ArrayBuffer(8) });
    await pending;
  });

  it('cancel now works for WAV: rejects "cancelled", no result blob', async () => {
    const signal = { cancelled: false };
    const pending = runExport(wavJob({ signal }));
    signal.cancelled = true;
    await vi.advanceTimersByTimeAsync(0);
    lastWorker().reply({ type: 'cancelled' });
    // RED pre-fix: the inline encode ignored the signal and RESOLVED
    await expect(pending).rejects.toThrow('cancelled');
    expect(lastWorker().terminated).toBe(true); // cleaned up on the cancel path
  });

  it('progress events are forwarded from the worker (real progress)', async () => {
    const fractions: number[] = [];
    const pending = runExport(wavJob({ onProgress: (f: number) => fractions.push(f) }));
    const worker = lastWorker();
    worker.reply({ type: 'progress', done: 1, total: 4 });
    worker.reply({ type: 'progress', done: 4, total: 4 });
    worker.reply({ type: 'done', data: new ArrayBuffer(8) });
    await pending;
    // real worker progress forwarded (RED pre-fix: synthesized [0.5, 1]);
    // the done handler also emits a final 1 (same as MP3/FLAC paths)
    expect(fractions[0]).toBe(0.25);
    expect(fractions.at(-1)).toBe(1);
    expect(fractions.length).toBeGreaterThanOrEqual(2);
  });

  it('transfer semantics match the other formats (default none; opt-in moves)', async () => {
    const left = new Float32Array([0.1]);
    const pending = runExport(wavJob({ channels: [left], transferChannels: true }));
    const transfer = lastWorker().transfers[0] as ArrayBuffer[];
    expect(transfer).toEqual([left.buffer]); // RED pre-fix: no worker request at all
    lastWorker().reply({ type: 'done', data: new ArrayBuffer(8) });
    await pending;
  });

  it('worker error rejects with the detail', async () => {
    const pending = runExport(wavJob());
    lastWorker().reply({ type: 'error', detail: 'bad encoding' });
    await expect(pending).rejects.toThrow('bad encoding');
  });
});
