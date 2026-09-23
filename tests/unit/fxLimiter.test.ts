import { describe, expect, test } from 'vitest';
import { hardLimit } from '../../src/fx/limiter';

const SR = 8000;

function sine(amp: number, cycles: number, len: number): Float32Array {
  const out = new Float32Array(len);
  for (let i = 0; i < len; ++i) {
    out[i] = amp * Math.sin((2 * Math.PI * cycles * i) / len);
  }
  return out;
}

function peakOf(data: Float32Array): number {
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  return peak;
}

function chOf(channels: Float32Array[], i = 0): Float32Array {
  const ch = channels[i];
  if (!ch) throw new Error(`missing channel ${i}`);
  return ch;
}

describe('hardLimit kernel', () => {
  test('peaks above the ceiling are contained', () => {
    const out = hardLimit([sine(2, 20, 4000)], SR, {
      ceilingDb: 0,
      lookaheadMs: 15,
      releaseMs: 50,
    });
    const peak = peakOf(chOf(out));
    expect(peak).toBeLessThanOrEqual(1 + 1e-6);
    expect(peak).toBeGreaterThan(0.85); // limited, not crushed
  });

  test('signal already below the ceiling passes through bit-exact', () => {
    const ch = sine(0.5, 10, 2000);
    const out = hardLimit([ch], SR, { ceilingDb: 0, lookaheadMs: 15, releaseMs: 50 });
    expect(Array.from(chOf(out))).toEqual(Array.from(ch));
  });

  test('output is smooth (no sample-to-sample discontinuities)', () => {
    const out = hardLimit([sine(2, 40, 8000)], SR, {
      ceilingDb: -3,
      lookaheadMs: 10,
      releaseMs: 40,
    });
    const data = chOf(out);
    let maxDelta = 0;
    for (let i = 1; i < data.length; ++i) {
      maxDelta = Math.max(maxDelta, Math.abs((data[i] ?? 0) - (data[i - 1] ?? 0)));
    }
    expect(maxDelta).toBeLessThan(0.05);
  });

  test('stereo gain is linked (image preserved): loud L pulls quiet R down', () => {
    const loud = sine(2, 20, 4000);
    const quiet = sine(0.25, 20, 4000);
    const out = hardLimit([loud, quiet], SR, { ceilingDb: 0, lookaheadMs: 15, releaseMs: 50 });
    // loud channel limited toward the ceiling…
    expect(peakOf(chOf(out, 0))).toBeLessThanOrEqual(1 + 1e-6);
    // …and the quiet channel is attenuated too (shared gain), never amplified
    expect(peakOf(chOf(out, 1))).toBeLessThan(0.25);
  });

  test('empty input returns empty output', () => {
    const out = hardLimit([new Float32Array(0)], SR, {
      ceilingDb: 0,
      lookaheadMs: 15,
      releaseMs: 50,
    });
    expect(chOf(out)).toHaveLength(0);
  });

  test('release lets gain recover to unity after the loud section', () => {
    const len = 8000;
    const ch = new Float32Array(len);
    for (let i = 0; i < len; ++i) {
      ch[i] = (i < 1000 ? 2 : 0.2) * Math.sin((2 * Math.PI * 25 * i) / len);
    }
    const out = hardLimit([ch], SR, { ceilingDb: 0, lookaheadMs: 5, releaseMs: 20 });
    expect(peakOf(chOf(out).slice(0, 1000))).toBeLessThanOrEqual(1 + 1e-6); // burst limited
    // long after the burst the limiter is back at gain 1: tail peak ~= 0.2
    const tailPeak = peakOf(chOf(out).slice(6000, 7000));
    expect(tailPeak).toBeGreaterThan(0.195);
    expect(tailPeak).toBeLessThanOrEqual(0.201);
  });
});
