/**
 * WAV encoder (M4). Pure, deterministic, golden-tested byte-for-byte.
 * Containers: RIFF/WAVE with PCM (16/24-bit) and IEEE float (32-bit, with
 * the spec's fmt(18) + fact chunks). Odd data sizes (24-bit) get a pad
 * byte that is written but not counted in chunk sizes (per RIFF spec).
 */

export type WavEncoding = 'pcm16' | 'pcm24' | 'float32';

const PCM = 1;
const IEEE_FLOAT = 3;

export function wavHeaderSize(encoding: WavEncoding): number {
  // float32 carries fmt(18) + fact(12) chunks: 12 + 26 + 12 + 8(data hdr)
  return encoding === 'float32' ? 58 : 44;
}

function framesOf(channels: Float32Array[]): number {
  return channels[0]?.length ?? 0;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function writeAscii(bytes: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; ++i) bytes[offset + i] = text.charCodeAt(i);
}

function writeU16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function writeU32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function writeWavHeader(
  out: Uint8Array,
  encoding: WavEncoding,
  sampleRate: number,
  channelCount: number,
  frames: number,
): void {
  const bits = encoding === 'pcm16' ? 16 : encoding === 'pcm24' ? 24 : 32;
  const bytesPerSample = bits / 8;
  const dataLen = frames * channelCount * bytesPerSample;
  const headerSize = wavHeaderSize(encoding);
  const pad = dataLen % 2 === 1 ? 1 : 0;
  void pad; // pad affects the allocation, not the header fields

  const formatTag = encoding === 'float32' ? IEEE_FLOAT : PCM;
  const blockAlign = channelCount * bytesPerSample;
  const byteRate = sampleRate * blockAlign;

  writeAscii(out, 0, 'RIFF');
  writeU32(out, 4, headerSize - 8 + dataLen);
  writeAscii(out, 8, 'WAVE');
  writeAscii(out, 12, 'fmt ');
  writeU32(out, 16, encoding === 'float32' ? 18 : 16);
  writeU16(out, 20, formatTag);
  writeU16(out, 22, channelCount);
  writeU32(out, 24, sampleRate);
  writeU32(out, 28, byteRate);
  writeU16(out, 32, blockAlign);
  writeU16(out, 34, bits);
  if (encoding === 'float32') {
    writeU16(out, 36, 0); // cbSize (extension size)
    writeAscii(out, 38, 'fact');
    writeU32(out, 42, 4);
    writeU32(out, 46, frames); // dwSampleLength
    writeAscii(out, 50, 'data');
    writeU32(out, 54, dataLen);
  } else {
    writeAscii(out, 36, 'data');
    writeU32(out, 40, dataLen);
  }
}

/** Allocation size for a WAV of this shape (header + data + odd-pad). */
export function wavOutputSize(
  encoding: WavEncoding,
  channelCount: number,
  frames: number,
): number {
  const bits = encoding === 'pcm16' ? 16 : encoding === 'pcm24' ? 24 : 32;
  const dataLen = frames * channelCount * (bits / 8);
  return wavHeaderSize(encoding) + dataLen + (dataLen % 2 === 1 ? 1 : 0);
}

export function encodeWav(
  channels: Float32Array[],
  sampleRate: number,
  encoding: WavEncoding,
): ArrayBuffer {
  const channelCount = Math.max(1, channels.length);
  const frames = framesOf(channels);
  const headerSize = wavHeaderSize(encoding);
  const out = new Uint8Array(wavOutputSize(encoding, channelCount, frames));
  writeWavHeader(out, encoding, sampleRate, channelCount, frames);

  if (encoding === 'pcm16') writePcm16(channels, out, headerSize);
  else if (encoding === 'pcm24') writePcm24(channels, out, headerSize);
  else writeFloat32(channels, out, headerSize);

  return out.buffer;
}

function writePcm16(channels: Float32Array[], out: Uint8Array, offset: number): void {
  writePcm16Range(channels, out, offset, 0, framesOf(channels));
}

function writePcm16Range(channels: Float32Array[], out: Uint8Array, offset: number, start: number, end: number): void {
  const chCount = channels.length;
  let pos = offset + start * chCount * 2;
  for (let i = start; i < end; ++i) {
    for (let ch = 0; ch < chCount; ++ch) {
      // negative side scales by 32768 so -1.0 maps to full range (matches
      // the MP3 path and the reference editor); positive side by 32767 (no clip)
      const x = channels[ch]?.[i] ?? 0;
      const s = clamp(Math.round(x < 0 ? x * 32768 : x * 32767), -32768, 32767);
      out[pos] = s & 0xff;
      out[pos + 1] = (s >>> 8) & 0xff;
      pos += 2;
    }
  }
}

function writePcm24(channels: Float32Array[], out: Uint8Array, offset: number): void {
  writePcm24Range(channels, out, offset, 0, framesOf(channels));
}

function writePcm24Range(channels: Float32Array[], out: Uint8Array, offset: number, start: number, end: number): void {
  const chCount = channels.length;
  let pos = offset + start * chCount * 3;
  for (let i = start; i < end; ++i) {
    for (let ch = 0; ch < chCount; ++ch) {
      const x = channels[ch]?.[i] ?? 0;
      const s = clamp(Math.round(x < 0 ? x * 8388608 : x * 8388607), -8388608, 8388607);
      out[pos] = s & 0xff;
      out[pos + 1] = (s >>> 8) & 0xff;
      out[pos + 2] = (s >>> 16) & 0xff;
      pos += 3;
    }
  }
}

function writeFloat32(channels: Float32Array[], out: Uint8Array, offset: number): void {
  writeFloat32Range(channels, out, offset, 0, framesOf(channels));
}

function writeFloat32Range(channels: Float32Array[], out: Uint8Array, offset: number, start: number, end: number): void {
  const chCount = channels.length;
  let pos = offset + start * chCount * 4;
  for (let i = start; i < end; ++i) {
    for (let ch = 0; ch < chCount; ++ch) {
      const view = new DataView(out.buffer, pos, 4);
      view.setFloat32(0, channels[ch]?.[i] ?? 0, true);
      pos += 4;
    }
  }
}

/**
 * Chunked WAV encode (WF-003): byte-identical to `encodeWav` but converts
 * in frame ranges so a worker can report real progress and honour cancel
 * between chunks. Returns null when `shouldCancel()` fires.
 */
export interface WavChunkedOptions {
  chunkFrames?: number;
  onProgress?: (fraction: number) => void;
  shouldCancel?: () => boolean;
}

export function encodeWavChunked(
  channels: Float32Array[],
  sampleRate: number,
  encoding: WavEncoding,
  opts: WavChunkedOptions = {},
): ArrayBuffer | null {
  const channelCount = Math.max(1, channels.length);
  const frames = framesOf(channels);
  const headerSize = wavHeaderSize(encoding);
  const out = new Uint8Array(wavOutputSize(encoding, channelCount, frames));
  writeWavHeader(out, encoding, sampleRate, channelCount, frames);

  const chunkFrames = Math.max(1, opts.chunkFrames ?? 65_536);
  const write =
    encoding === 'pcm16'
      ? writePcm16Range
      : encoding === 'pcm24'
        ? writePcm24Range
        : writeFloat32Range;

  for (let start = 0; start < frames; start += chunkFrames) {
    if (opts.shouldCancel?.()) return null;
    const end = Math.min(start + chunkFrames, frames);
    write(channels, out, headerSize, start, end);
    opts.onProgress?.(end / frames);
  }
  opts.onProgress?.(1);
  return out.buffer;
}
