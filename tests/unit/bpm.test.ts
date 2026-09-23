import { describe, expect, test } from 'vitest';
import { detectTempo, onsetEnvelope } from '../../src/engine/bpm';

const SR = 44100;

/** Click track: short decaying bursts at a given BPM, optional swing. */
function clickTrack(bpm: number, seconds: number): Float32Array {
  const len = Math.round(SR * seconds);
  const out = new Float32Array(len);
  const period = (60 / bpm) * SR;
  const clickLen = Math.round(SR * 0.012);
  for (let beat = 0; ; ++beat) {
    const at = Math.round(beat * period);
    if (at + clickLen >= len) break;
    for (let i = 0; i < clickLen; ++i) {
      const decay = 1 - i / clickLen;
      out[at + i] = Math.sin((2 * Math.PI * 1000 * i) / SR) * decay;
    }
  }
  return out;
}

function toStereo(mono: Float32Array): Float32Array[] {
  return [mono, mono];
}

describe('onsetEnvelope', () => {
  test('frame size is 10 ms and clicks produce peaks at beat positions', () => {
    const bpm = 120;
    const track = clickTrack(bpm, 4);
    const { envelope, frameSize } = onsetEnvelope(toStereo(track), SR);
    expect(frameSize).toBe(Math.round(SR * 0.01));
    const periodFrames = Math.round(60 / bpm / 0.01);
    // envelope peaks near beats 1..3 (beat 0 has no onset — audio starts there)
    for (const beat of [1, 2, 3]) {
      const center = beat * periodFrames;
      let windowMax = 0;
      for (let i = Math.max(0, center - 2); i <= center + 2; ++i) {
        windowMax = Math.max(windowMax, envelope[i] ?? 0);
      }
      expect(windowMax).toBeGreaterThan(0);
    }
  });

  test('constant tone (no onsets) yields a near-zero envelope', () => {
    const len = SR;
    const tone = new Float32Array(len);
    for (let i = 0; i < len; ++i) tone[i] = 0.4 * Math.sin((2 * Math.PI * 440 * i) / SR);
    const { envelope } = onsetEnvelope([tone], SR);
    const maxOnset = Math.max(...Array.from(envelope));
    expect(maxOnset).toBeLessThan(0.02);
  });
});

describe('detectTempo (±1 BPM gate on the test set)', () => {
  const CASES = [100, 110, 120, 130, 140];

  for (const bpm of CASES) {
    test(`click track at ${bpm} BPM is detected within ±1 BPM`, () => {
      const track = clickTrack(bpm, 10);
      const { envelope } = onsetEnvelope(toStereo(track), SR);
      const result = detectTempo(envelope, SR);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(Math.abs(result.bpm - bpm)).toBeLessThanOrEqual(1);
      // beat phase: first beat within one period of 0
      const periodSec = 60 / result.bpm;
      const firstBeat = result.beats[0] ?? -1;
      expect(firstBeat).toBeGreaterThanOrEqual(-0.001);
      expect(firstBeat).toBeLessThanOrEqual(periodSec + 0.05);
      // beat count ≈ duration / period
      expect(result.beats.length).toBeGreaterThanOrEqual(Math.floor(10 / periodSec) - 2);
      expect(result.beats.length).toBeLessThanOrEqual(Math.ceil(10 / periodSec) + 2);
    });
  }

  test('double-time ambiguity resolves toward the prior', () => {
    // 90 BPM clicks: the prior should not lock onto 180 (or 45)
    const track = clickTrack(90, 12);
    const { envelope } = onsetEnvelope(toStereo(track), SR);
    const result = detectTempo(envelope, SR);
    expect(Math.abs(result.bpm - 90)).toBeLessThanOrEqual(1);
  });

  test('60 s stereo detection completes fast enough for a worker (profiled)', () => {
    const track = clickTrack(124, 60);
    const t0 = performance.now();
    const { envelope } = onsetEnvelope(toStereo(track), SR);
    const result = detectTempo(envelope, SR);
    const elapsed = performance.now() - t0;
    // eslint-disable-next-line no-console
    console.info(
      `[profile] BPM 60 s stereo 44.1 kHz: ${elapsed.toFixed(0)} ms → ${result.bpm.toFixed(1)} BPM`,
    );
    expect(elapsed).toBeLessThan(3000);
    expect(Math.abs(result.bpm - 124)).toBeLessThanOrEqual(1);
  });
});
