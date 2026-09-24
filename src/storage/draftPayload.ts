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
import { renderClipTrack } from '../engine/clips';

/** M9f: one clip of a lane's arrangement (sample domain, asset-referencing). */
export const draftClipSchema = z.object({
  id: z.string().min(1).max(128),
  assetId: z.string().min(1).max(256),
  start: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  duration: z.number().int().positive(),
});

/** M8e: one lane's mixer state (audio rides in the PCM block sequence).
 * M9f: v3 lanes carry their clip arrangement (channels render from clips). */
export const draftTrackSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(200),
  gain: z.number().min(0).max(4),
  pan: z.number().min(-1).max(1),
  mute: z.boolean(),
  solo: z.boolean(),
  channels: z.union([z.literal(1), z.literal(2)]),
  length: z.number().int().nonnegative(),
  clips: z.array(draftClipSchema).max(4096).optional(),
});

/** M9f: one shared immutable take (PCM block; deduped by id). */
export const draftAssetSchema = z.object({
  id: z.string().min(1).max(256),
  sampleRate: z.number().int().positive().max(384_000),
  channels: z.union([z.literal(1), z.literal(2)]),
  length: z.number().int().nonnegative(),
});

export type DraftAsset = z.infer<typeof draftAssetSchema>;
export type DraftClip = z.infer<typeof draftClipSchema>;

