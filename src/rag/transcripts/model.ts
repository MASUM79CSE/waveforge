/**
 * P2.3 — transcript data model (zod). A transcript is keyed by the
 * model that produced it AND an audio fingerprint of the transcribed
 * source; `stale` is a UI-visible hint that the audio changed after
 * transcription. Segments are model-time seconds on the 16 kHz
 * timeline (the timeline mapper, P2.4, maps them into the document).
 */
import { z } from 'zod';

export const TranscriptSegmentSchema = z
  .object({
    /** Segment start in seconds (model/16 kHz timeline). */
    start: z.number().nonnegative(),
    /** Segment end in seconds; ≥ start. */
    end: z.number().nonnegative(),
    /** Recognized text — UNTRUSTED data, always rendered as text. */
    text: z.string(),
  })
  .refine((s) => s.end >= s.start, { message: 'segment end before start' });

export const TranscriptRecordSchema = z.object({
  /** `${modelId}@${modelVersion}/${fingerprint}` — see transcriptId(). */
  id: z.string().min(1),
  modelId: z.string().min(1),
  modelVersion: z.string().min(1),
  fingerprint: z.string().min(1),
  /** BCP-47-ish tag as reported by the model, 'unknown' when unsure. */
  language: z.string().min(1),
  segments: z.array(TranscriptSegmentSchema),
  /** Epoch ms at transcription time. */
  createdAt: z.number().int().nonnegative(),
  /** Staleness hint: audio changed after this transcript was made. */
  stale: z.boolean(),
});
export type TranscriptRecord = z.infer<typeof TranscriptRecordSchema>;
export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;

/** FNV-1a 32-bit → 8 hex chars. NOT cryptographic — staleness hint only. */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export interface FingerprintInput {
  /** Source duration in seconds (float). */
  durationSec: number;
  channels: number;
  /** Frame count of the (mono) source fed to the resampler. */
  frames: number;
  /** f32 value of the first non-silent-ish sample (head probe). */
  headSample: number;
  /** f32 value of the last sample (tail probe). */
  tailSample: number;
}

/**
 * Audio fingerprint of the transcribed source. Deliberately shallow
 * (duration + shape + two probes): a *change hint*, not integrity —
 * cuts that preserve duration and probes may go unnoticed, and the
 * timeline mapper re-checks bounds anyway. Documented trade-off (P2.3).
 */
export function transcriptFingerprint(i: FingerprintInput): string {
  const parts = [
    i.durationSec.toFixed(3),
    String(i.channels),
    String(i.frames),
    String(Math.fround(i.headSample)),
    String(Math.fround(i.tailSample)),
  ];
  return fnv1a(parts.join('|'));
}

export function transcriptId(modelId: string, modelVersion: string, fingerprint: string): string {
  return `${modelId}@${modelVersion}/${fingerprint}`;
}
