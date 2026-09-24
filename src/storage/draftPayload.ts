/**
 * Draft payload format (M6, ADR 008 D2). Pure module — no IndexedDB here.
 *
 * Layout: [4B magic]['WFD1' gzip-able | 'WFR1' raw fallback][u32 LE header
 * length][JSON header][interleaved float32 PCM]. The whole record is gzipped
 * when CompressionStream exists (sniffable via the gzip magic 1f 8b), and
 * the decoder accepts both forever. Every decode failure maps to WF-E402 —
 * corrupt records are data, not crashes.
 */
import { z } from 'zod';
import { makeError } from '../core/errors';

export const draftHeaderSchema = z.object({
  v: z.literal(1),
  name: z.string().min(1).max(200),
  sampleRate: z.number().int().positive().max(384_000),
  channels: z.union([z.literal(1), z.literal(2)]),
  length: z.number().int().nonnegative(),
  savedAt: z.number().int().nonnegative(),
  cursor: z.number().nonnegative().optional(),
  selection: z.object({ start: z.number(), end: z.number() }).optional(),
  /** E6a noise-reduction print (per-bin magnitudes) — survives drafts (M7). */
  noisePrint: z.array(z.number()).max(8192).optional(),
});

export type DraftHeader = z.infer<typeof draftHeaderSchema>;

const MAGIC_GZIPPABLE = 0x57_46_44_31; // 'WFD1'
const MAGIC_RAW = 0x57_46_52_31; // 'WFR1'

function corrupt(cause: unknown): Error {
  return makeError('WF-E402', {}, cause);
}

export function supportsCompression(): boolean {
  return typeof CompressionStream === 'function';
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function writeRawRecord(header: DraftHeader, interleaved: Float32Array): Uint8Array {
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const pcmBytes = new Uint8Array(
    interleaved.buffer,
    interleaved.byteOffset,
    interleaved.byteLength,
  );
  const out = new Uint8Array(8 + headerBytes.length + pcmBytes.length);
  new DataView(out.buffer).setUint32(0, MAGIC_GZIPPABLE, false); // 'WFD1' in byte order
  new DataView(out.buffer).setUint32(4, headerBytes.length, true);
  out.set(headerBytes, 8);
  out.set(pcmBytes, 8 + headerBytes.length);
  return out;
}

function interleave(channels: Float32Array[]): Float32Array {
  const channels_ = channels.length;
  const length = channels[0]?.length ?? 0;
  const out = new Float32Array(channels_ * length);
  for (let ch = 0; ch < channels_; ++ch) {
    const data = channels[ch];
    if (!data) continue;
    for (let i = 0; i < length; ++i) out[i * channels_ + ch] = data[i] ?? 0;
  }
  return out;
}

/** Encode a draft snapshot; gzips when `compress` and the platform allow it. */
export async function encodeDraft(
  header: DraftHeader,
  channels: Float32Array[],
  opts: { compress: boolean },
): Promise<Uint8Array> {
  draftHeaderSchema.parse(header);
  const raw = writeRawRecord(header, interleave(channels));
  if (opts.compress && supportsCompression()) {
    return gzip(raw);
  }
  // raw fallback keeps its own magic so provenance is self-describing
  new DataView(raw.buffer).setUint32(0, MAGIC_RAW, false); // 'WFR1'
  return raw;
}

/** Decode a snapshot; every structural problem throws WF-E402. */
export async function decodeDraft(bytes: Uint8Array): Promise<{
  header: DraftHeader;
  channels: Float32Array[];
}> {
  let raw = bytes;
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    try {
      raw = await gunzip(bytes);
    } catch (error) {
      throw corrupt(error);
    }
  }
  if (raw.length < 8) throw corrupt('record shorter than a header');
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const magic = view.getUint32(0, false);
  if (magic !== MAGIC_GZIPPABLE && magic !== MAGIC_RAW) throw corrupt(`bad magic ${magic}`);

  const headerLen = view.getUint32(4, true);
  if (8 + headerLen > raw.length) throw corrupt('header length exceeds record');
  let header: DraftHeader;
  try {
    const json = new TextDecoder().decode(raw.subarray(8, 8 + headerLen));
    header = draftHeaderSchema.parse(JSON.parse(json));
  } catch (error) {
    throw corrupt(error);
  }

  const expected = header.length * header.channels * 4;
  const pcm = raw.subarray(8 + headerLen);
  if (pcm.length < expected) throw corrupt(`pcm truncated: ${pcm.length} < ${expected}`);

  // float view over the payload bytes, then de-interleave into per-channel copies
  const interleaved = new Float32Array(header.length * header.channels);
  new Uint8Array(interleaved.buffer).set(pcm.subarray(0, expected));
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < header.channels; ++ch) {
    const data = new Float32Array(header.length);
    for (let i = 0; i < header.length; ++i) data[i] = interleaved[i * header.channels + ch] ?? 0;
    channels.push(data);
  }
  return { header, channels };
}

/** SHA-256 hex over interleaved PCM (FNV-1a fallback without WebCrypto). */
export async function hashPcm(channels: Float32Array[]): Promise<string> {
  const interleaved = interleave(channels);
  const bytes = new Uint8Array(
    interleaved.buffer as ArrayBuffer,
    interleaved.byteOffset,
    interleaved.byteLength,
  );
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // FNV-1a 64-bit (two 32-bit lanes) — identity only, not security
  let hi = 0x84222325 ^ bytes.length;
  let lo = 0xcbf29ce4;
  for (const byte of bytes) {
    lo = Math.imul(lo ^ byte, 0x01000193) >>> 0;
    hi = Math.imul(hi ^ byte, 0x01000193) >>> 0;
  }
  return `${hi.toString(16).padStart(8, '0')}${lo.toString(16).padStart(8, '0')}`;
}
