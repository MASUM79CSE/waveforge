// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { conformToProjectRate } from '../../../src/app/projectActions';

const SR = 44100;

function ramp(n: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; ++i) out[i] = Math.sin((2 * Math.PI * 997 * i) / SR);
  return out;
}

describe('M8f+ import rate conformance', () => {
  test('same rate → identical arrays (no copy drift)', () => {
    const ch = [ramp(1000)];
    const out = conformToProjectRate(ch, SR, SR);
    expect(out[0]).toBe(ch[0]); // by reference — no resample work
  });

  test('48k → 44.1k shortens by the rate ratio (±0.1%)', () => {
    const n = 48000; // 1 s at 48k
    const out = conformToProjectRate([new Float32Array(n).fill(0.5)], 48000, SR);
    expect(Math.abs(out[0]!.length - 44100)).toBeLessThanOrEqual(44);
  });

  test('stereo channels stay length-locked after conform', () => {
    const out = conformToProjectRate([ramp(24000), ramp(24000)], 48000, SR);
    expect(out).toHaveLength(2);
    expect(out[0]!.length).toBe(out[1]!.length);
  });
});
