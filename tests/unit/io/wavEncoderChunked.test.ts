/**
 * WF-003 — the chunked WAV encoder must be byte-identical to the golden
 * monolithic `encodeWav`, report monotonic real progress, honour cancel,
 * and produce files whose RIFF structure an INDEPENDENT parser (written
 * here, importing nothing from wavEncoder) decodes correctly.
 */
import { describe, expect, it } from 'vitest';
import { encodeWav, encodeWavChunked, type WavEncoding } from '../../../src/io/wavEncoder';

const ENCODINGS: WavEncoding[] = ['pcm16', 'pcm24', 'float32'];

function stereo(seconds = 0.5, sr = 22050): Float32Array[] {
  const n = Math.round(seconds * sr);
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (let i = 0; i < n; ++i) {
    l[i] = Math.sin((2 * Math.PI * 440 * i) / sr);
    r[i] = Math.cos((2 * Math.PI * 330 * i) / sr) * 0.5;
  }
  return [l, r];
}

/** Independent RIFF/WAVE reader — no imports from the encoder module. */
function parseRiff(bytes: Uint8Array): {
  formatTag: number;
  channels: number;
  sampleRate: number;
  bits: number;
  dataLen: number;
  riffSize: number;
} {
  const txt = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  if (txt(0) !== 'RIFF' || txt(8) !== 'WAVE') throw new Error('not RIFF/WAVE');
  const riffSize = bytes[4]! | (bytes[5]! << 8) | (bytes[6]! << 16) | (bytes[7]! << 24);
  let o = 12;
  let formatTag = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let dataLen = -1;
  while (o + 8 <= bytes.length) {
    const id = txt(o);
    const size = bytes[o + 4]! | (bytes[o + 5]! << 8) | (bytes[o + 6]! << 16) | (bytes[o + 7]! << 24);
    if (id === 'fmt ') {
      formatTag = bytes[o + 8]! | (bytes[o + 9]! << 8);
      channels = bytes[o + 10]! | (bytes[o + 11]! << 8);
      sampleRate = bytes[o + 12]! | (bytes[o + 13]! << 8) | (bytes[o + 14]! << 16) | (bytes[o + 15]! << 24);
      bits = bytes[o + 22]! | (bytes[o + 23]! << 8);
    } else if (id === 'data') {
      dataLen = size;
    }
    o += 8 + size + (size % 2);
  }
  if (dataLen < 0) throw new Error('no data chunk');
  return { formatTag, channels, sampleRate, bits, dataLen, riffSize };
}

describe('encodeWavChunked (WF-003)', () => {
  for (const encoding of ENCODINGS) {
    it(`${encoding}: chunked output is byte-identical to the monolithic golden`, () => {
      for (const channels of [stereo(), [stereo()[0]!]]) {
        // odd frame counts exercise the 24-bit pad path
        const odd = channels.map((c) => c.subarray(0, c.length - (c.length % 2 === 0 ? 1 : 0)));
        const ref = encodeWav(odd, 22050, encoding);
        for (const chunk of [1, 997, 65_536]) {
          const out = encodeWavChunked(odd, 22050, encoding, { chunkFrames: chunk });
          expect(out).toBeTruthy();
          expect(Buffer.from(out!).equals(Buffer.from(ref))).toBe(true);
        }
      }
    });
  }

  it('progress is monotonic and reaches exactly 1', () => {
    const seen: number[] = [];
    encodeWavChunked(stereo(), 22050, 'pcm24', {
      chunkFrames: 4096,
      onProgress: (f) => seen.push(f),
    });
    expect(seen.length).toBeGreaterThan(1);
    expect(seen[0]).toBeGreaterThan(0);
    expect(seen.at(-1)).toBe(1);
    for (let i = 1; i < seen.length; ++i) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]!);
  });

  it('cancel between chunks returns null', () => {
    let calls = 0;
    const out = encodeWavChunked(stereo(), 22050, 'pcm16', {
      chunkFrames: 2048,
      shouldCancel: () => ++calls > 2,
    });
    expect(out).toBeNull();
    expect(calls).toBeLessThanOrEqual(4);
  });

  it('INDEPENDENT decode: RIFF fields match the request for all three bit depths', () => {
    const sr = 44100;
    const cases: Array<[WavEncoding, number, number]> = [
      ['pcm16', 16, 1],
      ['pcm24', 24, 1],
      ['float32', 32, 3],
    ];
    for (const [encoding, bits, formatTag] of cases) {
      const channels = stereo(0.1, sr);
      const frames = channels[0]!.length;
      const out = encodeWavChunked(channels, sr, encoding, { chunkFrames: 1000 })!;
      const riff = parseRiff(new Uint8Array(out));
      expect(riff.formatTag).toBe(formatTag);
      expect(riff.channels).toBe(2);
      expect(riff.sampleRate).toBe(sr);
      expect(riff.bits).toBe(bits);
      expect(riff.dataLen).toBe(frames * 2 * (bits / 8));
      expect(riff.riffSize).toBe(out.byteLength - 8);
    }
  });
});
