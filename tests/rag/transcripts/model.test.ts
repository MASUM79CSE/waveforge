import { describe, expect, it } from 'vitest';
import {
  fnv1a,
  transcriptFingerprint,
  transcriptId,
  TranscriptRecordSchema,
  TranscriptSegmentSchema,
} from '../../../src/rag/transcripts/model';
import { makeRecord } from '../helpers/transcriptFixtures';

describe('P2.3 transcript model', () => {
  it('validates a well-formed record', () => {
    const r = makeRecord();
    expect(TranscriptRecordSchema.safeParse(r).success).toBe(true);
  });

  it('rejects a segment whose end precedes its start', () => {
    const r = makeRecord({ segments: [{ start: 3, end: 2, text: 'bad' }] });
    expect(TranscriptRecordSchema.safeParse(r).success).toBe(false);
  });

  it('rejects missing or wrong-typed fields', () => {
    expect(TranscriptRecordSchema.safeParse(makeRecord({ id: '' })).success).toBe(false);
    expect(TranscriptRecordSchema.safeParse(makeRecord({ createdAt: -1 })).success).toBe(false);
    expect(TranscriptRecordSchema.safeParse(makeRecord({ stale: 'no' as never })).success).toBe(false);
    expect(TranscriptRecordSchema.safeParse(makeRecord({ segments: [{ start: 0, end: 1 }] as never })).success).toBe(
      false,
    );
  });

  it('segment schema: non-negative times, text required', () => {
    expect(TranscriptSegmentSchema.safeParse({ start: 0, end: 0, text: '' }).success).toBe(true);
    expect(TranscriptSegmentSchema.safeParse({ start: -0.1, end: 0, text: '' }).success).toBe(false);
    expect(TranscriptSegmentSchema.safeParse({ start: 0, end: 1, text: 5 as never }).success).toBe(false);
  });

  it('fnv1a: deterministic, 8 hex chars, differs on input change', () => {
    expect(fnv1a('waveforge')).toBe(fnv1a('waveforge'));
    expect(fnv1a('waveforge')).toMatch(/^[0-9a-f]{8}$/);
    expect(fnv1a('waveforge')).not.toBe(fnv1a('waveforgf'));
    expect(fnv1a('')).toBe('811c9dc5'); // FNV offset basis
  });

  it('fingerprint changes when any component changes', () => {
    const base = { durationSec: 61.5, channels: 2, frames: 2_952_000, headSample: 0.01, tailSample: -0.33 };
    const fp = transcriptFingerprint(base);
    expect(fp).toMatch(/^[0-9a-f]{8}$/);
    for (const delta of [
      { ...base, durationSec: 61.6 },
      { ...base, channels: 1 },
      { ...base, frames: 2_952_001 },
      { ...base, headSample: 0.02 },
      { ...base, tailSample: -0.34 },
    ]) {
      expect(transcriptFingerprint(delta)).not.toBe(fp);
    }
  });

  it('fingerprint is f32-insensitive to f64-level noise but sensitive to real edits', () => {
    const base = { durationSec: 10, channels: 1, frames: 480_000, headSample: 0.1, tailSample: 0.2 };
    // same f32 value via a different f64 literal → same fingerprint
    expect(transcriptFingerprint({ ...base, headSample: 0.1 + 1e-12 })).toBe(transcriptFingerprint(base));
    // a genuine sample change → different
    expect(transcriptFingerprint({ ...base, headSample: 0.2 })).not.toBe(transcriptFingerprint(base));
  });

  it('transcriptId format: model@version/fingerprint', () => {
    expect(transcriptId('whisper-tiny', '1.0.0', 'abc')).toBe('whisper-tiny@1.0.0/abc');
  });
});
