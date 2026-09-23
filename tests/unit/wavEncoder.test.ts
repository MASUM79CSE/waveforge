import { describe, expect, test } from 'vitest';
import { encodeWav, wavHeaderSize } from '../../src/io/wavEncoder';

/** Byte-read helper satisfying noUncheckedIndexedAccess; NaN fails loudly. */
function byteAt(data: Uint8Array, i: number): number {
  return data[i] ?? Number.NaN;
}

function u16(data: Uint8Array, offset: number): number {
  return byteAt(data, offset) | (byteAt(data, offset + 1) << 8);
}

function u32(data: Uint8Array, offset: number): number {
  return (
    (byteAt(data, offset) |
      (byteAt(data, offset + 1) << 8) |
      (byteAt(data, offset + 2) << 16) |
      (byteAt(data, offset + 3) << 24)) >>>
    0
  );
}

function ascii(data: Uint8Array, offset: number, len: number): string {
  let out = '';
  for (let i = 0; i < len; ++i) out += String.fromCharCode(byteAt(data, offset + i));
  return out;
}

describe('encodeWav 16-bit PCM (bit-exact golden)', () => {
  test('mono [1.0, 0.5, -0.5, 0] @ 8000 Hz — full byte fixture', () => {
    const bytes = new Uint8Array(encodeWav([new Float32Array([1, 0.5, -0.5, 0])], 8000, 'pcm16'));
    // header: 44 bytes
    expect(ascii(bytes, 0, 4)).toBe('RIFF');
    expect(u32(bytes, 4)).toBe(36 + 8); // 36 + dataLen (4 samples × 2 bytes)
    expect(ascii(bytes, 8, 4)).toBe('WAVE');
    expect(ascii(bytes, 12, 4)).toBe('fmt ');
    expect(u32(bytes, 16)).toBe(16); // fmt chunk size
    expect(u16(bytes, 20)).toBe(1); // PCM
    expect(u16(bytes, 22)).toBe(1); // mono
    expect(u32(bytes, 24)).toBe(8000); // sample rate
    expect(u32(bytes, 28)).toBe(8000 * 2); // byte rate
    expect(u16(bytes, 32)).toBe(2); // block align
    expect(u16(bytes, 34)).toBe(16); // bits
    expect(ascii(bytes, 36, 4)).toBe('data');
    expect(u32(bytes, 40)).toBe(8);
    // samples: 1.0 → 32767 (FF 7F), 0.5 → 16384 (00 40), -0.5 → -16384 (00 C0), 0 (00 00)
    expect(Array.from(bytes.slice(44))).toEqual([
      0xff, 0x7f, 0x00, 0x40, 0x00, 0xc0, 0x00, 0x00,
    ]);
  });

  test('stereo interleaves channels (fixture on 3 frames)', () => {
    const left = new Float32Array([1, 0, 0]);
    const right = new Float32Array([0, 1, 0]);
    const bytes = new Uint8Array(encodeWav([left, right], 44100, 'pcm16'));
    expect(u16(bytes, 22)).toBe(2);
    expect(u32(bytes, 4)).toBe(36 + 12);
    // frame 0: L=32767, R=0; frame 1: L=0, R=32767
    expect(byteAt(bytes, 44)).toBe(0xff);
    expect(byteAt(bytes, 45)).toBe(0x7f);
    expect(byteAt(bytes, 46)).toBe(0x00);
    expect(byteAt(bytes, 47)).toBe(0x00);
    expect(byteAt(bytes, 48)).toBe(0x00);
    expect(byteAt(bytes, 49)).toBe(0x00);
  });

  test('out-of-range samples clamp, -1.0 maps to -32768', () => {
    const bytes = new Uint8Array(encodeWav([new Float32Array([2, -1, -2])], 8000, 'pcm16'));
    const s0 = byteAt(bytes, 44) | (byteAt(bytes, 45) << 8); // 32767
    const s1 = (byteAt(bytes, 46) | (byteAt(bytes, 47) << 8)) << 16 >> 16; // sign-extended
    const s2 = (byteAt(bytes, 48) | (byteAt(bytes, 49) << 8)) << 16 >> 16;
    expect(s0).toBe(32767);
    expect(s1).toBe(-32768);
    expect(s2).toBe(-32768);
  });
});

describe('encodeWav 24-bit PCM', () => {
  test('sample values land on the 24-bit grid (fixture)', () => {
    const bytes = new Uint8Array(encodeWav([new Float32Array([1, -1, 0])], 8000, 'pcm24'));
    expect(u16(bytes, 34)).toBe(24);
    expect(u32(bytes, 4)).toBe(36 + 9); // 3 samples × 3 bytes
    const s0 =
      byteAt(bytes, 44) | (byteAt(bytes, 45) << 8) | (byteAt(bytes, 46) << 16); // 8388607
    expect(s0).toBe(0x7fffff);
    // -8388608 little-endian: 00 00 80
    expect(byteAt(bytes, 47)).toBe(0x00);
    expect(byteAt(bytes, 48)).toBe(0x00);
    expect(byteAt(bytes, 49)).toBe(0x80);
  });
});

describe('encodeWav 32-bit float', () => {
  test('format tag 3, fmt(18) + fact chunks, raw IEEE frames bit-exact', () => {
    const samples = [0.25, -0.5, 1];
    const bytes = new Uint8Array(encodeWav([new Float32Array(samples)], 8000, 'float32'));
    expect(u16(bytes, 20)).toBe(3); // IEEE float
    expect(u16(bytes, 34)).toBe(32);
    expect(u32(bytes, 16)).toBe(18); // extended fmt chunk
    expect(u16(bytes, 36)).toBe(0); // cbSize
    expect(ascii(bytes, 38, 4)).toBe('fact');
    expect(u32(bytes, 42)).toBe(4);
    expect(u32(bytes, 46)).toBe(3); // dwSampleLength = frames
    const view = new DataView(bytes.buffer, 58);
    for (let i = 0; i < samples.length; ++i) {
      expect(view.getFloat32(i * 4, true)).toBeCloseTo(samples[i] ?? 99, 6);
    }
  });
});

describe('wavHeaderSize / odd data sizes', () => {
  test('header is 44 for PCM, 58 for float (fmt 18 + fact + data hdr)', () => {
    expect(wavHeaderSize('pcm16')).toBe(44);
    expect(wavHeaderSize('pcm24')).toBe(44);
    expect(wavHeaderSize('float32')).toBe(58);
  });

  test('24-bit odd byte counts pad the data chunk to even length', () => {
    // 3 mono samples at 24-bit = 9 bytes → padded to 10 in RIFF size? No:
    // RIFF size counts actual bytes; the PAD byte is written but not counted.
    const bytes = new Uint8Array(encodeWav([new Float32Array([1, -1, 0])], 8000, 'pcm24'));
    expect(bytes.length).toBe(44 + 9 + 1); // pad byte present
    expect(u32(bytes, 4)).toBe(36 + 9); // but not counted
  });
});
