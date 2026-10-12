/// <reference lib="webworker" />
/**
 * P2.2 — feeder worker: a thin RPC shell around the pure FeederPump
 * (handlers in feederHandlers.ts). The job controller (P2.7) owns the
 * worker lifecycle; window buffers ride the result transfer list.
 */
import { serveRpc, workerEndpoint } from '../rpc/server';
import { createFeederHandlers } from './feederHandlers';

/** Dedicated-worker surface (the app tsconfig is DOM-lib). */
interface WorkerScope {
  onmessage: ((ev: { data: unknown }) => void) | null;
  postMessage: (data: unknown, transfer?: Transferable[]) => void;
}
const sw = self as unknown as WorkerScope;

serveRpc(workerEndpoint(sw), createFeederHandlers());
