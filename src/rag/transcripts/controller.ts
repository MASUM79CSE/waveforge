/**
 * P2.7 — transcription job controller. Orchestrates feeder → ASR →
 * stitcher → transcript store with typed errors and abort semantics:
 * **cancel = cancel + re-run** (no partial resume — a cancelled run
 * leaves no partial transcript; the next run starts over; documented).
 *
 * All worker/IO boundaries are injected (`TranscribeDeps`): unit tests
 * drive it with in-memory clients (the real FeederPump inside a fake
 * client), the runtime wires real workers. The idempotency contract:
 * a fresh (non-stale) transcript for the same model+fingerprint is
 * returned without spinning any worker; a stale one is re-transcribed.
 */
import type { CallOptions } from '../rpc/client';
import type { FeederClient } from '../audio/feederClient';
import type { AsrClient } from '../asr/asrClient';
import { stitchWindows, type WindowSegments } from '../asr/stitch';
import type { ModelStorage } from '../models/storage';
import { transcriptFingerprint, transcriptId, type TranscriptRecord } from './model';
import type { TranscriptStorage } from './store';

export interface DocumentAudioSource {
  sampleRate: number;
  durationSec: number;
  /** Equal-length channel buffers (document order). */
  channels: readonly Float32Array[];
}

export type TranscribeErrorCode = 'NO_AUDIO' | 'MODEL_NOT_INSTALLED' | 'ABORTED' | 'TRANSCRIBE_FAILED';

export class TranscribeError extends Error {
  readonly code: TranscribeErrorCode;
  constructor(code: TranscribeErrorCode, message: string) {
    super(message);
    this.name = 'TranscribeError';
    this.code = code;
  }
}

export interface TranscribeDeps {
  storage: ModelStorage;
  transcripts: TranscriptStorage;
  makeFeeder: () => FeederClient;
  makeAsr: () => AsrClient;
  /** Current document audio, or null when nothing is loaded. */
  getAudio: () => DocumentAudioSource | null;
  /** Epoch-ms clock for `createdAt` (injectable for tests). */
  clock: () => number;
}

export interface RunOptions {
  signal?: AbortSignal;
  onProgress?: (pct: number) => void;
  device?: 'wasm' | 'webgpu';
}

/** Feed phase weight in overall progress (rest = ASR windows). */
const FEED_WEIGHT = 0.3;
const ASR_WEIGHT = 0.7;
/** Channel frames fed per feeder RPC call. */
const BLOCK_FRAMES = 1 << 16;

/** Staleness fingerprint of the whole document mixdown (P2.3 hint). */
export function defaultFingerprint(src: DocumentAudioSource): string {
  const ch0 = src.channels[0]!;
  return transcriptFingerprint({
    durationSec: src.durationSec,
    channels: src.channels.length,
    frames: ch0.length,
    headSample: ch0[0] ?? 0,
    tailSample: ch0[ch0.length - 1] ?? 0,
  });
}

function codeOf(err: unknown): string | undefined {
  return (err as { code?: string } | null)?.code;
}

export function createTranscribeController(deps: TranscribeDeps) {
  return {
    async run(modelId: string, opts: RunOptions = {}): Promise<TranscriptRecord> {
      const { signal, onProgress, device = 'wasm' } = opts;
      if (signal?.aborted) throw new TranscribeError('ABORTED', 'aborted before start');
      const audio = deps.getAudio();
      const frames = audio?.channels[0]?.length ?? 0;
      if (!audio || audio.channels.length === 0 || frames === 0) {
        throw new TranscribeError('NO_AUDIO', 'no document audio to transcribe');
      }
      const version = await deps.storage.installedVersion(modelId);
      if (!version) {
        throw new TranscribeError('MODEL_NOT_INSTALLED', `model ${modelId} is not installed — request it first`);
      }
      const fingerprint = defaultFingerprint(audio);
      const id = transcriptId(modelId, version, fingerprint);
      const existing = await deps.transcripts.get(id);
      if (existing && !existing.stale) {
        onProgress?.(1); // idempotent: nothing to do
        return existing;
      }

      const feeder = deps.makeFeeder();
      const asr = deps.makeAsr();
      try {
        const finit = await feeder.init({ srcRate: audio.sampleRate, totalFrames: frames }, { signal } as CallOptions);
        await asr.init({ modelId, version, device }, { signal } as CallOptions);
        const outFrames = Math.ceil((frames * finit.dstRate) / audio.sampleRate);
        const expected = Math.max(1, Math.ceil(outFrames / finit.hopLen));
        const windows: WindowSegments[] = [];
        let asrDone = 0;
        const report = (feedPct: number) => {
          const p = Math.min(0.999, FEED_WEIGHT * feedPct + ASR_WEIGHT * (asrDone / expected));
          onProgress?.(p);
        };
        report(0);

        const drain = async (res: { windows: Array<{ t0: number; samples: Float32Array }> }, feedPct: number) => {
          for (const w of res.windows) {
            const r = await asr.transcribe(w.samples, { signal } as CallOptions);
            windows.push({ t0Sec: w.t0, segments: r.segments });
            asrDone += 1;
            report(feedPct);
          }
        };

        for (let off = 0; off < frames; off += BLOCK_FRAMES) {
          const end = Math.min(frames, off + BLOCK_FRAMES);
          const blocks = audio.channels.map((ch) => ch.slice(off, end));
          const res = await feeder.feed(blocks, { signal } as CallOptions);
          await drain(res, res.progress);
        }
        await drain(await feeder.finish({ signal } as CallOptions), 1);

        const record: TranscriptRecord = {
          id,
          modelId,
          modelVersion: version,
          fingerprint,
          language: 'unknown', // language id arrives with real Whisper output (P2.10)
          segments: stitchWindows(windows),
          createdAt: deps.clock(),
          stale: false,
        };
        await deps.transcripts.save(record);
        onProgress?.(1);
        return record;
      } catch (err) {
        if (signal?.aborted || codeOf(err) === 'ABORTED') {
          throw new TranscribeError('ABORTED', 'transcription cancelled');
        }
        if (err instanceof TranscribeError) throw err;
        if (codeOf(err) === 'MODEL_NOT_INSTALLED') {
          throw new TranscribeError('MODEL_NOT_INSTALLED', (err as Error).message);
        }
        throw new TranscribeError('TRANSCRIBE_FAILED', (err as Error)?.message ?? 'transcription failed');
      } finally {
        // cancel + re-run: close both workers; a cancelled run leaves no
        // partial state (windows were in-memory, record saved only on success)
        feeder.close();
        asr.close();
      }
    },
  };
}

export type TranscribeController = ReturnType<typeof createTranscribeController>;
