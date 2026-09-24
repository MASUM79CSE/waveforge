/**
 * M6 RED: draft payload format WFD1/WFR1 — encode/decode round-trips,
 * compression fallback, hash identity, corruption rejection (zod boundary).
 */
import { describe, expect, test } from 'vitest';
import {
  decodeDraft,
  encodeDraft,
  encodeDraftTracks,
  hashPcm,
  type DraftTrackPayload,
} from '../../src/storage/draftPayload';

const HEADER = {
  v: 1 as const,
  name: 'take one',
  sampleRate: 44100,
  channels: 2 as const,
  length: 4,
  savedAt: 1700000000000,
  cursor: 1.5,
  selection: { start: 0.25, end: 2.75 },
};

function pcm(channels: 1 | 2, length: number): Float32Array[] {
  const out: Float32Array[] = [];
  for (let ch = 0; ch < channels; ++ch) {
    const data = new Float32Array(length);
    for (let i = 0; i < length; ++i) data[i] = Math.sin(i * (ch + 1) * 0.25);
    out.push(data);
  }
  return out;
}

describe('encodeDraft / decodeDraft (gzip path)', () => {
  test('round-trips header and PCM bit-exactly', async () => {
    const encoded = await encodeDraft(HEADER, pcm(2, 4), { compress: true });
    const decoded = await decodeDraft(encoded);
    expect(decoded.header).toEqual(HEADER);
    expect(decoded.channels.length).toBe(2);
    for (let ch = 0; ch < 2; ++ch) {
      expect(decoded.channels[ch]).toEqual(pcm(2, 4)[ch]); // bit-exact
    }
  });

  test('M7: noise print survives the round-trip (schema extension)', async () => {
    const print = [0.25, 0.5, 1.5, 0.75, 0.125];
    const encoded = await encodeDraft({ ...HEADER, noisePrint: print }, pcm(2, 4), {
      compress: true,
    });
    const decoded = await decodeDraft(encoded);
    expect(decoded.header.noisePrint).toEqual(print);
    // raw fallback path carries it too
    const raw = await encodeDraft({ ...HEADER, noisePrint: print }, pcm(2, 4), {
      compress: false,
    });
    const decodedRaw = await decodeDraft(raw);
    expect(decodedRaw.header.noisePrint).toEqual(print);
  });

  test('M7: legacy drafts (no print) decode with noisePrint undefined', async () => {
    const encoded = await encodeDraft(HEADER, pcm(2, 4), { compress: true });
    const decoded = await decodeDraft(encoded);
    expect(decoded.header.noisePrint).toBeUndefined();
  });

  test('gzip actually shrinks a quiet signal', async () => {
    const flat = [new Float32Array(64_000).fill(0.125)];
    const raw = await encodeDraft(HEADER, flat, { compress: false });
    const gz = await encodeDraft(HEADER, flat, { compress: true });
    expect(gz.length).toBeLessThan(raw.length / 2);
  });

  test('round-trips without optional fields (mono, no selection)', async () => {
    const encoded = await encodeDraft(
      { v: 1, name: 'm', sampleRate: 48000, channels: 1, length: 2, savedAt: 1 },
      pcm(1, 2),
      { compress: true },
    );
    const decoded = await decodeDraft(encoded);
    expect(decoded.header.selection).toBeUndefined();
    expect(decoded.header.cursor).toBeUndefined();
    expect(decoded.channels[0]).toEqual(pcm(1, 2)[0]);
  });
});

describe('decodeDraft corruption rejection (WF-E402 boundary)', () => {
  test('rejects a wrong magic', async () => {
    const encoded = await encodeDraft(HEADER, pcm(1, 2), { compress: false });
    const tampered = Uint8Array.from(encoded);
    tampered[0] = 0x58; // 'X' — no longer WFD1/WFR1
    await expect(decodeDraft(tampered)).rejects.toMatchObject({ code: 'WF-E402' });
  });

  test('rejects a truncated payload (PCM shorter than header claims)', async () => {
    const encoded = await encodeDraft(HEADER, pcm(1, 4), { compress: false });
    await expect(decodeDraft(encoded.subarray(0, encoded.length - 8))).rejects.toMatchObject({
      code: 'WF-E402',
    });
  });

  test('rejects a corrupt gzip stream', async () => {
    const encoded = await encodeDraft(HEADER, pcm(1, 2), { compress: true });
    const tampered = Uint8Array.from(encoded);
    tampered[tampered.length - 8] = 0xa5; // flip payload bytes inside the gzip
    await expect(decodeDraft(tampered)).rejects.toMatchObject({ code: 'WF-E402' });
  });

  test('rejects an invalid header (negative sample rate)', async () => {
    // hand-build a raw record with a schema-invalid header
    const header = JSON.stringify({ ...HEADER, sampleRate: -1 });
    const bytes = new TextEncoder().encode(header);
    const out = new Uint8Array(8 + bytes.length + 16);
    out.set([0x57, 0x46, 0x44, 0x31], 0); // 'WFD1'
    new DataView(out.buffer).setUint32(4, bytes.length, true);
    out.set(bytes, 8);
    await expect(decodeDraft(out)).rejects.toMatchObject({ code: 'WF-E402' });
  });
});

