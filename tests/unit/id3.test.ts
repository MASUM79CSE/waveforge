import { describe, expect, test } from 'vitest';
import { buildId3Tag, parseId3, id3Schema } from '../../src/io/id3';

function byteAt(data: Uint8Array, i: number): number {
  return data[i] ?? Number.NaN;
}

function ascii(data: Uint8Array, offset: number, len: number): string {
  let out = '';
  for (let i = 0; i < len; ++i) out += String.fromCharCode(byteAt(data, offset + i));
  return out;
}

describe('buildId3Tag (golden bytes)', () => {
  test('minimal v2.4 tag: header, syncsafe size, one TIT2 frame', () => {
    const tag = new Uint8Array(buildId3Tag({ title: 'Hi' }));
    expect(ascii(tag, 0, 3)).toBe('ID3');
    expect(byteAt(tag, 3)).toBe(4); // version 2.4
    expect(byteAt(tag, 5)).toBe(0); // flags
    // the size field counts everything AFTER the 10-byte header:
    // one frame = 10 (frame header) + 1 (encoding byte) + 2 chars = 13
    const frameSize = 13;
    expect(byteAt(tag, 6)).toBe((frameSize >>> 21) & 0x7f);
    expect(byteAt(tag, 7)).toBe((frameSize >>> 14) & 0x7f);
    expect(byteAt(tag, 8)).toBe((frameSize >>> 7) & 0x7f);
    expect(byteAt(tag, 9)).toBe(frameSize & 0x7f);
    // frame: TIT2, size syncsafe, status 0
    expect(ascii(tag, 10, 4)).toBe('TIT2');
    expect(byteAt(tag, 20)).toBe(3); // UTF-8 encoding byte
    expect(ascii(tag, 21, 2)).toBe('Hi');
  });

  test('sizes are syncsafe in frames too (no 0x80 bits)', () => {
    const tag = new Uint8Array(buildId3Tag({ title: 'x'.repeat(300) }));
    for (const offset of [6, 16]) {
      for (let i = 0; i < 4; ++i) {
        expect(byteAt(tag, offset + i)).toBeLessThanOrEqual(0x7f);
      }
    }
  });

  test('multi-frame ordering includes TPE1 and TALB when present', () => {
    const tag = new Uint8Array(buildId3Tag({ title: 'T', artist: 'A', album: 'B' }));
    const text = ascii(tag, 0, tag.length);
    expect(text).toContain('TIT2');
    expect(text).toContain('TPE1');
    expect(text).toContain('TALB');
  });
});

describe('parseId3', () => {
  test('round-trips through build', () => {
    const original = { title: 'Song', artist: 'Artist', album: 'Album', year: '2026', track: '7', genre: 'Test' };
    const tag = new Uint8Array(buildId3Tag(original));
    const parsed = parseId3(tag);
    expect(parsed?.title).toBe('Song');
    expect(parsed?.artist).toBe('Artist');
    expect(parsed?.album).toBe('Album');
    expect(parsed?.year).toBe('2026');
    expect(parsed?.track).toBe('7');
    expect(parsed?.genre).toBe('Test');
  });

  test('returns null for non-ID3 data and for truncated tags', () => {
    expect(parseId3(new Uint8Array([0, 1, 2, 3]))).toBeNull();
    expect(parseId3(new Uint8Array(10))).toBeNull(); // header claims more
    const tag = new Uint8Array(buildId3Tag({ title: 'Hi' }));
    expect(parseId3(tag.slice(0, 15))).toBeNull();
  });

  test('reads a tag prepended to arbitrary payload (mp3 frame noise)', () => {
    const tag = new Uint8Array(buildId3Tag({ title: 'Payload test' }));
    const mp3 = new Uint8Array(tag.length + 512);
    mp3.set(tag, 0);
    mp3.set([0xff, 0xfb, 0x90, 0x00], tag.length); // frame sync
    expect(parseId3(mp3)?.title).toBe('Payload test');
  });

  test('v2.3 UTF-16 tag parses (Latin-1 compatible input)', () => {
    // hand-build a minimal v2.3 tag with UTF-16 TIT2 "Ok"
    const enc = [0x01, 0xff, 0xfe]; // UTF-16LE + BOM
    const text = [0x4f, 0x00, 0x6b, 0x00]; // "Ok"
    const frameSize = enc.length + text.length;
    const size = 10 + frameSize; // body only (header excluded)
    const bytes = [
      0x49, 0x44, 0x33, 0x03, 0x00, 0x00,
      (size >>> 21) & 0x7f, (size >>> 14) & 0x7f, (size >>> 7) & 0x7f, size & 0x7f,
      0x54, 0x49, 0x54, 0x32, // TIT2
      (frameSize >>> 24) & 0xff, (frameSize >>> 16) & 0xff, (frameSize >>> 8) & 0xff, frameSize & 0xff,
      0x00, 0x00,
      ...enc, ...text,
    ];
    const parsed = parseId3(new Uint8Array(bytes));
    expect(parsed?.title).toBe('Ok');
  });
});

describe('id3Schema (zod boundary)', () => {
  test('rejects oversized and wrong-typed values', () => {
    expect(id3Schema.safeParse({ title: 'x'.repeat(501) }).success).toBe(false);
    expect(id3Schema.safeParse({ title: 42 }).success).toBe(false);
    expect(id3Schema.safeParse({ track: 'not-a-number-text' }).success).toBe(false);
  });

  test('strips control characters through transform', () => {
    const parsed = id3Schema.parse({ title: 'bad\u0000\u001ftitle' });
    expect(parsed.title).toBe('badtitle');
  });

  test('accepts partial maps and empty strings', () => {
    expect(id3Schema.safeParse({}).success).toBe(true);
    expect(id3Schema.parse({ artist: '' }).artist).toBe('');
  });
});
