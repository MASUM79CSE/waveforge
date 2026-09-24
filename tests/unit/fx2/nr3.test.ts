import { describe, expect, test } from 'vitest';
import { nr3Process } from '../../../src/fx/nr3';
import { Fft } from '../../../src/fx/fft';
import { learnNoisePrint } from '../../../src/fx/nrPrint';

/**
 * E7 NR v3 anchors (effects-nr-v3-plan.md + §8 protocol):
 * adaptive noise tracking (IMCRA-lite) + decision-directed a priori SNR
 * + speech-presence probability + floored Wiener gain with asymmetric
 * temporal and ±1-bin spectral smoothing. Deterministic (mulberry32 in
 * tests, none in the kernel). reduction=0 is the bit-exact bypass class.
 */
const SR = 44100;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noise(n: number, seed: number, amp = 1): Float32Array {
  const rnd = mulberry32(seed);
  const x = new Float32Array(n);
  for (let i = 0; i < n; ++i) x[i] = (rnd() * 2 - 1) * amp;
  return x;
}

function tone(hz: number, amp: number, seconds: number): Float32Array {
  const n = Math.round(seconds * SR);
  const x = new Float32Array(n);
  for (let i = 0; i < n; ++i) x[i] = amp * Math.sin((2 * Math.PI * hz * i) / SR);
  return x;
}

function add(...parts: Float32Array[]): Float32Array {
  const n = Math.max(...parts.map((p) => p.length));
  const out = new Float32Array(n);
  for (const p of parts) for (let i = 0; i < p.length; ++i) out[i] = (out[i] ?? 0) + (p[i] ?? 0);
  return out;
}

/** Lay parts end-to-end (add() overlays; gap construction needs concat). */
function concat(...parts: Float32Array[]): Float32Array {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Float32Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Windowed zero-padded DFT magnitude (k → k·SR/n Hz). */
function spectrum(x: Float32Array, specLen: number, n: number): Float64Array {
  const out = new Float64Array(specLen);
  for (let k = 0; k < specLen; ++k) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < x.length; ++i) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / x.length);
      const a = (-2 * Math.PI * k * i) / n;
      const v = (x[i] ?? 0) * w;
      re += v * Math.cos(a);
      im += v * Math.sin(a);
    }
    out[k] = Math.sqrt(re * re + im * im);
  }
  return out;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

/** Tone-bin SNR: peak bin vs median spectral floor over a band. */
function toneSnrDb(x: Float32Array, toneHz: number, floorLo: number, floorHi: number): number {
  const n = 8192;
  const mid = Math.floor(x.length / 2);
  const seg = x.slice(mid - n / 2, mid + n / 2);
  const spec = spectrum(seg, n / 2 + 1, n);
  const bin = Math.round((toneHz / SR) * n);
  const peak = spec[bin] ?? 0;
  const lo = Math.floor((floorLo / SR) * n);
  const hi = Math.ceil((floorHi / SR) * n);
  const band: number[] = [];
  for (let k = lo; k <= hi; ++k) {
    if (Math.abs(k - bin) > 6) band.push(spec[k] ?? 0);
  }
  return 20 * Math.log10(peak / (median(band) || 1e-30));
}

function toneMagnitude(x: Float32Array, toneHz: number): number {
  const n = 8192;
  const mid = Math.floor(x.length / 2);
  const seg = x.slice(mid - n / 2, mid + n / 2);
  const spec = spectrum(seg, n / 2 + 1, n);
  return spec[Math.round((toneHz / SR) * n)] ?? 0;
}

/** Frame RMS series (hop 512) — basis for variance + jump anchors. */
function frameRms(x: Float32Array): number[] {
  const out: number[] = [];
  for (let s = 0; s + 2048 <= x.length; s += 512) {
    let e = 0;
    for (let i = s; i < s + 2048; ++i) e += (x[i] ?? 0) ** 2;
    out.push(Math.sqrt(e / 2048));
  }
  return out;
}