describe('raw-record path (no CompressionStream)', () => {
  test('WFR1 records round-trip identically', async () => {
    const encoded = await encodeDraft(HEADER, pcm(2, 4), { compress: false });
    expect(encoded[0]).toBe(0x57);
    expect(encoded[2]).toBe(0x52); // 'R' — raw provenance magic
    const decoded = await decodeDraft(encoded);
    expect(decoded.header.name).toBe(HEADER.name);
    expect(decoded.channels[1]).toEqual(pcm(2, 4)[1]);
  });
});

describe('hashPcm identity anchor (e2e flow #5)', () => {
  test('is stable across encode order and sensitive to content', async () => {
    const a = await hashPcm(pcm(2, 256));
    const b = await hashPcm(pcm(2, 256));
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16,64}$/);
    const different = await hashPcm([Float32Array.from({ length: 256 }, () => 0.5)]);
    expect(different).not.toBe(a);
  });

  test('hashes a mono and stereo layout differently', async () => {
    const mono = await hashPcm(pcm(1, 256));
    const stereo = await hashPcm(pcm(2, 256));
    expect(mono).not.toBe(stereo);
  });

  test('FNV-1a fallback covers platforms without WebCrypto', async () => {
    const original = globalThis.crypto;
    // hide subtle to force the fallback path
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {},
    });
    try {
      const fallback = await hashPcm(pcm(1, 64));
      expect(fallback).toMatch(/^[0-9a-f]{16}$/);
      const again = await hashPcm(pcm(1, 64));
      expect(again).toBe(fallback);
    } finally {
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: original,
      });
    }
  });
});

describe('M8e draft v2 — multitrack payload', () => {
  const base = { ...HEADER, v: 2 as const };

  function trackPayloads(): DraftTrackPayload[] {
    const a: DraftTrackPayload = {
      meta: { id: 't1', name: 'Voice', gain: 1, pan: 0, mute: false, solo: false, channels: 2, length: 4 },
      channels: pcm(2, 4),
    };
    const bl = new Float32Array(6).fill(-0.5);
    const b: DraftTrackPayload = {
      meta: { id: 't2', name: 'Guitar', gain: 0.5, pan: -1, mute: true, solo: true, channels: 1, length: 6 },
      channels: [bl],
    };
    return [a, b];
  }

  test('v2 round-trip: lanes + mixer state bit-exact; channels mirrors track 1', async () => {
    const tracks = trackPayloads();
    const encoded = await encodeDraftTracks(base, tracks, { compress: true });
    const decoded = await decodeDraft(encoded);
    expect(decoded.header.v).toBe(2);
    expect(decoded.tracks).toHaveLength(2);
    expect(decoded.channels).toEqual(tracks[0]!.channels);
    expect(decoded.tracks![0]!.meta).toEqual(tracks[0]!.meta);
    expect(decoded.tracks![1]!.meta).toEqual(tracks[1]!.meta);
    expect(decoded.tracks![1]!.channels[0]).toEqual(tracks[1]!.channels[0]);
  });

  test('v2 works through the raw (uncompressed) magic too', async () => {
    const encoded = await encodeDraftTracks(base, trackPayloads(), { compress: false });
    const decoded = await decodeDraft(encoded);
    expect(decoded.tracks).toHaveLength(2);
  });

  test('v1 payload still decodes without tracks (back-compat forever)', async () => {
    const encoded = await encodeDraft(HEADER, pcm(2, 4), { compress: true });
    const decoded = await decodeDraft(encoded);
    expect(decoded.header.v).toBe(1);
    expect(decoded.tracks).toBeUndefined();
    expect(decoded.channels).toEqual(pcm(2, 4));
  });
});
