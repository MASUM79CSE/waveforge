/**
 * P2.7 — in-memory FeederClient over the pure FeederPump. Same contract
 * as the worker-backed client (no transfers needed — same heap), used
 * by the e2e fake-ASR mode and controller unit tests.
 */
import { FeederPump, type FeederOptions, type FeedResult } from './feeder';
import type { FeederClient } from './feederClient';

export function createFeederPumpClient(): FeederClient {
  let pump: FeederPump | null = null;
  return {
    init: async (opts: FeederOptions) => {
      pump = new FeederPump(opts);
      return { accepted: true, winLen: pump.winLen, hopLen: pump.hopLen, dstRate: pump.dstRate };
    },
    feed: async (channels: Float32Array[]): Promise<FeedResult> => {
      if (!pump) throw Object.assign(new Error('feeder not initialized'), { code: 'NOT_INITIALIZED' });
      return pump.push(channels);
    },
    finish: async () => {
      if (!pump) throw Object.assign(new Error('feeder not initialized'), { code: 'NOT_INITIALIZED' });
      return pump.finish();
    },
    close: () => {
      pump = null;
    },
  };
}
