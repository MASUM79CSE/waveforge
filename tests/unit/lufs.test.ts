import { describe, expect, test } from 'vitest';
import { integrateLoudness, momentaryTrack } from '../../src/engine/lufs';

const SR = 48000;

function sine(dbfs: number, seconds: number, sampleRate = SR, freq = 997): Float32Array {
  const amp = 10 ** (dbfs / 20);
  const out = new Float32Array(Math.round(sampleRate * seconds));
  for (let i = 0; i < out.length; ++i) {
    out[i] = amp * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return out;
}

describe('integrateLoudness (BS.1770-4 anchors)', () => {
  test('EBU anchor: 997 Hz stereo sine at -23 dBFS → -23.0 LUFS (±0.5 gate)', () => {
    const { integrated } = integrateLoudness([sine(-23, 5), sine(-23, 5)], SR);
    expect(integrated).toBeGreaterThanOrEqual(-23.5);
    expect(integrated).toBeLessThanOrEqual(-22.5);
  });

  test('level linearity: -33 dBFS reads 10 LU lower', () => {
    const loud = integrateLoudness([sine(-23, 4), sine(-23, 4)], SR).integrated;
    const quiet = integrateLoudness([sine(-33, 4), sine(-33, 4)], SR).integrated;
    expect(loud - quiet).toBeGreaterThan(9.5);
    expect(loud - quiet).toBeLessThan(10.5);
  });

  test('mono sine at -23 dBFS reads ~3 dB below the stereo pair', () => {
    const mono = integrateLoudness([sine(-23, 4)], SR).integrated;
    const stereo = integrateLoudness([sine(-23, 4), sine(-23, 4)], SR).integrated;
    expect(stereo - mono).toBeGreaterThan(2.5);
    expect(stereo - mono).toBeLessThan(3.5);
  });

  test('K-weighting shape: HF shelf boosts 10 kHz above the 1 kHz gain', () => {
    const at1k = integrateLoudness([sine(-23, 3, SR, 1000), sine(-23, 3, SR, 1000)], SR).integrated;
    const at10k = integrateLoudness([sine(-23, 3, SR, 10000), sine(-23, 3, SR, 10000)], SR).integrated;
    expect(at10k - at1k).toBeGreaterThan(1); // shelf engaged
    expect(at10k - at1k).toBeLessThan(6); // RLB still active up there
  });

  function join(...parts: Float32Array[]): Float32Array {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Float32Array(total);
    let offset = 0;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }

  test('gate: silence around the program does not change integrated loudness', () => {
    const tone = sine(-23, 4);
    const silence = new Float32Array(SR * 8);
    const programOnly = integrateLoudness([tone, tone], SR).integrated;
    const padded = join(silence, tone, silence);
    const withSilence = integrateLoudness([padded, padded], SR).integrated;
    // 0.5 LU headroom: partially-toned edge blocks may flip gate membership
    expect(Math.abs(programOnly - withSilence)).toBeLessThan(0.5);
  });

  test('pure digital silence reports -Infinity', () => {
    const { integrated } = integrateLoudness([new Float32Array(SR * 2)], SR);
    expect(integrated).toBe(Number.NEGATIVE_INFINITY);
  });

  test('44.1 kHz design also hits the anchor (bilinear redesign)', () => {
    const { integrated } = integrateLoudness([sine(-23, 5, 44100), sine(-23, 5, 44100)], 44100);
    expect(integrated).toBeGreaterThanOrEqual(-23.5);
    expect(integrated).toBeLessThanOrEqual(-22.5);
  });
});

describe('momentary / short-term', () => {
  test('momentaryMax lands within 0.5 LU of integrated for a steady tone', () => {
    const result = integrateLoudness([sine(-23, 4), sine(-23, 4)], SR);
    expect(Math.abs(result.momentaryMax - result.integrated)).toBeLessThan(0.5);
    expect(Math.abs(result.shortTermMax - result.integrated)).toBeLessThan(0.3);
  });

  test('momentaryTrack yields 400 ms blocks at 75% overlap', () => {
    const track = momentaryTrack([sine(-23, 2), sine(-23, 2)], SR);
    // 2 s at 48k: hop = 0.1 s → ~16-17 blocks
    expect(track.length).toBeGreaterThanOrEqual(15);
    expect(track.length).toBeLessThanOrEqual(18);
    // blocks before the first full window are -Infinity (skipped)
    for (const value of track) {
      expect(value).toBeLessThan(-20);
      expect(value).toBeGreaterThan(-26);
    }
  });
});

describe('profiling gate (feeds §8.5 B1 trigger)', () => {
  test('60 s stereo LUFS integrates in under 2 s (measure + report)', () => {
    const left = sine(-20, 60);
    const right = sine(-23, 60);
    const t0 = performance.now();
    integrateLoudness([left, right], SR);
    const elapsed = performance.now() - t0;
    // eslint-disable-next-line no-console
    console.info(`[profile] LUFS 60 s stereo 48 kHz: ${elapsed.toFixed(0)} ms`);
    expect(elapsed).toBeLessThan(2000);
  });
});
