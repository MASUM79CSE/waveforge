import { describe, expect, test } from 'vitest';
import { noiseGate } from '../../src/fx/gate';

const SR = 8000;

function tone(amp: number, len: number, phase = 0): Float32Array {
  const out = new Float32Array(len);
  for (let i = 0; i < len; ++i) {
    out[i] = amp * Math.sin((2 * Math.PI * 25 * i) / SR + phase);
  }
  return out;
}

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

function rms(data: Float32Array): number {
  let sum = 0;
  for (const v of data) sum += v * v;
  return Math.sqrt(sum / Math.max(1, data.length));
}

function chOf(channels: Float32Array[], i = 0): Float32Array {
  const ch = channels[i];
  if (!ch) throw new Error(`missing channel ${i}`);
  return ch;
}

describe('noiseGate kernel', () => {
  test('digital silence gates to digital silence', () => {
    const out = noiseGate([new Float32Array(1000)], SR, {
      thresholdDb: -50,
      ratio: 2.5,
      attackMs: 5,
      releaseMs: 100,
    });
    expect(Array.from(chOf(out))).toEqual(Array.from(new Float32Array(1000)));
  });

  test('signal above threshold passes essentially untouched', () => {
    const ch = tone(0.5, 4000);
    const out = noiseGate([ch], SR, { thresholdDb: -30, ratio: 3, attackMs: 1, releaseMs: 20 });
    // skip the first few ms of envelope/gain attack when comparing
    expect(rms(chOf(out).slice(200))).toBeGreaterThan(rms(ch.slice(200)) * 0.97);
    expect(rms(chOf(out).slice(200))).toBeLessThanOrEqual(rms(ch.slice(200)) * 1.001);
  });

  test('quiet tail below threshold is attenuated by the expansion ratio', () => {
    const loud = tone(0.5, 1000);
    const quiet = tone(0.001, 2000); // -54 dBFS, well under -30 dB threshold
    const loud2 = tone(0.5, 1000);
    const out = noiseGate([join(loud, quiet, loud2)], SR, {
      thresholdDb: -30,
      ratio: 3,
      attackMs: 1,
      releaseMs: 10,
    });
    const quietIn = rms(quiet.slice(600, 1800));
    const quietOut = rms(chOf(out).slice(1600, 2800));
    expect(quietOut / quietIn).toBeLessThan(0.02); // >= ~34 dB reduction
    expect(rms(chOf(out).slice(3300))).toBeGreaterThan(rms(loud2.slice(300)) * 0.9);
  });

  test('stereo gating is linked: gate key = loudest channel', () => {
    const loud = tone(0.5, 2000);
    const quiet = tone(0.002, 2000, Math.PI / 3);
    const out = noiseGate([loud, quiet], SR, {
      thresholdDb: -30,
      ratio: 3,
      attackMs: 1,
      releaseMs: 10,
    });
    // right channel would gate alone (0.002 < threshold) but follows the left
    expect(rms(chOf(out, 1).slice(400))).toBeGreaterThan(rms(quiet.slice(400)) * 0.9);
  });

  test('gain changes are smooth (no clicks at gate transitions)', () => {
    const sig = join(tone(0.5, 800), new Float32Array(800), tone(0.5, 800));
    const out = noiseGate([sig], SR, { thresholdDb: -30, ratio: 3, attackMs: 2, releaseMs: 30 });
    const data = chOf(out);
    let maxDelta = 0;
    for (let i = 1; i < data.length; ++i) {
      maxDelta = Math.max(maxDelta, Math.abs((data[i] ?? 0) - (data[i - 1] ?? 0)));
    }
    expect(maxDelta).toBeLessThan(0.12);
  });
});
