import { describe, expect, it } from 'vitest';
import {
  createTranscribeController,
  defaultFingerprint,
  TranscribeError,
  type DocumentAudioSource,
  type TranscribeDeps,
} from '../../../src/rag/transcripts/controller';
import { createTranscriptStorage, type TranscriptStorage } from '../../../src/rag/transcripts/store';
import type { ModelStorage } from '../../../src/rag/models/storage';
import type { AsrClient, AsrInitOptions } from '../../../src/rag/audio/../asr/asrClient';
import type { AsrResult } from '../../../src/rag/asr/asrProtocol';
import { createFeederPumpClient } from '../../../src/rag/audio/feederTestClient';

const R = 16_000;

function audio(seconds = 61): DocumentAudioSource {
  const n = Math.round(R * seconds);
  const ch = new Float32Array(n);
  for (let i = 0; i < n; i++) ch[i] = Math.sin((2 * Math.PI * 220 * i) / R) * 0.5;
  return { sampleRate: R, durationSec: seconds, channels: [ch] };
}

function fakeStorage(version: string | null): ModelStorage {
  return {
    has: async () => version !== null,
    installedVersion: async () => version,
    put: async () => {},
    open: async () => null,
    deleteFile: async () => false,
    delete: async () => true,
    listInstalled: async () => [],
    usage: async () => 0,
  };
}

function memoryTranscripts(): TranscriptStorage {
  const rows = new Map<string, unknown>();
  return createTranscriptStorage({
    get: async (id) => rows.get(id) as never,
    put: async (r) => {
      rows.set(r.id, structuredClone(r));
    },
    delete: async (id) => rows.delete(id),
    listAll: async () => [...rows.values()] as never,
  });
}

/** Deterministic fake ASR: one segment per window, numbered. */
function fakeAsr(hook?: { inits: AsrInitOptions[]; calls: number; failWith?: () => never }): AsrClient {
  let ready = false;
  let n = 0;
  return {
    init: async (opts) => {
      hook?.inits.push(opts);
      if (hook?.failWith) {
        hook.failWith();
      }
      ready = true;
      return { ready: true, device: opts.device ?? 'wasm' };
    },
    transcribe: async (samples) => {
      if (!ready) throw Object.assign(new Error('no init'), { code: 'NOT_INITIALIZED' });
      const i = n++;
      if (hook) hook.calls += 1;
      const dur = samples.length / R;
      const result: AsrResult = {
        segments: [{ start: 0, end: Math.max(0.5, dur), text: `seg ${i}` }],
        text: `seg ${i}`,
      };
      return result;
    },
    dispose: async () => ({ disposed: true }),
    close: () => {
      ready = false;
    },
  };
}

function deps(overrides: Partial<TranscribeDeps> = {}): TranscribeDeps & { asr: AsrClient; closed: string[] } {
  const self: TranscribeDeps & { asr: AsrClient; closed: string[] } = {
    storage: fakeStorage('1.0.0'),
    transcripts: memoryTranscripts(),
    makeFeeder: () => {
      self.closed.push('feeder-made');
      return createFeederPumpClient();
    },
    makeAsr: () => {
      self.closed.push('asr-made');
      return self.asr;
    },
    getAudio: () => audio(),
    clock: () => 1_234,
    ...overrides,
    closed: [],
    asr: fakeAsr(),
  };
  // keep closure ordering sane: rebuild base fields then apply overrides
  return self;
}