export const draftHeaderSchema = z.object({
  v: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  name: z.string().min(1).max(200),
  sampleRate: z.number().int().positive().max(384_000),
  channels: z.union([z.literal(1), z.literal(2)]),
  length: z.number().int().nonnegative(),
  savedAt: z.number().int().nonnegative(),
  cursor: z.number().nonnegative().optional(),
  selection: z.object({ start: z.number(), end: z.number() }).optional(),
  /** E6a noise-reduction print (per-bin magnitudes) — survives drafts (M7). */
  noisePrint: z.array(z.number()).max(8192).optional(),
  /** M8e: v2 lanes; PCM = per-track blocks in this order. */
  tracks: z.array(draftTrackSchema).max(64).optional(),
  /** M9f: v3 shared assets; PCM = per-ASSET blocks in this order (deduped). */
  assets: z.array(draftAssetSchema).max(256).optional(),
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

/** Per-lane audio + meta (M8e); v3 adds the clip list (M9f). */
export interface DraftTrackPayload {
  meta: DraftTrack;
  channels: Float32Array[];
  clips?: DraftClip[];
}

/**
 * Encode a v2 multitrack snapshot: PCM = each track's interleaved block,
 * concatenated in `tracks` order. `header.tracks` MUST match the array
 * (the decoder splits on those metas).
 */
export async function encodeDraftTracks(
  header: DraftHeader,
  tracks: DraftTrackPayload[],
  opts: { compress: boolean },
): Promise<Uint8Array> {
  const parsed = draftHeaderSchema.parse({ ...header, v: 2, tracks: tracks.map((t) => t.meta) });
  if (parsed.v !== 2 || !parsed.tracks) throw corrupt('v2 encode without tracks');
  const parts: Float32Array[] = [];
  let total = 0;
  for (const t of tracks) {
    const block = interleave(t.channels);
    total += block.length;
    parts.push(block);
  }
  const pcm = new Float32Array(total);
  let at = 0;
  for (const block of parts) {
    pcm.set(block, at);
    at += block.length;
  }
  const raw = writeRawRecord(parsed, pcm);
  if (opts.compress && supportsCompression()) return gzip(raw);
  new DataView(raw.buffer).setUint32(0, MAGIC_RAW, false);
  return raw;
}

/** M9f: per-asset PCM block + meta. */
export interface DraftAssetPayload {
  meta: DraftAsset;
  channels: Float32Array[];
}

/**
 * Encode a v3 project snapshot: PCM = each UNIQUE asset's interleaved block,
 * concatenated in `assets` order (dedup is the caller's — exportProjectClips).
 * Track metas carry their clip lists; asset metas carry channel counts.
 */
export async function encodeDraftProject(
  header: DraftHeader,
  tracks: Array<{ meta: DraftTrack; clips?: DraftClip[]; channels: Float32Array[] }>,
  assets: DraftAssetPayload[],
  opts: { compress: boolean },
): Promise<Uint8Array> {
  const parsed = draftHeaderSchema.parse({
    ...header,
    v: 3,
    tracks: tracks.map((t) => ({ ...t.meta, clips: t.clips ?? t.meta.clips })),
    assets: assets.map((a) => a.meta),
  });
  if (parsed.v !== 3 || !parsed.assets) throw corrupt('v3 encode without assets');
  const parts: Float32Array[] = [];
  let total = 0;
  for (const a of assets) {
    const block = interleave(a.channels);
    total += block.length;
    parts.push(block);
  }
  const pcm = new Float32Array(total);
  let at = 0;
  for (const block of parts) {
    pcm.set(block, at);
    at += block.length;
  }
  const raw = writeRawRecord(parsed, pcm);
  if (opts.compress && supportsCompression()) return gzip(raw);
  new DataView(raw.buffer).setUint32(0, MAGIC_RAW, false);
  return raw;
}

/** Decode a snapshot; every structural problem throws WF-E402. */
export type DraftTrack = z.infer<typeof draftTrackSchema>;

export async function decodeDraft(bytes: Uint8Array): Promise<{
  header: DraftHeader;
  channels: Float32Array[];
  tracks?: DraftTrackPayload[];
  /** M9f: present on v3 — per-asset PCM blocks (deduped). */
  assets?: DraftAssetPayload[];
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

  const assetMetas = header.v === 3 ? header.assets : undefined;
  const trackMetas = header.v === 2 || header.v === 3 ? header.tracks : undefined;
  const totalFloats =
    assetMetas?.reduce((acc, a) => acc + a.length * a.channels, 0) ??
    trackMetas?.reduce((acc, t) => acc + t.length * t.channels, 0) ??
    header.length * header.channels;
  const expected = totalFloats * 4;
  const pcm = raw.subarray(8 + headerLen);
  if (pcm.length < expected) throw corrupt(`pcm truncated: ${pcm.length} < ${expected}`);

  // float view over the payload bytes, then de-interleave into per-channel copies
  const interleaved = new Float32Array(totalFloats);
  new Uint8Array(interleaved.buffer).set(pcm.subarray(0, expected));
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < header.channels; ++ch) {
    const data = new Float32Array(header.length);
    for (let i = 0; i < header.length; ++i) data[i] = interleaved[i * header.channels + ch] ?? 0;
    channels.push(data);
  }
  if (assetMetas) {
    // v3: split the block sequence per ASSET, then render track channels
    // from their clip lists (pure — the doc block mirrors track 1)
    const assets: DraftAssetPayload[] = [];
    let at = 0;
    const assetMap = new Map<string, import('../engine/clips').AudioAsset>();
    for (const meta of assetMetas) {
      const per = meta.length * meta.channels;
      const block = interleaved.subarray(at, at + per);
      at += per;
      const chans: Float32Array[] = [];
      for (let ch = 0; ch < meta.channels; ++ch) {
        const data = new Float32Array(meta.length);
        for (let i = 0; i < meta.length; ++i) data[i] = block[i * meta.channels + ch] ?? 0;
        chans.push(data);
      }
      assets.push({ meta, channels: chans });
      assetMap.set(meta.id, { id: meta.id, sampleRate: meta.sampleRate, channels: chans });
    }
    const tracksV3: DraftTrackPayload[] = [];
    for (const meta of trackMetas ?? []) {
      const clips =
        meta.clips ??
        [
          {
            id: `clip_${meta.id}`,
            assetId: `asset_${meta.id}`,
            start: 0,
            offset: 0,
            duration: meta.length,
          },
        ];
      const rendered = renderClipTrack({ clips }, assetMap);
      tracksV3.push({ meta, channels: rendered, clips });
    }
    return {
      header,
      channels: tracksV3[0]?.channels ?? channels,
      tracks: tracksV3,
      assets,
    };
  }

  if (!trackMetas) return { header, channels };

  // v2: split the block sequence per track; `channels` mirrors track 1
  const tracks: DraftTrackPayload[] = [];
  let at = 0;
  for (const meta of trackMetas) {
    const per = meta.length * meta.channels;
    const block = interleaved.subarray(at, at + per);
    at += per;
    const chans: Float32Array[] = [];
    for (let ch = 0; ch < meta.channels; ++ch) {
      const data = new Float32Array(meta.length);
      for (let i = 0; i < meta.length; ++i) data[i] = block[i * meta.channels + ch] ?? 0;
      chans.push(data);
    }
    tracks.push({ meta, channels: chans });
  }
  return { header, channels: tracks[0]?.channels ?? channels, tracks };
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
