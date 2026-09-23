import { describe, expect, test } from 'vitest';
import { sanitizeFilename } from '../../src/io/exportName';
import { estimateExportBytes } from '../../src/io/exportName';
import { floatToInt16, interleaveToInt16 } from '../../src/io/exportName';
import { meterLevel } from '../../src/engine/meter';

describe('sanitizeFilename', () => {
  test('keeps normal names untouched', () => {
    expect(sanitizeFilename('My Song 2026')).toBe('My Song 2026');
  });

  test('strips path separators and control characters', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('etcpasswd'); // leading dots stripped (hidden-file optics)
    expect(sanitizeFilename('bad\u0000\u0007name')).toBe('badname');
    expect(sanitizeFilename('a/b\\c:d*e?f"g<h>i|')).toBe('abcdefghi');
  });

  test('collapses whitespace and dots at the edges', () => {
    expect(sanitizeFilename('  spaced  .wav ')).toBe('spaced  .wav');
    expect(sanitizeFilename('...')).toBe('untitled');
    expect(sanitizeFilename('')).toBe('untitled');
  });

  test('caps length with an ellipsis-free tail keep', () => {
    const long = sanitizeFilename('x'.repeat(300));
    expect(long.length).toBeLessThanOrEqual(120);
    expect(long).toBe('x'.repeat(120));
  });
});

describe('estimateExportBytes', () => {
  test('WAV scales with bit depth; MP3 by bitrate; FLAC between', () => {
    const seconds = 10;
    const ch = 2;
    const sr = 44100;
    const frames = seconds * sr;
    expect(estimateExportBytes('wav', 'pcm16', frames, ch, sr)).toBe(44 + frames * ch * 2);
    expect(estimateExportBytes('wav', 'pcm24', frames, ch, sr)).toBe(44 + frames * ch * 3);
    expect(estimateExportBytes('wav', 'float32', frames, ch, sr)).toBe(58 + frames * ch * 4);
    expect(estimateExportBytes('mp3', '320', frames, ch, sr)).toBe((320_000 / 8) * seconds);
    // FLAC is compressed: strictly smaller than raw 16-bit and above a floor
    const flac = estimateExportBytes('flac', '5', frames, ch, sr);
    expect(flac).toBeGreaterThan(frames * ch * 0.35);
    expect(flac).toBeLessThan(frames * ch * 2);
  });
});

describe('floatToInt16 / interleaveToInt16', () => {
  test('converts with clamp and round-half-away-from-zero for negatives', () => {
    const out = floatToInt16(new Float32Array([1, -1, 0.5, -0.4]));
    expect(Array.from(out)).toEqual([32767, -32768, 16384, -13107]);
  });

  test('interleaves stereo in frame order', () => {
    const out = interleaveToInt16([new Float32Array([1, 0]), new Float32Array([0, -1])]);
    expect(Array.from(out)).toEqual([32767, 0, 0, -32768]);
  });

  test('mono path returns a single interleaved channel', () => {
    const out = interleaveToInt16([new Float32Array([0.25])]);
    expect(Array.from(out)).toEqual([8192]);
  });
});

describe('meterLevel (peak + rms)', () => {
  test('silence is -Infinity peak', () => {
    const level = meterLevel(new Float32Array(128));
    expect(level.peakDb).toBe(Number.NEGATIVE_INFINITY);
    expect(level.rmsDb).toBe(Number.NEGATIVE_INFINITY);
  });

  test('full-scale sine hits ~0 dB peak and ~-3 dB RMS', () => {
    const data = new Float32Array(480);
    for (let i = 0; i < 480; ++i) data[i] = Math.sin((2 * Math.PI * 10 * i) / 480);
    const level = meterLevel(data);
    expect(level.peakDb).toBeCloseTo(0, 1);
    expect(level.rmsDb).toBeCloseTo(-3.01, 1);
  });

  test('clipped input reports positive peak dB', () => {
    const level = meterLevel(new Float32Array(16).fill(2));
    expect(level.peakDb).toBeGreaterThan(0);
  });
});
