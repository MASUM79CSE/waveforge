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

export function encodeWav(
  channels: Float32Array[],
  sampleRate: number,
  encoding: WavEncoding,
): ArrayBuffer {
  const channelCount = Math.max(1, channels.length);
  const frames = framesOf(channels);
  const bits = encoding === 'pcm16' ? 16 : encoding === 'pcm24' ? 24 : 32;
  const bytesPerSample = bits / 8;
  const dataLen = frames * channelCount * bytesPerSample;
  const headerSize = wavHeaderSize(encoding);
  const pad = dataLen % 2 === 1 ? 1 : 0;
  const out = new Uint8Array(headerSize + dataLen + pad);

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

  if (encoding === 'pcm16') writePcm16(channels, out, headerSize);
  else if (encoding === 'pcm24') writePcm24(channels, out, headerSize);
  else writeFloat32(channels, out, headerSize);

  return out.buffer;
}

function writePcm16(channels: Float32Array[], out: Uint8Array, offset: number): void {
  const chCount = channels.length;
  const frames = framesOf(channels);
  let pos = offset;
  for (let i = 0; i < frames; ++i) {
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
  const chCount = channels.length;
  const frames = framesOf(channels);
  let pos = offset;
  for (let i = 0; i < frames; ++i) {
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
  const chCount = channels.length;
  const frames = framesOf(channels);
  let pos = offset;
  for (let i = 0; i < frames; ++i) {
    for (let ch = 0; ch < chCount; ++ch) {
      const view = new DataView(out.buffer, pos, 4);
      view.setFloat32(0, channels[ch]?.[i] ?? 0, true);
      pos += 4;
    }
  }
}
