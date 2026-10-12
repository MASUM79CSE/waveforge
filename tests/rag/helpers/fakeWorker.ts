/**
 * In-memory fake Worker for RPC unit tests — no real Worker, no timers.
 * Direction-aware: `postMessage` is the client→worker direction (routed to
 * the served endpoint via `listen`), `postFromWorker` is worker→client.
 */
export interface FakeMessage {
  data: unknown;
  transfer?: Transferable[];
}

export class FakeWorker {
  /** Client-side handler (what createRpcClient attaches to). */
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: { message?: string; error?: Error }) => void) | null = null;
  onmessageerror: ((ev?: unknown) => void) | null = null;

  /** Everything the client posted (data + transfer), in order. */
  readonly sent: FakeMessage[] = [];

  /** Everything the worker side posted back (data + transfer), in order. */
  readonly fromWorker: FakeMessage[] = [];

  /** Server-side request handler (installed by serveRpc's listen()). */
  serverOnMessage: ((ev: { data: unknown }) => void) | null = null;

  closed = false;

  /** RpcEndpoint.listen — receive main→worker messages. */
  listen(handler: (ev: { data: unknown }) => void): void {
    this.serverOnMessage = handler;
  }

  /** RpcEndpoint.post — worker→main direction. */
  post(data: unknown, transfer?: Transferable[]): void {
    this.fromWorker.push({ data, transfer });
    queueMicrotask(() => this.onmessage?.({ data }));
  }

  /** Real-Worker-API surface used by createRpcClient. */
  postMessage(data: unknown, transfer?: Transferable[]): void {
    this.sent.push({ data, transfer });
    const h = this.serverOnMessage;
    if (!h) return;
    queueMicrotask(() => h({ data }));
  }

  /** Test helper: simulate a malformed message arriving on the client. */
  emitMalformedFromWorker(): void {
    this.onmessageerror?.({});
  }

  /** Test helper: simulate a worker crash. */
  crash(message = 'worker crashed'): void {
    this.onerror?.({ message });
  }

  close(): void {
    this.closed = true;
  }
}
