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
