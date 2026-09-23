/**
 * M5 wiring kernels: spectrum band mapping, beat snapping, ID3 prepend.
 */
import { describe, expect, test } from 'vitest';
import { SPECTRUM_BANDS, bandBinEdges, bandLevel } from '../../src/engine/spectrum';
import { snapEdgeToBeat } from '../../src/engine/bpm';
import { buildId3Tag, parseId3, prependId3Tag } from '../../src/io/id3';

describe('spectrum band mapping', () => {
  test('edges are strictly increasing and end at binCount', () => {
    const edges = bandBinEdges(SPECTRUM_BANDS, 1024, 48000);
    expect(edges).toHaveLength(SPECTRUM_BANDS);
    for (let i = 1; i < edges.length; ++i) {
      expect(edges[i]!).toBeGreaterThan(edges[i - 1]!);
    }
    expect(edges[edges.length - 1]).toBe(1024);
  });

  test('first band starts above DC (20 Hz window)', () => {
    const edges = bandBinEdges(SPECTRUM_BANDS, 1024, 48000);
    // 48000/2/1024 = 23.4 Hz per bin → 20 Hz is within bin 1
    expect(edges[0]).toBeGreaterThanOrEqual(1);
    expect(edges[0]!).toBeLessThanOrEqual(2);
  });

  test('clamps to Nyquist when sample rate is low', () => {
    const edges = bandBinEdges(SPECTRUM_BANDS, 512, 8000); // Nyquist 4 kHz
    expect(edges[edges.length - 1]).toBe(512);
    for (let i = 1; i < edges.length; ++i) {
      expect(edges[i]!).toBeGreaterThan(edges[i - 1]!);
    }
  });

  test('bandLevel averages the byte window', () => {
    const data = new Uint8Array(10).fill(100);
    expect(bandLevel(data, 0, 10)).toBe(100);
    expect(bandLevel(data, 5, 5)).toBe(0); // empty band
    const mixed = Uint8Array.from([0, 0, 200, 200]);
    expect(bandLevel(mixed, 0, 4)).toBe(100);
  });
});

describe('snapEdgeToBeat', () => {
  const beats = [1.0, 1.5, 2.0, 2.5];

  test('snaps to the nearest beat within radius', () => {
    expect(snapEdgeToBeat(beats, 1.53, 0.08)).toBe(1.5);
    expect(snapEdgeToBeat(beats, 2.47, 0.08)).toBe(2.5);
  });

  test('leaves the position untouched beyond radius', () => {
    expect(snapEdgeToBeat(beats, 1.2, 0.08)).toBe(1.2);
    expect(snapEdgeToBeat(beats, 0.5, 0.08)).toBe(0.5);
    expect(snapEdgeToBeat([], 1.0, 0.08)).toBe(1.0);
  });

  test('prefers the closer of two neighbouring beats', () => {
    expect(snapEdgeToBeat(beats, 1.79, 0.08)).toBe(1.79); // midpoint, outside radius
    expect(snapEdgeToBeat(beats, 1.97, 0.08)).toBe(2.0);
  });
});

describe('prependId3Tag', () => {
  test('returns tag bytes followed by the mp3 payload', () => {
    const tag = buildId3Tag({ title: 'Sn' });
    const mp3 = Uint8Array.from([0xff, 0xfb, 0x90, 0x00]);
    const out = prependId3Tag(mp3, tag);
    expect(out.length).toBe(tag.byteLength + mp3.length);
    expect(out[0]).toBe(0x49); // 'I'
    expect(out[1]).toBe(0x44); // 'D'
    expect(out[2]).toBe(0x33); // '3'
    expect(Array.from(out.slice(out.length - 4))).toEqual([0xff, 0xfb, 0x90, 0x00]);
    // the composed bytes still parse back to the same title
    expect(parseId3(out)?.title).toBe('Sn');
  });

  test('does not mutate its inputs', () => {
    const tag = buildId3Tag({ artist: 'X' });
    const before = new Uint8Array(tag).slice();
    const mp3 = Uint8Array.from([1, 2, 3]);
    prependId3Tag(mp3, tag);
    expect(Array.from(new Uint8Array(tag))).toEqual(Array.from(before));
    expect(Array.from(mp3)).toEqual([1, 2, 3]);
  });
});
