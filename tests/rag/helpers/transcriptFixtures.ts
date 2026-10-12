/** P2.3 — shared transcript fixture. */
import type { TranscriptRecord } from '../../../src/rag/transcripts/model';

export function makeRecord(overrides: Partial<TranscriptRecord> = {}): TranscriptRecord {
  return {
    id: 'whisper-tiny@1.0.0/abc12345',
    modelId: 'whisper-tiny',
    modelVersion: '1.0.0',
    fingerprint: 'abc12345',
    language: 'en',
    segments: [
      { start: 0, end: 2.5, text: 'hello world' },
      { start: 2.5, end: 5.01, text: 'second segment' },
    ],
    createdAt: 1_700_000_000_000,
    stale: false,
    ...overrides,
  };
}
