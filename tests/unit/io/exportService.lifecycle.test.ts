/**
 * WF-001 — export lifecycle regression tests (audit/remediation).
 * Pins the worker-export contract of `src/io/exportService.ts`:
 * every terminal path (success / error / cancel / startup failure)
 * must stop the cancel watcher (zero pending timers), settle exactly
 * once, never touch a terminated worker again, and isolate concurrent
 * exports from each other's late messages.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runExport } from '../../../src/io/exportService';

type Message = { data: unknown };

/** Controllable Worker double: records posts, routes replies from tests. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  static reset(): void {
    FakeWorker.instances = [];
  }
  onmessage: ((event: Message) => void) | null = null;
  onerror: ((event: { message?: string }) => void) | null = null;
  terminated = false;
  readonly sent: unknown[] = [];
  readonly terminate = vi.fn((): void => {
    this.terminated = true;
  });
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(msg: unknown): void {
    if (this.terminated) throw new Error('postMessage on terminated FakeWorker');
    this.sent.push(msg);
  }
  reply(msg: unknown): void {
    this.onmessage?.({ data: msg });
  }
  fail(message: string): void {
    this.onerror?.({ message });
  }
}

function lastWorker(): FakeWorker {
  return FakeWorker.instances[FakeWorker.instances.length - 1]!;
}

function job(overrides: Partial<Parameters<typeof runExport>[0]> = {}): Parameters<typeof runExport>[0] {
  return {
    channels: [new Float32Array([0, 0.5, -0.5, 1])],
    sampleRate: 44100,
    options: { format: 'mp3', quality: '192' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWorker.reset();
  vi.stubGlobal('Worker', FakeWorker);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('exportService lifecycle (WF-001)', () => {
  it('success: worker terminated and ZERO pending timers after done', async () => {
    const pending = runExport(job());
    const worker = lastWorker();
    worker.reply({ type: 'done', data: new ArrayBuffer(8) });
    await expect(pending).resolves.toBeTruthy();
    expect(worker.terminated).toBe(true);
    // the cancel-watcher chain must be stopped, not left polling forever
    expect(vi.getTimerCount()).toBe(0);
  });

  it('error: rejects, terminates, ZERO pending timers', async () => {
    const pending = runExport(job());
    const worker = lastWorker();
    worker.reply({ type: 'error', detail: 'lame init failed' });
    await expect(pending).rejects.toThrow('lame init failed');
    expect(worker.terminated).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('startup failure: onerror rejects and leaves ZERO pending timers', async () => {
    const pending = runExport(job());
    lastWorker().fail('script load failed');
    await expect(pending).rejects.toThrow('script load failed');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancel: settles once with "cancelled", posts cancel exactly once, no timers', async () => {
    const signal = { cancelled: true }; // pre-cancelled
    const pending = runExport(job({ signal }));
    await vi.advanceTimersByTimeAsync(0); // let the first watch() tick run
    const worker = lastWorker();
    expect(worker.sent.filter((m) => (m as { cmd: string }).cmd === 'cancel')).toHaveLength(1);
    worker.reply({ type: 'cancelled' });
    await expect(pending).rejects.toThrow('cancelled');
    // late done after cancel must NOT resolve
    worker.reply({ type: 'done', data: new ArrayBuffer(8) });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('late cancel signal AFTER success: watcher must not post to the terminated worker', async () => {
    const signal = { cancelled: false };
    const pending = runExport(job({ signal }));
    const worker = lastWorker();
    worker.reply({ type: 'done', data: new ArrayBuffer(8) });
    await pending;
    // the old signal lives on in global state (exportActions S.exportCancel):
    // flipping it later must not resurrect the dead watcher
    signal.cancelled = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(worker.sent.filter((m) => (m as { cmd: string }).cmd === 'cancel')).toHaveLength(0);
  });

  it('settles exactly once: duplicate done messages after resolve are ignored', async () => {
    let settlements = 0;
    const guard = () => {
      settlements += 1;
      return undefined;
    };
    const pending = runExport(job()).then(guard, guard);
    const worker = lastWorker();
    worker.reply({ type: 'done', data: new ArrayBuffer(8) });
    worker.reply({ type: 'done', data: new ArrayBuffer(8) });
    worker.reply({ type: 'progress', done: 5, total: 5 });
    await pending;
    expect(settlements).toBe(1);
  });

  it('double cancel is safe: one cancel post, one rejection', async () => {
    const signal = { cancelled: false };
    let settlements = 0;
    const workerPending = runExport(job({ signal }));
    const counted = workerPending.then(
      () => void (settlements += 1),
      () => void (settlements += 1),
    );
    const worker = lastWorker();
    signal.cancelled = true;
    await vi.advanceTimersByTimeAsync(0);
    signal.cancelled = true; // still cancelled — must not post twice
    await vi.advanceTimersByTimeAsync(360);
    worker.reply({ type: 'cancelled' });
    await counted;
    expect(worker.sent.filter((m) => (m as { cmd: string }).cmd === 'cancel')).toHaveLength(1);
    expect(settlements).toBe(1);
  });

  it('export B is unaffected by export A late messages (isolation)', async () => {
    const a = runExport(job());
    const b = runExport(job({ options: { format: 'flac', quality: '5' } }));
    const workerB = lastWorker();
    const workerA = FakeWorker.instances[0]!;
    workerB.reply({ type: 'done', data: new ArrayBuffer(16) });
    const bResult = await b;
    expect(bResult.blob.size).toBe(16);
    // A now finishes, then emits late junk — B's result must not change
    workerA.reply({ type: 'done', data: new ArrayBuffer(8) });
    await a;
    workerA.reply({ type: 'progress', done: 1, total: 1 });
    workerA.reply({ type: 'done', data: new ArrayBuffer(64) });
    expect(bResult.blob.size).toBe(16);
    expect(vi.getTimerCount()).toBe(0); // both watchers stopped
  });

  it('cancel path never produces a download blob (rejection, not a result)', async () => {
    const signal = { cancelled: false };
    const pending = runExport(job({ signal }));
    signal.cancelled = true;
    await vi.advanceTimersByTimeAsync(0);
    lastWorker().reply({ type: 'cancelled' });
    await expect(pending).rejects.toThrow('cancelled');
  });

  it('FLAC path: same lifecycle guarantees (done → terminated, no timers)', async () => {
    const pending = runExport(job({ options: { format: 'flac', quality: '5' } }));
    const worker = lastWorker();
    worker.reply({ type: 'progress', done: 1, total: 2 });
    worker.reply({ type: 'done', data: new ArrayBuffer(4) });
    await expect(pending).resolves.toBeTruthy();
    expect(worker.terminated).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
