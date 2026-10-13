/**
 * WF-002 — buffer ownership/transfer regression tests (audit/remediation).
 * Pins the buffer contract of `src/io/exportService.ts`:
 *  - DEFAULT (canonical document channels): postMessage must NOT use a
 *    transfer list (structured clone keeps the immutable AudioDocument
 *    intact), the worker receives byte-identical L/R copies, and the
 *    source arrays stay usable after export AND after cancel.
 *  - `transferChannels: true` (callers passing exclusive buffers, e.g.
 *    the range-export sliceRegion copies): the channel buffers ARE
 *    transferred (zero-copy move), detaching the caller's copies —
 *    which is safe because the caller no longer uses them.
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

interface JobLike {
  channels: Float32Array[];
  sampleRate: number;
  options: { format: 'mp3' | 'flac' | 'wav'; quality: string };
  transferChannels?: boolean;
  signal?: { cancelled: boolean };
}

function stereoJob(overrides: Partial<JobLike> = {}): JobLike {
  return {
    channels: [new Float32Array([0.1, -0.2, 0.3]), new Float32Array([0.4, -0.5, 0.6])],
    sampleRate: 44100,
    options: { format: 'mp3', quality: '192' },
    ...overrides,
  };
}

/** Detached (neutered) ArrayBuffers have byteLength 0 in the sender realm. */
function detached(buf: Float32Array): boolean {
  return buf.buffer.byteLength === 0;
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

describe('exportService buffer ownership (WF-002)', () => {
  it('default: NO transfer list — canonical document data can never be detached', async () => {
    const j = stereoJob();
    const pending = runExport(j);
    const worker = lastWorker();
    worker.reply({ type: 'done', data: new ArrayBuffer(8) });
    await pending;
    expect(worker.transfers[0]).toBeUndefined();
  });

  it('default: worker receives byte-identical copies in L/R order, sources untouched', async () => {
    const left = new Float32Array([0.1, -0.2, 0.3]);
    const right = new Float32Array([0.4, -0.5, 0.6]);
    const snapshotL = new Float32Array(left);
    const snapshotR = new Float32Array(right);
    const pending = runExport(stereoJob({ channels: [left, right] }));
    const worker = lastWorker();
    const msg = worker.sent[0] as { left: Float32Array; right: Float32Array };
    expect(Array.from(msg.left)).toEqual(Array.from(snapshotL)); // L is channel 0
    expect(Array.from(msg.right)).toEqual(Array.from(snapshotR)); // R is channel 1
    worker.reply({ type: 'done', data: new ArrayBuffer(8) });
    await pending;
    // sources are intact and writable (document stays playable/editable)
    expect(Array.from(left)).toEqual(Array.from(snapshotL));
    expect(Array.from(right)).toEqual(Array.from(snapshotR));
    left[0] = 0.25; // exactly representable in Float32
    expect(left[0]).toBe(0.25);
  });

  it('default: sources still usable after CANCEL (no detachment on the cancel path)', async () => {
    const left = new Float32Array([0.1, -0.2, 0.3]);
    const snapshot = new Float32Array(left);
    const signal = { cancelled: false };
    const pending = runExport(stereoJob({ channels: [left], signal }));
    signal.cancelled = true;
    await vi.advanceTimersByTimeAsync(0);
    lastWorker().reply({ type: 'cancelled' });
    await expect(pending).rejects.toThrow('cancelled');
    expect(detached(left)).toBe(false);
    expect(Array.from(left)).toEqual(Array.from(snapshot));
  });

  it('transferChannels:true — stereo transfers exactly [left.buffer, right.buffer]', async () => {
    const left = new Float32Array([0.1, -0.2, 0.3]);
    const right = new Float32Array([0.4, -0.5, 0.6]);
    const pending = runExport(stereoJob({ channels: [left, right], transferChannels: true }));
    const worker = lastWorker();
    const transfer = worker.transfers[0] as ArrayBuffer[];
    expect(transfer).toHaveLength(2);
    expect(transfer).toContain(left.buffer);
    expect(transfer).toContain(right.buffer);
    worker.reply({ type: 'done', data: new ArrayBuffer(8) });
    await pending;
  });

  it('transferChannels:true — mono transfers only [left.buffer]', async () => {
    const left = new Float32Array([0.1, -0.2, 0.3]);
    const pending = runExport(stereoJob({ channels: [left], transferChannels: true }));
    const worker = lastWorker();
    const transfer = worker.transfers[0] as ArrayBuffer[];
    expect(transfer).toEqual([left.buffer]);
    worker.reply({ type: 'done', data: new ArrayBuffer(8) });
    await pending;
  });

  it('transferChannels:true — FLAC request carries the caller buffers in the transfer list', async () => {
    const left = new Float32Array([0.1, -0.2, 0.3]);
    const pristine = new Float32Array(left);
    const pending = runExport(
      stereoJob({ channels: [left], transferChannels: true, options: { format: 'flac', quality: '5' } }),
    );
    const worker = lastWorker();
    const msg = worker.sent[0] as { left: Float32Array; frames: number };
    expect(msg.frames).toBe(3); // length read BEFORE the transfer, not after detach
    expect(worker.transfers[0]).toEqual([left.buffer]); // exactly this buffer is moved
    // (actual neutering is engine-guaranteed by the transfer list per the
    // HTML spec; the FakeWorker double records but does not perform it)
    worker.reply({ type: 'done', data: new ArrayBuffer(8) });
    await pending;
    expect(Array.from(pristine)).toEqual(Array.from(new Float32Array([0.1, -0.2, 0.3]))); // f32-exact
  });

  it('transferChannels:true + cancel: request posted immediately (transfer included), still no download', async () => {
    const left = new Float32Array([0.1, -0.2, 0.3]);
    const signal = { cancelled: true }; // cancel is cooperative: the encode
    // request posts first; the watcher tells the worker to abandon it
    const pending = runExport(stereoJob({ channels: [left], signal, transferChannels: true }));
    const worker = lastWorker();
    expect(worker.transfers[0]).toEqual([left.buffer]); // moved with the request
    worker.reply({ type: 'cancelled' });
    await expect(pending).rejects.toThrow('cancelled'); // rejection, never a blob
  });

  it('WAV path: sources never leave the main thread and stay intact', async () => {
    const left = new Float32Array([0.1, -0.2, 0.3]);
    const snapshot = new Float32Array(left);
    const pending = runExport(stereoJob({ channels: [left], options: { format: 'wav', quality: 'pcm16' } }));
    lastWorker().reply({ type: 'done', data: new ArrayBuffer(64) }); // WAV now answers via its worker
    const result = await pending;
    expect(result.mimeType).toBe('audio/wav');
    expect(result.blob.size).toBeGreaterThan(44); // RIFF header + data
    expect(Array.from(left)).toEqual(Array.from(snapshot));
  });
});
