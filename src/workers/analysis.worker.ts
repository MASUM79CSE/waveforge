/**
 * Analysis worker (M5): zod-validated requests over the standard
 * {cmd,id}/reply protocol. Two commands:
 *  - detect-bpm  → onset envelope + autocorrelation tempo (ADR 007)
 *  - measure-lufs → BS.1770-4 integrated/momentary/short-term
 * Every reply carries kernel timings — the §10 M5 profiling gate reads them.
 */
import { z } from 'zod';
import { detectTempo, onsetEnvelope } from '../engine/bpm';
import { integrateLoudness, momentaryTrack } from '../engine/lufs';

const requestSchema = z.discriminatedUnion('cmd', [
  z.object({
    cmd: z.literal('detect-bpm'),
    id: z.number(),
    sampleRate: z.number().int().positive(),
    left: z.instanceof(Float32Array),
    right: z.instanceof(Float32Array).optional(),
  }),
  z.object({
    cmd: z.literal('measure-lufs'),
    id: z.number(),
    sampleRate: z.number().int().positive(),
    left: z.instanceof(Float32Array),
    right: z.instanceof(Float32Array).optional(),
  }),
]);

const post = self.postMessage.bind(self) as (message: unknown, transfer?: Transferable[]) => void;

self.onmessage = (event: MessageEvent) => {
  const parsed = requestSchema.safeParse(event.data);
  if (!parsed.success) {
    post({ type: 'error', id: null, detail: 'invalid request' });
    return;
  }
  const msg = parsed.data;
  const channels =
    msg.right instanceof Float32Array ? [msg.left, msg.right] : [msg.left];

  if (msg.cmd === 'detect-bpm') {
    const t0 = performance.now();
    const { envelope, frameSeconds } = onsetEnvelope(channels, msg.sampleRate);
    const onsetMs = performance.now() - t0;
    const t1 = performance.now();
    const tempo = detectTempo(envelope, msg.sampleRate);
    const detectMs = performance.now() - t1;
    post({
      type: 'bpm',
      id: msg.id,
      bpm: tempo.bpm,
      beats: tempo.beats, // seconds
      confidence: tempo.confidence,
      frameSeconds,
      profile: { onsetMs: Math.round(onsetMs), detectMs: Math.round(detectMs) },
    });
    return;
  }

  const t0 = performance.now();
  const result = integrateLoudness(channels, msg.sampleRate);
  const track = momentaryTrack(channels, msg.sampleRate);
  const lufsMs = performance.now() - t0;
  post({
    type: 'lufs',
    id: msg.id,
    integrated: result.integrated,
    momentaryMax: result.momentaryMax,
    shortTermMax: result.shortTermMax,
    momentaryBlocks: track.length,
    profile: { lufsMs: Math.round(lufsMs) },
  });
};
