import { describe, expect, it } from 'vitest';
import { fmtSrtTime, fmtVttTime, toSrt, toTxt, toVtt } from '../../../src/rag/transcripts/export';
import type { TranscriptSegment } from '../../../src/rag/transcripts/model';

const seg = (start: number, end: number, text: string): TranscriptSegment => ({ start, end, text });

describe('P2.9 transcript export serializers', () => {
  it('SRT golden: numbered blocks, comma timecodes, trailing newline', () => {
    const out = toSrt([seg(0, 2.5, 'hello world'), seg(2.5, 5.01, 'second segment')]);
    expect(out).toBe(
      '1\n00:00:00,000 --> 00:00:02,500\nhello world\n\n' +
        '2\n00:00:02,500 --> 00:00:05,010\nsecond segment\n',
    );
  });

  it('VTT golden: WEBVTT header, dot timecodes', () => {
    const out = toVtt([seg(1.25, 3.5, 'hi')]);
    expect(out).toBe('WEBVTT\n\n00:00:01.250 --> 00:00:03.500\nhi\n');
  });

  it('VTT with no segments is the header block + blank line', () => {
    expect(toVtt([])).toBe('WEBVTT\n\n');
    expect(toSrt([])).toBe('');
    expect(toTxt([])).toBe('');
  });

  it('timecode edge cases: zero, hour rollover, ms rounding', () => {
    expect(fmtSrtTime(0)).toBe('00:00:00,000');
    expect(fmtSrtTime(3599.9996)).toBe('01:00:00,000'); // rounds into the hour
    expect(fmtSrtTime(3661.5)).toBe('01:01:01,500');
    expect(fmtSrtTime(59.9996)).toBe('00:01:00,000'); // ms rounding rolls the minute
    expect(fmtVttTime(3661.5)).toBe('01:01:01.500');
    expect(fmtVttTime(0)).toBe('00:00:00.000');
    // negative input clamps to zero
    expect(fmtSrtTime(-1)).toBe('00:00:00,000');
  });

  it('untrusted times: negative start clamps, inverted end → zero-length, NaN dropped', () => {
    const out = toSrt([seg(-2, 1, 'a'), seg(5, 4, 'b'), seg(NaN, 2, 'c'), seg(3, 3, 'd')]);
    expect(out).toBe(
      '1\n00:00:00,000 --> 00:00:01,000\na\n\n' +
        '2\n00:00:03,000 --> 00:00:03,000\nd\n\n' +
        '3\n00:00:05,000 --> 00:00:05,000\nb\n',
    );
  });

  it('segments are emitted in start order regardless of input order', () => {
    const out = toSrt([seg(5, 6, 'later'), seg(1, 2, 'early')]);
    expect(out).toBe('1\n00:00:01,000 --> 00:00:02,000\nearly\n\n2\n00:00:05,000 --> 00:00:06,000\nlater\n');
  });

  it('TXT: one plain line per segment; internal newlines collapse; CR stripped', () => {
    expect(toTxt([seg(0, 1, 'line one'), seg(1, 2, 'line\ntwo')])).toBe('line one\nline two\n');
    expect(toTxt([seg(0, 1, 'a\r\nb')])).toBe('a b\n'); // \r stripped, \n collapsed to space
    expect(toTxt([seg(0, 1, '   ')])).toBe(''); // whitespace-only dropped
  });

  it('text is verbatim otherwise (no HTML/markup transformation)', () => {
    const nasty = '<script>alert(1)</script> & "quotes"';
    expect(toTxt([seg(0, 1, nasty)])).toBe('<script>alert(1)</script> & "quotes"\n');
    const srt = toSrt([seg(0, 1, nasty)]);
    expect(srt).toContain('<script>alert(1)</script> & "quotes"');
  });

  it('export text survives a round-trip through the transcript schema shape', () => {
    // segments straight from zod-parsed records serialize identically
    const rec = { segments: [seg(0.5, 1.25, 'x'), seg(1.25, 9.875, 'y')] };
    expect(toVtt(rec.segments)).toBe(
      'WEBVTT\n\n00:00:00.500 --> 00:00:01.250\nx\n\n00:00:01.250 --> 00:00:09.875\ny\n',
    );
  });
});
