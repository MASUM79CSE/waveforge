/**
 * P2.2 — feeder RPC handlers. Factory keeps pump state per ENDPOINT
 * (per worker instance), never per module — the real worker file and
 * tests each get a fresh instance from `createFeederHandlers()`.
 */
import type { RpcHandlers } from '../rpc/server';
import { withTransfer } from '../rpc/protocol';
import { FeederPump, type FeedResult } from './feeder';
import { FeederFeedSchema, FeederInitSchema } from './feederProtocol';

/** Minimal safeParse surface — keeps zod out of the type signature. */
interface Parser<T> {
  safeParse(v: unknown): { success: boolean; data?: T };
}

function parseOrThrow<T>(schema: Parser<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success || parsed.data === undefined) {
    throw Object.assign(new Error('feeder: bad payload'), { code: 'BAD_PAYLOAD' });
  }
  return parsed.data;
}

/** Tag the result so serveRpc transfers every window buffer. */
function toTransferred(r: FeedResult): FeedResult {
  const transfer: Transferable[] = [];
  for (const w of r.windows) {
    transfer.push(w.samples.buffer as ArrayBuffer);
  }
  return transfer.length > 0 ? withTransfer(r, transfer) : r;
}

export function createFeederHandlers(): RpcHandlers {
  let pump: FeederPump | null = null;
  const ensurePump = (): FeederPump => {
    if (!pump) throw Object.assign(new Error('feeder not initialized'), { code: 'NOT_INITIALIZED' });
    return pump;
  };

  return {
    // async on purpose: a synchronous throw inside serveRpc's dispatch
    // would bypass the .then rejection path and never reach the client
    'feeder.init': async (payload) => {
      const opts = parseOrThrow(FeederInitSchema, payload);
      pump = new FeederPump(opts);
      return { accepted: true, winLen: pump.winLen, hopLen: pump.hopLen, dstRate: pump.dstRate };
    },

    'feeder.feed': async (payload) => {
      const target = ensurePump();
      const { channels } = parseOrThrow(FeederFeedSchema, payload);
      return toTransferred(target.push(channels));
    },

    'feeder.finish': async () => {
      const target = ensurePump();
      return toTransferred(target.finish());
    },
  };
}
