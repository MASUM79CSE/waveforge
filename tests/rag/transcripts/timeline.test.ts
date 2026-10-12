import { describe, expect, it } from 'vitest';
import {
  activeSegmentAt,
  documentToModelTime,
  mapSegments,
  modelToDocumentTime,
  type TimelinePlacement,
} from '../../../src/rag/transcripts/timeline';
import type { TranscriptSegment } from '../../../src/rag/transcripts/model';

const P: TimelinePlacement = { offsetSec: 12, documentDurationSec: 100 };

/** Deterministic pseudo-random segments (property-style inputs). */
function randomSegments(n: number, span = 30): TranscriptSegment[] {
  let s = 0x2545f491;
  const rnd = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
  const out: TranscriptSegment[] = [];
  for (let i = 0; i < n; i++) {
    const start = rnd() * span;
    out.push({ start, end: start + rnd() * 3, text: `seg ${i}` });
  }
  return out;
}

describe('P2.4 timeline mapper', () => {
  it('point mapping is offset + clamp to [0, documentDuration]', () => {
    expect(modelToDocumentTime(0, P)).toBe(12);
    expect(modelToDocumentTime(5, P)).toBe(17);
    // negative model time only reaches 0 when the offset itself is negative
    expect(modelToDocumentTime(-3, P)).toBe(9);
    expect(modelToDocumentTime(-3, { offsetSec: -5, documentDurationSec: 100 })).toBe(0);
    // clamp high: beyond the document edge
    expect(modelToDocumentTime(200, P)).toBe(100);
  });

  it('documentToModelTime inverts the unclamped forward map (round-trip)', () => {
    for (let t = 0; t <= 80; t += 7) {
      expect(documentToModelTime(modelToDocumentTime(t, P), P)).toBeCloseTo(t, 10);
    }
    // clamped region does NOT round-trip (documented)
    expect(modelToDocumentTime(200, P)).toBe(100);
    expect(documentToModelTime(100, P)).not.toBeCloseTo(200, 6);
  });

  it('mapSegments output starts are non-decreasing even for shuffled input', () => {
    const segs = randomSegments(200);
    const mapped = mapSegments(segs, P);
    expect(mapped.length).toBe(segs.length);
    for (let i = 1; i < mapped.length; i++) {
      expect(mapped[i]!.start).toBeGreaterThanOrEqual(mapped[i - 1]!.start!);
    }
  });

  it('mapSegments preserves text pairing (sorted by start)', () => {
    const segs: TranscriptSegment[] = [
      { start: 5, end: 6, text: 'later' },
      { start: 1, end: 2, text: 'earlier' },
    ];
    const mapped = mapSegments(segs, P);
    expect(mapped[0]!.text).toBe('earlier');
    expect(mapped[0]!.start).toBe(13);
    expect(mapped[1]!.text).toBe('later');
  });

  it('segments beyond the document clamp to the edge without vanishing', () => {
    const segs: TranscriptSegment[] = [{ start: 95, end: 99, text: 'tail' }];
    const [tail] = mapSegments(segs, { offsetSec: 12, documentDurationSec: 15 });
    expect(tail!.start).toBe(15);
    expect(tail!.end).toBe(15);
    expect(tail!.text).toBe('tail');
  });

  it('offset 0 + huge duration is the identity map', () => {
    const p: TimelinePlacement = { offsetSec: 0, documentDurationSec: 1e9 };
    const segs = randomSegments(100, 3600);
    const mapped = mapSegments(segs, p);
    const first = mapped[0]!;
    const src = segs.find((s) => s.text === first.text)!;
    expect(first).toEqual({ start: src.start, end: src.end, text: src.text });
  });

  it('empty input maps to empty output', () => {
    expect(mapSegments([], P)).toEqual([]);
  });

  it('activeSegmentAt finds the containing segment; null outside', () => {
    const mapped = mapSegments(
      [
        { start: 0, end: 2, text: 'a' },
        { start: 3, end: 5, text: 'b' },
      ],
      P,
    );
    expect(activeSegmentAt(mapped, 12.5)?.text).toBe('a');
    expect(activeSegmentAt(mapped, 16)?.text).toBe('b');
    expect(activeSegmentAt(mapped, 14)).toBeNull(); // gap
    expect(activeSegmentAt(mapped, 5)).toBeNull(); // before offset
  });
});
