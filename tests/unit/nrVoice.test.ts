import { describe, expect, test } from 'vitest';
import {
  ensureRnVoice,
  rnVoiceProcess,
  rnVoiceReady,
  rnvoiceFrameSize,
} from '../../src/fx/nrVoice';

const SR48 = 48000;

function noise(n: number, seed = 12345): Float32Array {
  let s = seed;
  const out = new Float32Array(n);
  for (let i = 0; i < n; ++i) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out[i] = (s / 0x3fffffff - 1) * 0.1; // ≈ −20 dBFS noise
  }
  return out;
}

function sine(hz: number, seconds: number, amp: number, sr = SR48): Float32Array {
  const out = new Float32Array(Math.round(sr * seconds));
  for (let i = 0; i < out.length; ++i) out[i] = amp * Math.sin((2 * Math.PI * hz * i) / sr);
  return out;
}

const rms = (a: Float32Array, from = 0, to = a.length): number => {
  let sum = 0;
  for (let i = from; i < to; ++i) sum += a[i]! * a[i]!;
  return Math.sqrt(sum / (to - from));
};

/** Warm the model once for the whole suite (idempotent). */
let ready: Promise<void> | null = null;
const boot = (): Promise<void> => (ready ??= ensureRnVoice());

describe('E7b — RNNoise contract', () => {
  test('loads lazily and exposes the 480-frame contract', async () => {
    await boot();
    expect(rnVoiceReady()).toBe(true);
    expect(rnvoiceFrameSize()).toBe(480);
  });

  test('determinism: same input, two fresh states → bit-identical output', async () => {
    await boot();
    const ch = [noise(SR48)];
    const a = rnVoiceProcess(ch, SR48, { mix: 1 })[0]!;
    const b = rnVoiceProcess(ch, SR48, { mix: 1 })[0]!;
    expect(a).toEqual(b);
  });

  test('digital silence → all-zero output', async () => {
    await boot();
    const out = rnVoiceProcess([new Float32Array(SR48)], SR48, { mix: 1 })[0]!;
    for (let i = 0; i < out.length; ++i) expect(out[i]).toBe(0);
  });

  test('noise suppression: −20 dBFS white noise drops ≥ 6 dB RMS', async () => {
    await boot();
    const input = noise(SR48 * 2);
    const out = rnVoiceProcess([input], SR48, { mix: 1 })[0]!;
    const drop = 20 * Math.log10(rms(input) / rms(out, SR48, out.length)); // tail = settled
    expect(drop).toBeGreaterThanOrEqual(6);
  }, 30_000);

  test('pitch preserved: periodicity + tone level survive suppression', async () => {
    await boot();
    const tone = sine(220, 2, 0.5);
    const hiss = noise(tone.length);
    const mixed = new Float32Array(tone.length);
    for (let i = 0; i < tone.length; ++i) mixed[i] = tone[i]! + hiss[i]! * 0.3;
    const out = rnVoiceProcess([mixed], SR48, { mix: 1 })[0]!;
    const tail = (x: Float32Array): Float32Array => x.slice(x.length - SR48);

    // autocorrelation peak lag = periodicity; 220 Hz -> lag ~218 samples
    const acfLag = (x: Float32Array): number => {
      let best = -2;
      let bestLag = 0;
      for (let lag = 96; lag <= 480; ++lag) {
        let s = 0;
        let e0 = 0;
        let e1 = 0;
        for (let i = 0; i < x.length - lag; ++i) {
          s += x[i]! * x[i + lag]!;
          e0 += x[i]! * x[i]!;
          e1 += x[i + lag]! * x[i + lag]!;
        }
        const r = s / (Math.sqrt(e0 * e1) + 1e-12);
        if (r > best) {
          best = r;
          bestLag = lag;
        }
      }
      return bestLag;
    };
    const lagWet = acfLag(tail(out));
    const lagRef = acfLag(tail(tone));
    expect(lagRef).toBeGreaterThanOrEqual(216);
    expect(lagRef).toBeLessThanOrEqual(220);
    expect(Math.abs(lagWet - lagRef)).toBeLessThanOrEqual(2);

    // tone magnitude survives within ~3 dB of its pre-suppression level
    const goertzel = (x: Float32Array): number => {
      const w = (2 * Math.PI * 220) / SR48;
      const c = 2 * Math.cos(w);
      let s1 = 0;
      let s2 = 0;
      for (let i = 0; i < x.length; ++i) {
        const s0 = x[i]! + c * s1 - s2;
        s2 = s1;
        s1 = s0;
      }
      return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / (x.length / 2);
    };
    expect(goertzel(tail(out))).toBeGreaterThan(0.7 * goertzel(tail(mixed)));

    // crossings converge to the tone's natural rate (2*f per second):
    // noise removal can only LOWER the noisy input's flip count toward it
    const flips = (x: Float32Array): number => {
      let c = 0;
      for (let i = 1; i < x.length; ++i) if (x[i - 1]! < 0 !== x[i]! < 0) ++c;
      return c;
    };
    const ref = flips(tail(tone));
    expect(Math.abs(flips(tail(out)) - ref)).toBeLessThanOrEqual(0.25 * ref);
  }, 30_000);

  test('chunk invariance: streamed chunks stitch bit-identically to one-shot', async () => {
    await boot();
    const input = noise(SR48 + 137); // deliberately off-frame-aligned
    const oneShot = rnVoiceProcess([input], SR48, { mix: 1 })[0]!;

    const { createRnVoiceStream } = await import('../../src/fx/nrVoice');
    const stream = createRnVoiceStream();
    const pieces: Float32Array[] = [];
    for (let off = 0; off < input.length; off += 997) {
      pieces.push(...stream.process([input.slice(off, Math.min(input.length, off + 997))]));
    }
    pieces.push(...stream.flush());
    stream.dispose();
    const stitched = new Float32Array(input.length);
    let at = 0;
    for (const p of pieces) {
      stitched.set(p.subarray(0, Math.min(p.length, input.length - at)), at);
      at += p.length;
    }
    expect(stitched).toEqual(oneShot);
  }, 30_000);

  test('mix law: 0 → bit-exact passthrough; 1 → pure wet', async () => {
    await boot();
    const ch = [noise(480 * 20)];
    const wet = rnVoiceProcess(ch, SR48, { mix: 1 })[0]!;
    const dry = rnVoiceProcess(ch, SR48, { mix: 0 })[0]!;
    expect(dry).toEqual(ch[0]);
    expect(rnVoiceProcess(ch, SR48, { mix: 1 })[0]).toEqual(wet);
  });

  test('44.1 kHz round trip: output length == input length', async () => {
    await boot();
    const len = 44100 + 137; // deliberately not frame-aligned
    const out = rnVoiceProcess([noise(len)], 44100, { mix: 1 })[0]!;
    expect(out.length).toBe(len);
  }, 30_000);

  test('stereo: both channels processed independently (image preserved)', async () => {
    await boot();
    const l = noise(480 * 40, 1);
    const r = noise(480 * 40, 2);
    const out = rnVoiceProcess([l, r], SR48, { mix: 1 });
    expect(out).toHaveLength(2);
    // distinct inputs → distinct outputs, but same length
    expect(out[0]!.length).toBe(l.length);
    let differ = 0;
    for (let i = 0; i < 1000; ++i) if (out[0]![i] !== out[1]![i]) ++differ;
    expect(differ).toBeGreaterThan(900);
  }, 30_000);
});
