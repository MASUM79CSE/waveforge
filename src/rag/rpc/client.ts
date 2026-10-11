/**
 * RPC client (P1.2). Wraps a worker factory; one automatic restart on the
 * first crash (`onerror`), none after. Every call is id-correlated,
 * cancelable, timeout-able, progress-aware, and transfer-aware.
 */
import { MsgSchema, RagRpcError } from './protocol';

/** Minimal worker surface the client needs (duck-typed for fakes). */
export interface RpcWorkerLike {
  postMessage: (data: unknown, transfer?: Transferable[]) => void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: ((ev: { message?: string; error?: Error }) => void) | null;
  onmessageerror: ((ev?: unknown) => void) | null;
  close?: () => void;
}

export interface CallOptions {
  signal?: AbortSignal;
  onProgress?: (pct: number, note?: string) => void;
  /** Structured-clone transfer list for `payload`. */
  transfer?: Transferable[];
  /** Reject with TIMEOUT if no result within this many ms. */
  timeoutMs?: number;
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: RagRpcError) => void;
  onProgress?: (pct: number, note?: string) => void;
  timer: ReturnType<typeof setTimeout> | null;
  settled: boolean;
}

let seq = 0;
function nextId(): string {
  seq += 1;
  return `rpc-${seq}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface RpcClient {
  call<T = unknown>(method: string, payload?: unknown, opts?: CallOptions): Promise<T>;
  close(): void;
  /** Number of automatic restarts that happened (diagnostics/tests). */
  readonly restarts: number;
  /** Test seam: post a raw message as if it came from this client. */
  __post(data: unknown): void;
}

export function createRpcClient(makeWorker: () => RpcWorkerLike): RpcClient {
  let worker: RpcWorkerLike | null = null;
  let restarts = 0;
  let canRestart = true;
  /** Set when a crash exhausted the restart budget — new calls fail fast. */
  let dead = false;
  const pending = new Map<string, Pending>();

  function attach(w: RpcWorkerLike): void {
    worker = w;
    w.onmessage = (ev) => {
      const parsed = MsgSchema.safeParse(ev.data);
      if (!parsed.success) return; // malformed worker→main: ignore
      const msg = parsed.data;
      const p = pending.get(msg.id);
      if (!p || p.settled) return;
      switch (msg.kind) {
        case 'progress':
          p.onProgress?.(msg.pct, msg.note);
          break;
        case 'result':
          settle(msg.id, p);
          p.resolve(msg.payload);
          break;
        case 'error':
          settle(msg.id, p);
          p.reject(new RagRpcError(msg.code, msg.message));
          break;
        case 'cancelled':
          settle(msg.id, p);
          p.reject(new RagRpcError('ABORTED', 'operation cancelled'));
          break;
      }
    };
    w.onmessageerror = () => {
      /* malformed message: ignored by design */
    };
    w.onerror = (ev) => {
      for (const [id, p] of pending) {
        settle(id, p);
        p.reject(new RagRpcError('CRASHED', ev?.message ?? 'worker crashed'));
      }
      if (canRestart) {
        maybeRestart();
      } else {
        dead = true;
      }
    };
  }

  function maybeRestart(): void {
    if (!canRestart) return;
    canRestart = false;
    restarts += 1;
    try {
      worker?.close?.();
    } catch {
      /* ignore */
    }
    attach(makeWorker());
  }

  function settle(id: string, p: Pending): void {
    if (p.settled) return;
    p.settled = true;
    if (p.timer) clearTimeout(p.timer);
    pending.delete(id);
  }

  attach(makeWorker());

  return {
    get restarts() {
      return restarts;
    },
    __post(data: unknown): void {
      worker?.postMessage(data);
    },
    call<T = unknown>(method: string, payload?: unknown, opts: CallOptions = {}): Promise<T> {
      if (dead) {
        return Promise.reject(new RagRpcError('CRASHED', 'worker crashed; restart budget exhausted'));
      }
      if (opts.signal?.aborted) {
        return Promise.reject(new RagRpcError('ABORTED', 'aborted before start'));
      }
      const id = nextId();
      return new Promise<T>((resolve, reject) => {
        const p: Pending = {
          resolve: resolve as (v: unknown) => void,
          reject,
          onProgress: opts.onProgress,
          timer: null,
          settled: false,
        };
        pending.set(id, p);
        if (opts.timeoutMs !== undefined) {
          p.timer = setTimeout(() => {
            worker?.postMessage({ kind: 'cancel', id });
            settle(id, p);
            reject(new RagRpcError('TIMEOUT', `${method} timed out after ${opts.timeoutMs}ms`));
          }, opts.timeoutMs);
        }
        const onAbort = () => {
          worker?.postMessage({ kind: 'cancel', id });
          settle(id, p);
          reject(new RagRpcError('ABORTED', 'aborted by caller'));
        };
        if (opts.signal) {
          if (opts.signal.aborted) {
            onAbort();
            return;
          }
          opts.signal.addEventListener('abort', onAbort, { once: true });
        }
        worker?.postMessage({ id, method, payload }, opts.transfer);
      });
    },
    close(): void {
      for (const [id, p] of pending) {
        settle(id, p);
        p.reject(new RagRpcError('CRASHED', 'client closed'));
      }
      try {
        worker?.close?.();
      } catch {
        /* ignore */
      }
    },
  };
}
