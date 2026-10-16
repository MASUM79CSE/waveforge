/**
 * WF-010 — one authoritative format mapping. The catalog
 * (`exportFormats.ts`) must carry MIME + container + limitation data and
 * the service must honour it: correct result MIME for every format
 * (never `application/octet-stream`), quality ids validated against the
 * catalog (typed rejection, no silent fallbacks), and catalog invariants
 * (unique ext/qualities, default ∈ qualities, audio/* MIME).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EXPORT_FORMATS, formatInfo } from '../../../src/io/exportFormats';
import { runExport } from '../../../src/io/exportService';
import { WaveForgeError } from '../../../src/core/errors';

type Message = { data: unknown };

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: Message) => void) | null = null;
  onerror: ((event: { message?: string }) => void) | null = null;
  terminated = false;
  readonly sent: unknown[] = [];
  constructor() {
    FakeWorker.instances.push(this);
  }
  terminate(): void {
    this.terminated = true;
  }
  postMessage(msg: unknown): void {
    if (this.terminated) throw new Error('postMessage on terminated worker');
    this.sent.push(msg);
  }
  reply(msg: unknown): void {
    this.onmessage?.({ data: msg });
  }
}

function lastWorker(): FakeWorker {
  return FakeWorker.instances[FakeWorker.instances.length - 1]!;
}

function done(job: Parameters<typeof runExport>[0]): Promise<unknown> {
  const pending = runExport(job);
  lastWorker().reply({ type: 'done', data: new ArrayBuffer(16) });
  return pending;
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
});

describe('format catalog invariants (WF-010)', () => {
  it('covers exactly wav/mp3/flac with unique extensions and audio/* MIME', () => {
    expect(EXPORT_FORMATS.map((f) => f.id)).toEqual(['wav', 'mp3', 'flac']);
    const exts = EXPORT_FORMATS.map((f) => f.ext);
    expect(new Set(exts).size).toBe(exts.length);
    for (const f of EXPORT_FORMATS) {
      expect(f.mime).toMatch(/^audio\//);
      expect(f.container.length).toBeGreaterThan(3);
      expect(f.limitations.length).toBeGreaterThan(3);
    }
  });

  it('quality ids are unique and every defaultQuality is a listed id', () => {
    for (const f of EXPORT_FORMATS) {
      const ids = f.qualities.map((q) => q.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toContain(f.defaultQuality);
    }
    expect(formatInfo('wav').qualities.map((q) => q.id)).toEqual(['pcm16', 'pcm24', 'float32']);
    expect(formatInfo('mp3').qualities.map((q) => q.id)).toEqual(['128', '192', '256', '320']);
    expect(formatInfo('flac').qualities.map((q) => q.id)).toEqual(['0', '3', '5', '8']);
  });
});

describe('service honours the catalog (WF-010)', () => {
  it('result MIME comes from the catalog for every format (no octet-stream)', async () => {
    for (const f of EXPORT_FORMATS) {
      const result = (await done({
        channels: [new Float32Array([0, 0.5])],
        sampleRate: 44100,
        options: { format: f.id, quality: f.defaultQuality },
      })) as { mimeType: string };
      expect(result.mimeType).toBe(f.mime); // RED pre-fix: mp3/flac were octet-stream
    }
  });

  it('unknown quality is rejected with typed WF-E105 (no silent fallback)', async () => {
    for (const bad of [
      { format: 'mp3', quality: '999' },
      { format: 'wav', quality: 'pcm32' },
      { format: 'flac', quality: '24' },
      { format: 'flac', quality: '-1' },
    ] as const) {
      const pending = runExport({
        channels: [new Float32Array([0])],
        sampleRate: 44100,
        options: { format: bad.format, quality: bad.quality },
      });
      const assertion = expect(pending).rejects.toSatisfy((error: unknown) => {
        return error instanceof WaveForgeError && (error as WaveForgeError).code === 'WF-E105';
      });
      await vi.advanceTimersByTimeAsync(0);
      await assertion;
    }
  });

  it('every catalog quality passes validation and reaches its worker', async () => {
    for (const f of EXPORT_FORMATS) {
      for (const q of f.qualities) {
        const pending = done({
          channels: [new Float32Array([0, 0.5, -0.5])],
          sampleRate: 44100,
          options: { format: f.id, quality: q.id },
        });
        await pending;
        expect(FakeWorker.instances.length).toBeGreaterThan(0); // routed
        FakeWorker.instances = [];
      }
    }
  });
});
