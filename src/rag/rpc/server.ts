/**
 * RPC server (P1.2) — worker-side dispatcher. Validates requests, wraps
 * handlers with a cancel context (`AbortSignal` + `progress()`), converts
 * AbortError rejections into `cancelled` envelopes, other throws into
 * `error` envelopes. Malformed requests are dropped (strict rejection).
 */
import { CancelSchema, ReqSchema } from './protocol';

export interface HandlerCtx {
  signal: AbortSignal;
  progress: (pct: number, note?: string) => void;
}

export type RpcHandlers = Record<string, (payload: unknown, ctx: HandlerCtx) => Promise<unknown>>;

/** Direction-aware endpoint: requests arrive via listen(), replies leave via post(). */
export interface RpcEndpoint {
  listen(handler: (ev: { data: unknown }) => void): void;
  post: (data: unknown, transfer?: Transferable[]) => void;
}

/** Adapter for a real dedicated worker (call inside the worker file). */
export function workerEndpoint(w: {
  onmessage: ((ev: { data: unknown }) => void) | null;
  postMessage: (data: unknown, transfer?: Transferable[]) => void;
}): RpcEndpoint {
  return {
    listen: (h) => {
      w.onmessage = h;
    },
    post: (data, transfer) => w.postMessage(data, transfer),
  };
}

export function serveRpc(endpoint: RpcEndpoint, handlers: RpcHandlers): void {
  const cancels = new Map<string, AbortController>();

  endpoint.listen((ev: { data: unknown }) => {
    const raw = ev.data as Record<string, unknown> | null;
    if (raw && raw['kind'] === 'cancel') {
      const c = CancelSchema.safeParse(raw);
      if (c.success) {
        cancels.get(c.data.id)?.abort();
        cancels.delete(c.data.id);
      }
      return;
    }
    const req = ReqSchema.safeParse(raw);
    if (!req.success) return; // malformed request: dropped by design
    const { id, method, payload } = req.data;
    const handler = handlers[method];
    if (!handler) {
      endpoint.post({ id, kind: 'error', code: 'METHOD_NOT_FOUND', message: `no handler for ${method}` });
      return;
    }
    const ac = new AbortController();
    cancels.set(id, ac);
    const ctx: HandlerCtx = {
      signal: ac.signal,
      progress: (pct, note) => {
        const msg =
          note === undefined ? { id, kind: 'progress', pct } : { id, kind: 'progress', pct, note };
        endpoint.post(msg);
      },
    };
    handler(payload, ctx).then(
      (result) => {
        cancels.delete(id);
        endpoint.post({ id, kind: 'result', payload: result });
      },
      (err: unknown) => {
        cancels.delete(id);
        const aborted =
          ac.signal.aborted ||
          (err instanceof DOMException && err.name === 'AbortError') ||
          (err instanceof Error && err.name === 'AbortError');
        if (aborted) {
          endpoint.post({ id, kind: 'cancelled' });
        } else {
          const code = (err as { code?: string })?.code ?? 'HANDLER_ERROR';
          const message = err instanceof Error ? err.message : String(err);
          endpoint.post({ id, kind: 'error', code, message });
        }
      },
    );
  });
}
