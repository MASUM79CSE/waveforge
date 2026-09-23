/**
 * ID3v2 metadata (M5): v2.4 writer (syncsafe sizes, UTF-8 text frames)
 * and v2.3/v2.4 reader for prefill. `id3Schema` is the validation
 * boundary — buildId3Tag parses through it, so nothing unbounded or
 * control-laden ever reaches bytes.
 */
import { z } from 'zod';
import { ID3_MAX_FRAME, ID3_MAX_TEXT } from '../core/constants';

const text = z
  .string()
  .max(ID3_MAX_TEXT)
  .transform((value) => value.replace(/[\u0000-\u001f\u007f]/g, ''));

const digits = z
  .string()
  .max(ID3_MAX_FRAME)
  .refine((value) => value === '' || /^[\d/]+$/.test(value), 'digits only');

export const id3Schema = z
  .object({
    title: text.optional(),
    artist: text.optional(),
    album: text.optional(),
    genre: text.optional(),
    track: digits.optional(),
    year: z
      .string()
      .refine((value) => value === '' || /^\d{4}$/.test(value), 'YYYY expected')
      .optional(),
  })
  .strict();

export type Id3Meta = z.infer<typeof id3Schema>;

const FRAME_BY_KEY: { key: keyof Id3Meta; id: string }[] = [
  { key: 'title', id: 'TIT2' },
  { key: 'artist', id: 'TPE1' },
  { key: 'album', id: 'TALB' },
  { key: 'genre', id: 'TCON' },
  { key: 'track', id: 'TRCK' },
  { key: 'year', id: 'TDRC' },
];

const FRAME_BY_ID: Record<string, keyof Id3Meta> = {
  TIT2: 'title',
  TPE1: 'artist',
  TALB: 'album',
  TCON: 'genre',
  TRCK: 'track',
  TDRC: 'year',
  TYER: 'year', // v2.3
};

function writeSyncsafe(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 21) & 0x7f;
  bytes[offset + 1] = (value >>> 14) & 0x7f;
  bytes[offset + 2] = (value >>> 7) & 0x7f;
  bytes[offset + 3] = value & 0x7f;
}

function readSyncsafe(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) << 21) |
    ((bytes[offset + 1] ?? 0) << 14) |
    ((bytes[offset + 2] ?? 0) << 7) |
    (bytes[offset + 3] ?? 0)
  );
}

/** Build a v2.4 tag (throws via zod when values are invalid). */
export function buildId3Tag(raw: Record<string, unknown>): ArrayBuffer {
  const meta = id3Schema.parse(raw);
  const frames: Uint8Array[] = [];
  for (const { key, id } of FRAME_BY_KEY) {
    const value = meta[key];
    if (!value) continue;
    const encoded = new TextEncoder().encode(value);
    const frame = new Uint8Array(10 + 1 + encoded.length);
    for (let i = 0; i < 4; ++i) frame[i] = id.charCodeAt(i);
    writeSyncsafe(frame, 4, 1 + encoded.length);
    frame[10] = 0x03; // UTF-8
    frame.set(encoded, 11);
    frames.push(frame);
  }
  const bodyLength = frames.reduce((sum, frame) => sum + frame.length, 0);
  const out = new Uint8Array(10 + bodyLength);
  out[0] = 0x49; // I
  out[1] = 0x44; // D
  out[2] = 0x33; // 3
  out[3] = 0x04; // v2.4
  out[4] = 0x00;
  out[5] = 0x00;
  writeSyncsafe(out, 6, bodyLength);
  let offset = 10;
  for (const frame of frames) {
    out.set(frame, offset);
    offset += frame.length;
  }
  return out.buffer;
}

function decodeText(data: Uint8Array): string {
  const encoding = data[0] ?? 0;
  const body = data.subarray(1);
  try {
    if (encoding === 0x01) {
      // UTF-16 with BOM (default LE)
      const hasBom = body[0] === 0xff && body[1] === 0xfe;
      const payload = hasBom ? body.subarray(2) : body;
      return new TextDecoder('utf-16le').decode(payload);
    }
    if (encoding === 0x02) return new TextDecoder('utf-16be').decode(body);
    if (encoding === 0x03) return new TextDecoder('utf-8').decode(body);
    return new TextDecoder('iso-8859-1').decode(body);
  } catch {
    return '';
  }
}

/** Parse an ID3v2.3/2.4 tag from the start of `bytes`; null when absent. */
export function parseId3(bytes: Uint8Array): Id3Meta | null {
  if (bytes.length < 10) return null;
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null;
  const major = bytes[3] ?? 0;
  if (major !== 3 && major !== 4) return null;
  const tagEnd = 10 + readSyncsafe(bytes, 6);
  if (tagEnd > bytes.length) return null;

  const meta: Record<string, string> = {};
  let offset = 10;
  const frameHeaderSize = 10;
  while (offset + frameHeaderSize <= tagEnd) {
    const id = String.fromCharCode(
      bytes[offset] ?? 0,
      bytes[offset + 1] ?? 0,
      bytes[offset + 2] ?? 0,
      bytes[offset + 3] ?? 0,
    );
    if (!/^[A-Z0-9]{4}$/.test(id)) break; // padding / corruption
    const size =
      major === 4
        ? readSyncsafe(bytes, offset + 4)
        : ((bytes[offset + 4] ?? 0) << 24) |
          ((bytes[offset + 5] ?? 0) << 16) |
          ((bytes[offset + 6] ?? 0) << 8) |
          (bytes[offset + 7] ?? 0);
    if (size <= 0 || offset + frameHeaderSize + size > tagEnd) break;
    const key = FRAME_BY_ID[id];
    if (key && id.startsWith('T')) {
      const value = decodeText(bytes.subarray(offset + frameHeaderSize, offset + frameHeaderSize + size));
      if (value) meta[key] = value.replace(/[\u0000-\u001f\u007f]/g, '');
    }
    offset += frameHeaderSize + size;
  }
  if (Object.keys(meta).length === 0) return null;
  const parsed = id3Schema.safeParse(meta);
  return parsed.success ? parsed.data : null;
}

/**
 * Prepend a built ID3 tag to encoded MP3 bytes (export path). Returns a new
 * array; the inputs are not modified.
 */
export function prependId3Tag(mp3: Uint8Array, tag: ArrayBuffer): Uint8Array {
  const header = new Uint8Array(tag);
  const out = new Uint8Array(header.length + mp3.length);
  out.set(header, 0);
  out.set(mp3, header.length);
  return out;
}
