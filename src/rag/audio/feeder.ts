/**
 * P2.2 — audio feeder (pure kernel). Consumes decoded channel blocks,
 * mixes to mono, streams to 16 kHz through the P2.1 resampler, and
 * slices ordered analysis windows (30 s + 1 s overlap) for the ASR
 * worker. Zero browser APIs: the RPC worker (feeder.worker.ts) is a
 * thin shell around this class, and window buffers are handed back as
 * fresh copies so they can be transferred (detached) losslessly.
 *
 * Window contract (consumed by P2.6 stitching): window k starts at
 * output sample k·hop, `hop = winLen − overlap`, except the final
 * window which runs to end-of-input (may be shorter than winLen and,
 * when the remainder is ≤ overlap, carries only repeated context).
 * Memory: the hold buffer never exceeds one window + the pending
 * block — the full 16 kHz PCM is never materialized.
 */
import { mixToMono, Resampler, WHISPER_RATE } from './resample';

export interface FeedWindow {
  /** 0-based window number, in emission order. */
  index: number;
  /** Window start in seconds on the 16 kHz timeline. */
  t0: number;
  /** Window PCM at dstRate; fresh buffer, safe to transfer. */
  samples: Float32Array;
}

export interface FeedResult {
  windows: FeedWindow[];
  /** Input frames consumed / declared total, monotonic, 1 exactly when done. */
  progress: number;
  done: boolean;
}

export interface FeederOptions {
  srcRate: number;
  /** Declared input frame count (drives progress). */
  totalFrames: number;
  dstRate?: number;
  windowSec?: number;
  overlapSec?: number;
}

export class FeederPump {
  readonly dstRate: number;
  readonly winLen: number;
  readonly hopLen: number;

  private readonly resampler: Resampler;
  private readonly totalFrames: number;
  private hold: Float32Array = new Float32Array(0);
  /** Absolute output index of hold[0]. */
  private holdBase = 0;
  private nextWinStart = 0;
  private winIndex = 0;
  private consumed = 0;
  private finished = false;

  constructor(opts: FeederOptions) {
    const { srcRate, totalFrames } = opts;
    const dstRate = opts.dstRate ?? WHISPER_RATE;
    const windowSec = opts.windowSec ?? 30;
    const overlapSec = opts.overlapSec ?? 1;
    if (!(srcRate > 0) || !(dstRate > 0)) throw new Error('feeder: rates must be > 0');
    if (!Number.isInteger(totalFrames) || totalFrames < 0) {
      throw new Error('feeder: totalFrames must be a non-negative integer');
    }
    if (!(windowSec > 0)) throw new Error('feeder: windowSec must be > 0');
    if (overlapSec < 0 || overlapSec >= windowSec) {
      throw new Error('feeder: overlapSec must be in [0, windowSec)');
    }
    this.dstRate = dstRate;
    this.winLen = Math.round(windowSec * dstRate);
    this.hopLen = Math.round((windowSec - overlapSec) * dstRate);
    this.totalFrames = totalFrames;
    this.resampler = new Resampler(srcRate, dstRate);
  }

  /** Feed one block of decoded channels (equal lengths); returns ready windows. */
  push(channels: readonly Float32Array[]): FeedResult {
    if (this.finished) throw new Error('feeder: push after finish');
    const first = channels[0];
    if (!first) throw new Error('feeder: empty channel list');
    for (const ch of channels) {
      if (ch.length !== first.length) throw new Error('feeder: channel length mismatch');
    }
    this.consumed += first.length;
    const mono = channels.length === 1 ? first : mixToMono(channels);
    return this.ingest(this.resampler.push(mono), false);
  }

  /** End of input; flushes the resampler and emits the final window. */
  finish(): FeedResult {
    if (this.finished) throw new Error('feeder: finish called twice');
    this.finished = true;
    return this.ingest(this.resampler.flush(), true);
  }

  private progress(done: boolean): number {
    if (done) return 1;
    if (this.totalFrames === 0) return 0;
    // clamp below 1 — only finish() completes the job
    return Math.min(0.999, this.consumed / this.totalFrames);
  }

  private ingest(out: Float32Array, done: boolean): FeedResult {
    if (out.length > 0) {
      const merged = new Float32Array(this.hold.length + out.length);
      merged.set(this.hold, 0);
      merged.set(out, this.hold.length);
      this.hold = merged;
    }

    const windows: FeedWindow[] = [];
    const rel = (abs: number) => abs - this.holdBase;
    const emit = (start: number, len: number) => {
      windows.push({
        index: this.winIndex++,
        t0: start / this.dstRate,
        samples: this.hold.slice(rel(start), rel(start) + len),
      });
    };

    while (this.nextWinStart + this.winLen <= this.holdBase + this.hold.length) {
      emit(this.nextWinStart, this.winLen);
      this.nextWinStart += this.hopLen;
    }
    if (done && this.nextWinStart < this.holdBase + this.hold.length) {
      emit(this.nextWinStart, this.holdBase + this.hold.length - this.nextWinStart);
      this.nextWinStart += this.hopLen;
    }

    // drop everything before the next window's start
    const drop = this.nextWinStart - this.holdBase;
    if (drop > 0) {
      this.hold = this.hold.slice(drop);
      this.holdBase += drop;
    }

    return { windows, progress: this.progress(done), done };
  }
}