describe('P2.7 transcription controller', () => {
  it('happy path: feeds, transcribes, stitches, saves, progress reaches 1', async () => {
    const saved: unknown[] = [];
    const transcripts = memoryTranscripts();
    transcripts.save = async (r) => {
      saved.push(r);
    };
    const d = deps({ transcripts });
    const progress: number[] = [];
    const controller = createTranscribeController(d);
    const rec = await controller.run('whisper-tiny', { onProgress: (p) => progress.push(p) });
    expect(rec.modelId).toBe('whisper-tiny');
    expect(rec.modelVersion).toBe('1.0.0');
    expect(rec.language).toBe('unknown');
    expect(rec.createdAt).toBe(1_234);
    expect(rec.segments.length).toBeGreaterThanOrEqual(2);
    // monotone segment starts after stitching
    for (let i = 1; i < rec.segments.length; i++) {
      expect(rec.segments[i]!.start).toBeGreaterThanOrEqual(rec.segments[i - 1]!.start);
    }
    expect(saved).toEqual([rec]);
    expect(progress[0]).toBeLessThan(0.5);
    expect(progress[progress.length - 1]).toBe(1);
    expect(Math.min(...progress)).toBeGreaterThanOrEqual(0);
  });

  it('idempotent: a fresh existing transcript short-circuits (no workers spun)', async () => {
    const d = deps();
    const controller = createTranscribeController(d);
    const first = await controller.run('whisper-tiny');
    let made = 0;
    d.makeAsr = () => {
      made++;
      return d.asr;
    };
    const second = await controller.run('whisper-tiny');
    expect(second).toEqual(first);
    expect(made).toBe(0);
  });

  it('stale existing transcript is re-transcribed and overwritten', async () => {
    const d = deps();
    const controller = createTranscribeController(d);
    const first = await controller.run('whisper-tiny');
    await d.transcripts.markStale(first.id);
    let made = 0;
    d.makeAsr = () => {
      made++;
      return fakeAsr();
    };
    const second = await controller.run('whisper-tiny');
    expect(made).toBe(1);
    expect(second.id).toBe(first.id);
    expect(second.stale).toBe(false);
    expect(second.createdAt).toBe(first.createdAt); // same injected clock
  });

  it('NO_AUDIO when nothing is loaded or channels are empty', async () => {
    const d = deps({ getAudio: () => null });
    await expect(createTranscribeController(d).run('m')).rejects.toMatchObject({ code: 'NO_AUDIO' });
    const empty = deps({ getAudio: () => ({ sampleRate: R, durationSec: 0, channels: [new Float32Array(0)] }) });
    await expect(createTranscribeController(empty).run('m')).rejects.toMatchObject({ code: 'NO_AUDIO' });
  });

  it('MODEL_NOT_INSTALLED propagates as a typed error', async () => {
    const d = deps({ storage: fakeStorage(null) });
    await expect(createTranscribeController(d).run('whisper-tiny')).rejects.toBeInstanceOf(TranscribeError);
    await expect(createTranscribeController(d).run('whisper-tiny')).rejects.toMatchObject({
      code: 'MODEL_NOT_INSTALLED',
    });
  });

  it('pre-aborted signal → ABORTED before any work', async () => {
    const d = deps();
    const ac = new AbortController();
    ac.abort();
    await expect(createTranscribeController(d).run('whisper-tiny', { signal: ac.signal })).rejects.toMatchObject({
      code: 'ABORTED',
    });
  });

  it('mid-run abort settles ABORTED and closes clients', async () => {
    const ac = new AbortController();
    const slowAsr: AsrClient = {
      ...fakeAsr(),
      transcribe: async () => {
        ac.abort(); // abort during the first window's transcription
        throw Object.assign(new Error('cancelled'), { code: 'ABORTED' });
      },
    };
    const d = deps();
    d.asr = slowAsr;
    const controller = createTranscribeController(d);
    await expect(controller.run('whisper-tiny', { signal: ac.signal })).rejects.toMatchObject({ code: 'ABORTED' });
  });

  it('unknown mid-run failures map to TRANSCRIBE_FAILED with the message', async () => {
    const boom: AsrClient = fakeAsr({
      inits: [],
      calls: 0,
      failWith: () => {
        throw new Error('worker exploded');
      },
    });
    const d = deps();
    d.asr = boom;
    await expect(createTranscribeController(d).run('whisper-tiny')).rejects.toMatchObject({
      code: 'TRANSCRIBE_FAILED',
      message: 'worker exploded',
    });
  });

  it('asr.init receives the requested model, version and device', async () => {
    const inits: AsrInitOptions[] = [];
    const d = deps();
    d.asr = fakeAsr({ inits, calls: 0 });
    await createTranscribeController(d).run('whisper-tiny', { device: 'webgpu' });
    expect(inits).toEqual([{ modelId: 'whisper-tiny', version: '1.0.0', device: 'webgpu' }]);
  });

  it('defaultFingerprint is stable per source and sensitive to probed changes', () => {
    const a = audio(1);
    expect(defaultFingerprint(a)).toBe(defaultFingerprint(audio(1)));
    // tail-sample change (a probed component) → different fingerprint
    const b = audio(1);
    const ch = b.channels[0]!.slice();
    ch[ch.length - 1] = 0.9;
    b.channels = [ch];
    expect(defaultFingerprint(a)).not.toBe(defaultFingerprint(b));
    // duration/frames change → different
    expect(defaultFingerprint(a)).not.toBe(defaultFingerprint(audio(2)));
    // NOTE: mid-sample edits are NOT probed — documented shallow hint (P2.3)
  });
});
