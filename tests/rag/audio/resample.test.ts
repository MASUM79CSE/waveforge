import { describe, expect, it } from 'vitest';
import {
  KERNEL_HALF_WIDTH,
  Resampler,
  WHISPER_RATE,
  mixToMono,
  resample,
} from '../../../src/rag/audio/resample';

/** Deterministic pseudo-noise (xorshift) — reproducible test signal. */
function noise(n: number, seed = 0x9e3779b9): Float32Array {
  let s = seed | 0;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    out[i] = ((s >>> 0) / 0xffffffff) * 2 - 1;
  }
  return out;
}

function sine(freq: number, rate: number, seconds: number, amp = 0.5): Float32Array {
  const n = Math.round(rate * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / rate);
  return out;
}

/** Frequency (Hz) of the dominant tone via zero-crossing count, mid 60%. */
function zeroCrossFreq(x: Float32Array, rate: number): number {
  const a = Math.floor(x.length * 0.2);
  const b = Math.floor(x.length * 0.8);
  let crossings = 0;
  for (let i = a + 1; i < b; i++) {
    const prev = x[i - 1] ?? 0;
    const cur = x[i] ?? 0;
    if (prev <= 0 && cur > 0) crossings++;
  }
  const span = (b - a) / rate;
  // rising crossings only → one per cycle
  return crossings / span;
}

function rms(x: Float32Array, from = 0.2, to = 0.8): number {
  const a = Math.floor(x.length * from);
  const b = Math.floor(x.length * to);
  let s = 0;
  for (let i = a; i < b; i++) s += (x[i] ?? 0) * (x[i] ?? 0);
  return Math.sqrt(s / Math.max(1, b - a));
}

describe('P2.1 resampler kernel', () => {
  it('exports the Whisper target rate', () => {
    expect(WHISPER_RATE).toBe(16000);
    expect(KERNEL_HALF_WIDTH).toBeGreaterThan(0);
  });

  it('mixToMono averages stereo sample-exactly', () => {
    const l = new Float32Array([0.0, 0.5, -0.25, 1]);
    const r = new Float32Array([0.0, -0.5, 0.75, 0]);
    const m = mixToMono([l, r]);
    expect(Array.from(m)).toEqual([0, 0, 0.25, 0.5]);
  });

  it('mixToMono handles >2 channels and empty input', () => {
    const a = new Float32Array([1, 1]);
    const b = new Float32Array([0, 3]);
    const c = new Float32Array([2, 2]);
    expect(Array.from(mixToMono([a, b, c]))).toEqual([1, 2]);
    expect(mixToMono([]).length).toBe(0);
  });

  it('one-shot output length matches round(N·dst/src) ±1 (down 48k, 44.1k; up 8k)', () => {
    const n = 47_999; // deliberately odd
    for (const src of [48_000, 44_100, 8_000]) {
      const out = resample(new Float32Array(n), src, 16_000);
      expect(Math.abs(out.length - Math.round((n * 16_000) / src))).toBeLessThanOrEqual(1);
    }
  });

  it('440 Hz sine 48k→16k keeps frequency within 1 Hz', () => {
    const out = resample(sine(440, 48_000, 2), 48_000);
    expect(Math.abs(zeroCrossFreq(out, 16_000) - 440)).toBeLessThan(1);
  });

  it('passband amplitude ripple ≤ 0.5 dB (in-band sine)', () => {
    const amp = 0.5;
    const out = resample(sine(440, 48_000, 2, amp), 48_000);
    const measured = rms(out) * Math.SQRT2; // sine RMS → peak
    const db = 20 * Math.log10(measured / amp);
    expect(Math.abs(db)).toBeLessThanOrEqual(0.5);
  });

  it('11 kHz tone 48k→16k is attenuated ≥ 50 dB (stopband)', () => {
    const amp = 0.5;
    const out = resample(sine(11_000, 48_000, 2, amp), 48_000);
    const residualPeak = rms(out) * Math.SQRT2;
    const db = 20 * Math.log10(residualPeak / amp);
    expect(db).toBeLessThanOrEqual(-50);
  });

  it('ultrasonic 20 kHz @48k leaves no >−50 dB alias spur in band', () => {
    const amp = 0.5;
    const out = resample(sine(20_000, 48_000, 2, amp), 48_000);
    const residualPeak = rms(out) * Math.SQRT2;
    const db = 20 * Math.log10(residualPeak / amp);
    expect(db).toBeLessThanOrEqual(-50);
  });

  it('streaming with prime-sized pushes is bitwise-identical to one-shot', () => {
    const src = 48_000;
    const x = new Float32Array(20_003);
    for (let i = 0; i < x.length; i++) {
      x[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / src) + 0.2 * Math.sin((2 * Math.PI * 3100 * i) / src);
    }
    const whole = resample(x, src);
    const r = new Resampler(src);
    const chunks: Float32Array[] = [];
    let pos = 0;
    for (const size of [1, 3, 7, 64, 333, 1024]) {
      while (pos + size <= x.length) {
        chunks.push(r.push(x.subarray(pos, pos + size)));
        pos += size;
      }
    }
    chunks.push(r.push(x.subarray(pos)));
    chunks.push(r.flush());
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const joined = new Float32Array(total);
    let o = 0;
    for (const c of chunks) {
      joined.set(c, o);
      o += c.length;
    }
    expect(joined.length).toBe(whole.length);
    expect(Array.from(joined)).toEqual(Array.from(whole));
  });

  it('flush drains the tail — nothing missing after end of input', () => {
    const x = noise(9_001);
    const out = resample(x, 48_000);
    // resampled length tracks input within ±1 output sample
    expect(Math.abs(out.length - Math.round((x.length * 16_000) / 48_000))).toBeLessThanOrEqual(1);
    // tail is real signal, not silence: last 5% correlates in energy with input tail
    expect(rms(out, 0.9, 1)).toBeGreaterThan(0.01);
  });

  it('empty input and empty pushes are safe', () => {
    const r = new Resampler(48_000);
    expect(r.push(new Float32Array(0)).length).toBe(0);
    expect(r.flush().length).toBe(0);
    expect(resample(new Float32Array(0), 48_000).length).toBe(0);
  });

  it('digital silence stays exactly zero', () => {
    const out = resample(new Float32Array(48_000), 48_000);
    for (const v of out) expect(v).toBe(0);
  });

  it('8k→16k upsampling preserves a 300 Hz tone and its amplitude', () => {
    const out = resample(sine(300, 8_000, 2), 8_000);
    expect(Math.abs(zeroCrossFreq(out, 16_000) - 300)).toBeLessThan(1);
    const measured = rms(out) * Math.SQRT2;
    expect(Math.abs(20 * Math.log10(measured / 0.5))).toBeLessThanOrEqual(0.5);
  });

  it('44100→16000 (irrational-ish ratio) keeps 440 Hz within 1 Hz', () => {
    const out = resample(sine(440, 44_100, 2), 44_100);
    expect(Math.abs(zeroCrossFreq(out, 16_000) - 440)).toBeLessThan(1);
  });

  it('finite input never produces NaN/Infinity', () => {
    const x = noise(50_000, 12345);
    x[10_000] = 1; // impulse
    x[20_000] = -1;
    const out = resample(x, 44_100);
    for (const v of out) expect(Number.isFinite(v)).toBe(true);
  });

  it('rejects invalid rates', () => {
    expect(() => new Resampler(0)).toThrow();
    expect(() => new Resampler(48_000, -1)).toThrow();
  });
});
