/**
 * RAG worker RPC protocol (P1.2). Zod-validated envelopes; mirrors the
 * existing worker conventions (plain-object messages + transferables).
 * Main → worker: `{ id, method, payload }` requests and `{ kind: 'cancel', id }`.
 * Worker → main: `progress | result | error | cancelled` envelopes.
 */
import { z } from 'zod';

export const ReqSchema = z.object({
  id: z.string().min(1),
  method: z.string().min(1),
  payload: z.unknown().optional(),
});
export type Req = z.infer<typeof ReqSchema>;

export const CancelSchema = z.object({ kind: z.literal('cancel'), id: z.string().min(1) });

export const ProgressMsg = z.object({
  id: z.string(),
  kind: z.literal('progress'),
  pct: z.number(),
  note: z.string().optional(),
});
export const ResultMsg = z.object({
  id: z.string(),
  kind: z.literal('result'),
  payload: z.unknown().optional(),
});
export const ErrorMsg = z.object({
  id: z.string(),
  kind: z.literal('error'),
  code: z.string(),
  message: z.string(),
});
export const CancelledMsg = z.object({ id: z.string(), kind: z.literal('cancelled') });

export const MsgSchema = z.discriminatedUnion('kind', [
  ProgressMsg,
  ResultMsg,
  ErrorMsg,
  CancelledMsg,
]);
export type Msg = z.infer<typeof MsgSchema>;

/** Typed rejection reason for every non-happy path. */
export class RagRpcError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'RagRpcError';
    this.code = code;
  }
}

/**
 * Well-known symbol a handler may tag its RESULT with (P2.2) so `serveRpc`
 * posts it with a transfer list — zero-copy handoff for large buffers
 * (PCM windows). Symbols never survive structured clone, so this can
 * never collide with real payload data; the server strips it before
 * posting. Fully additive: handlers that return plain payloads are
 * unchanged (clone semantics).
 */
export const RPC_TRANSFER: unique symbol = Symbol('ragRpcTransfer');

/** Tag `payload` so `serveRpc` posts it with `transfer` (see RPC_TRANSFER). */
export function withTransfer<T extends object>(payload: T, transfer: Transferable[]): T {
  (payload as { [RPC_TRANSFER]?: Transferable[] })[RPC_TRANSFER] = transfer;
  return payload;
}