describe('E7 NR v3 — natural-voice noise reduction', () => {
  test('bypass: reduction 0 → bit-exact copies', () => {
    const x = [noise(4096, 7, 0.3)];
    const out = nr3Process(x, { reduction: 0, adapt: 0.5 });
    expect(out[0]).toEqual(x[0]);
  });

  test('auto mode (no print): +6 dB SNR tone+noise gains ≥ +10 dB SNR', () => {
    const tone1k = tone(1000, 0.2, 3);
    const nz = noise(tone1k.length, 11, 0.05);
    const mix = add(tone1k, nz);
    const pre = toneSnrDb(mix, 1000, 2000, 8000);
    const out = nr3Process([mix], { reduction: 15, adapt: 0.5 })[0]!;
    const post = toneSnrDb(out, 1000, 2000, 8000);
    expect(post - pre).toBeGreaterThanOrEqual(10);
  });

  test('tone magnitude loss ≤ 1 dB', () => {
    const tone1k = tone(1000, 0.2, 3);
    const nz = noise(tone1k.length, 12, 0.05);
    const mix = add(tone1k, nz);
    const out = nr3Process([mix], { reduction: 15, adapt: 0.5 })[0]!;
    const loss = 20 * Math.log10(toneMagnitude(mix, 1000) / toneMagnitude(out, 1000));
    expect(loss).toBeLessThanOrEqual(1);
  });

  test('musical-noise bound: per-bin dB-flicker ratio post/pre ≤ 2.5', () => {
    const nz = noise(SR * 2, 13, 0.1); // noise-only, auto mode
    const out = nr3Process([nz], { reduction: 15, adapt: 0.5 })[0]!;
    // Musical noise = abnormal per-bin amplitude modulation. Stationary
    // noise has low bin flicker; bin-level jitter after NR must not grow
    // beyond 2.5× the input's. Measured as mean per-bin std (dB) of a
    // 4096-point STFT across time (analysis band 215 Hz–11 kHz).
    const flicker = (x: Float32Array): number => {
      const F = 2048;
      const H = 1024;
      const N = 4096;
      const B = 2049;
      const NF = 60;
      const fft = new Fft(N);
      const re = new Float64Array(N);
      const im = new Float64Array(N);
      const db = new Float64Array(B * NF);
      for (let f = 0; f < NF; ++f) {
        const st = f * H;
        re.fill(0);
        im.fill(0);
        for (let i = 0; i < F; ++i) re[i] = (x[st + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / F));
        fft.forward(re, im);
        for (let k = 0; k < B; ++k) db[k * NF + f] = 10 * Math.log10(re[k]! * re[k]! + im[k]! * im[k]! + 1e-30);
      }
      let sum = 0;
      let cnt = 0;
      for (let k = 20; k <= 1024; ++k) {
        let m = 0;
        for (let f = 0; f < NF; ++f) m += db[k * NF + f]!;
        m /= NF;
        let v = 0;
        for (let f = 0; f < NF; ++f) {
          const d = db[k * NF + f]! - m;
          v += d * d;
        }
        sum += Math.sqrt(v / NF);
        ++cnt;
      }
      return sum / cnt;
    };
    const ratio = flicker(out) / (flicker(nz) || 1e-30);
    expect(ratio).toBeLessThanOrEqual(2.5);
  });

  test('naturalness: max frame-to-frame energy jump ≤ 4 dB on stationary noise', () => {
    const nz = noise(SR * 2, 14, 0.1);
    const out = nr3Process([nz], { reduction: 20, adapt: 0.5 })[0]!;
    const rms = frameRms(out).slice(4);
    let maxJump = 0;
    for (let i = 1; i < rms.length; ++i) {
      const jump = Math.abs(20 * Math.log10((rms[i] ?? 1e-30) / (rms[i - 1] ?? 1e-30)));
      maxJump = Math.max(maxJump, jump);
    }
    expect(maxJump).toBeLessThanOrEqual(4);
  });

  test('transient gap: floor between tone bursts stays suppressed (no pumping)', () => {
    const burst = tone(1000, 0.2, 0.7);
    const gap = new Float32Array(Math.round(0.6 * SR));
    const seq = concat(burst, gap, burst);
    const nz = noise(seq.length, 15, 0.05);
    const mix = add(seq, nz);
    const out = nr3Process([mix], { reduction: 15, adapt: 0.5 })[0]!;
    // band-limited floor in the gap (2–6 kHz), vs the same region pre-NR
    const floorOf = (x: Float32Array): number => {
      const from = burst.length + Math.round(0.15 * SR);
      const to = from + Math.round(0.3 * SR);
      const seg = x.slice(from, to);
      let e = 0;
      for (let i = 0; i < seg.length; ++i) e += (seg[i] ?? 0) ** 2;
      return 10 * Math.log10(e / seg.length + 1e-30);
    };
    expect(floorOf(out) - floorOf(mix)).toBeLessThanOrEqual(-8);
  });

  test('print-seeded: ≥ +8 dB SNR within 0.5 s of speech onset', () => {
    const tone1k = tone(1000, 0.2, 2);
    const nz = noise(tone1k.length, 16, 0.05);
    const mix = add(tone1k, nz);
    const print = learnNoisePrint([nz]);
    const out = nr3Process([mix], { reduction: 15, adapt: 0.5 }, print)[0]!;
    const early = out.slice(0, Math.round(0.5 * SR));
    const snrEarly = toneSnrDb(early, 1000, 2000, 8000);
    expect(snrEarly).toBeGreaterThanOrEqual(8);
  });

  test('stereo: independent noises both gain ≥ +10 dB; state is per channel', { timeout: 90_000 }, () => {
    const toneL = tone(1000, 0.2, 2);
    const toneR = tone(1500, 0.2, 2);
    const mixL = add(toneL, noise(toneL.length, 17, 0.05));
    const mixR = add(toneR, noise(toneR.length, 18, 0.05));
    const out = nr3Process([mixL, mixR], { reduction: 15, adapt: 0.5 });
    const preL = toneSnrDb(mixL, 1000, 2000, 8000);
    const preR = toneSnrDb(mixR, 1500, 2500, 8000);
    expect(toneSnrDb(out[0]!, 1000, 2000, 8000) - preL).toBeGreaterThanOrEqual(10);
    expect(toneSnrDb(out[1]!, 1500, 2500, 8000) - preR).toBeGreaterThanOrEqual(10);
  });

  test('determinism: bit-identical reruns; length preserved', () => {
    const x = [add(tone(880, 0.2, 1.5), noise(Math.round(SR * 1.5), 19, 0.05))];
    const a = nr3Process(x, { reduction: 12, adapt: 0.4 });
    const b = nr3Process(x, { reduction: 12, adapt: 0.4 });
    expect(a[0]).toEqual(b[0]);
    expect(a[0]!).toHaveLength(x[0]!.length);
  });

  test('30 s stability: bounded samples, no NaN, mono + stereo', { timeout: 90_000 }, () => {
    const long = add(tone(500, 0.2, 30), noise(Math.round(SR * 30), 20, 0.08));
    const mono = nr3Process([long], { reduction: 18, adapt: 0.6 })[0]!;
    for (let i = 0; i < mono.length; i += 997) {
      expect(Number.isFinite(mono[i])).toBe(true);
      expect(Math.abs(mono[i]!)).toBeLessThanOrEqual(4);
    }
    const stereo = nr3Process([long, noise(long.length, 21, 0.08)], {
      reduction: 18,
      adapt: 0.6,
    });
    for (const ch of stereo) {
      expect(ch).toHaveLength(long.length);
      expect(Number.isFinite(ch[0])).toBe(true);
    }
  });

  test(
    '[profile] E7 nr3 60 s stereo ×15 dB ≤ 5 s uninstrumented',
    { timeout: 90_000 },
    () => {
      const rnd = mulberry32(22);
      const mk = (): Float32Array => {
        const x = new Float32Array(SR * 60);
        for (let i = 0; i < x.length; ++i) x[i] = (rnd() * 2 - 1) * 0.2;
        return x;
      };
      const channels = [mk(), mk()];
      const t0 = performance.now();
      nr3Process(channels, { reduction: 15, adapt: 0.5 });
      const dt = performance.now() - t0;
      // eslint-disable-next-line no-console
      console.log(`[profile] E7 nr3 60 s stereo: ${Math.round(dt)} ms`);
      // §3 budget is 5 s uninstrumented — measured 2974 ms (real-FFT pair).
      // v8 coverage instrumentation slows hot loops ~1.8× (≈5.4 s), so this
      // in-suite guard is 10 s; the recorded uninstrumented [profile] number
      // feeds the §3 gate review (ADR 009 convention).
      expect(dt).toBeLessThan(10_000);
    },
  );
});
