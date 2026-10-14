/**
 * PF-03 repair kernels (AM-09) — ports of the reference Audio Repair
 * contract: De-Click (spike detect + hermite), Edit Repair (DC-splice
 * detect + hermite), Hum Notch (Goertzel detect + RBJ notch cascade).
 * Kernels mutate their argument IN PLACE (reference-true: they run on a
 * region copy the action owns) and return the number of repairs.
 */
import { describe, expect, test } from 'vitest';
import {
  deClickChannel,
  goertzelMag,
  humNotchChannels,
  repairSpliceChannel,
  resolveHumFreq,
  type RepairSens,
} from '../../src/fx/repair';

const SR = 44100;

function sine(n: number, freq: number, amp: number, phase = 0): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; ++i) x[i] = amp * Math.sin((2 * Math.PI * freq * i) / SR + phase);
  return x;
}

function copied(x: Float32Array): Float32Array {
  return x.slice();
}

describe('deClickChannel', () => {
  test('clean sine: no repairs, bit-identical', () => {
    const x = sine(8192, 440, 0.5);
    const before = copied(x);
    expect(deClickChannel(x, SR, 'med')).toBe(0);
    expect([...x]).toEqual([...before]);
  });

  test('repairs an injected single-sample pop, leaves neighbours untouched', () => {
    const clean = sine(8192, 440, 0.5);
    const x = copied(clean);
    x[1000] = 0.9; // vinyl-style pop
    const count = deClickChannel(x, SR, 'med');
    expect(count).toBe(1);
    // the spike is gone: residual inside the repair window is far below it
    let residual = 0;
    for (let i = 998; i <= 1006; ++i) residual = Math.max(residual, Math.abs(x[i]! - clean[i]!));
    expect(residual).toBeLessThan(0.2);
    // outside the repair window the signal is BIT-identical
    for (let i = 0; i < 990; ++i) expect(x[i]).toBe(clean[i]);
    for (let i = 1015; i < x.length; ++i) expect(x[i]).toBe(clean[i]);
  });

  test('multiple pops all repaired', () => {
    const clean = sine(16384, 330, 0.4);
    const x = copied(clean);
    x[2000] = 0.85;
    x[9000] = -0.85;
    x[14000] = 0.8;
    expect(deClickChannel(x, SR, 'med')).toBe(3);
    for (const p of [2000, 9000, 14000]) {
      let residual = 0;
      for (let i = p - 6; i <= p + 6; ++i) residual = Math.max(residual, Math.abs(x[i]! - clean[i]!));
      expect(residual).toBeLessThan(0.2);
    }
  });

  test('sensitivity floor: tiny ripples are not clicks', () => {
    const x = sine(8192, 440, 0.5);
    const before = copied(x);
    for (let i = 100; i < 8000; i += 97) x[i] = x[i]! + 0.001;
    deClickChannel(x, SR, 'low');
    // low sensitivity floor is 0.03 — 0.001 perturbations must survive
    for (let i = 100; i < 8000; i += 97) expect(x[i]).toBeCloseTo(before[i]! + 0.001, 6);
  });

  test('too-short input: refused', () => {
    const x = sine(100, 440, 0.5);
    expect(deClickChannel(x, SR, 'med')).toBe(0);
  });
});

describe('repairSpliceChannel', () => {
  test('smooths a DC-offset splice between similar-energy audio', () => {
    const n = 16384;
    const x = new Float32Array(n);
    for (let i = 0; i < n; ++i) {
      const v = 0.4 * Math.sin((2 * Math.PI * 220 * i) / SR);
      x[i] = i < n / 2 ? v : v + 0.25; // DC step of 0.25 at the join
    }
    const before = copied(x);
    const count = repairSpliceChannel(x, SR, 'med');
    expect(count).toBe(1);
    const mid = n / 2;
    const seamMax = (a: Float32Array): number => {
      let m = 0;
      for (let i = mid - 8; i < mid + 8; ++i) m = Math.max(m, Math.abs(a[i]! - a[i - 1]!));
      return m;
    };
    expect(seamMax(x)).toBeLessThan(seamMax(before) * 0.6);
    // edges untouched
    expect(x[0]).toBe(before[0]);
    expect(x[n - 1]).toBe(before[n - 1]);
  });

  test('clean sine: nothing detected, bit-identical', () => {
    const x = sine(16384, 220, 0.4);
    const before = copied(x);
    expect(repairSpliceChannel(x, SR, 'med')).toBe(0);
    expect([...x]).toEqual([...before]);
  });

  test('too-short input: refused', () => {
    const x = sine(400, 220, 0.4);
    expect(repairSpliceChannel(x, SR, 'med')).toBe(0);
  });
});

describe('hum detection + notch cascade', () => {
  test('goertzelMag separates 60 Hz from 50 Hz', () => {
    const x = sine(8192, 60, 0.5);
    const m60 = goertzelMag(x, 60, SR, 8192);
    const m50 = goertzelMag(x, 50, SR, 8192);
    expect(m60).toBeGreaterThan(m50 * 100);
  });

  test('resolveHumFreq auto-locks to the actual mains frequency', () => {
    const n = SR; // 1 s
    const x = new Float32Array(n);
    for (let i = 0; i < n; ++i) {
      x[i] =
        0.4 * Math.sin((2 * Math.PI * 1000 * i) / SR) + 0.3 * Math.sin((2 * Math.PI * 60 * i) / SR);
    }
    // the reference fine-scan quantizes Goertzel bins (k = trunc(0.5+Nf/sr)),
    // so auto locks within ±0.5 Hz of the true mains — notch width at Q 12
    // is f/Q ≈ 5 Hz, so the worst-case offset is far inside the notch
    expect(Math.abs(resolveHumFreq(x, SR, 0, n, 'auto') - 60)).toBeLessThanOrEqual(0.5);
    expect(resolveHumFreq(x, SR, 0, n, '50')).toBe(50);
    expect(resolveHumFreq(x, SR, 0, n, '60')).toBe(60);
  });

  test('notch cascade kills the hum + harmonics, leaves programme audio', () => {
    const n = SR;
    const mk = (): Float32Array[] => {
      const l = new Float32Array(n);
      const r = new Float32Array(n);
      for (let i = 0; i < n; ++i) {
        const programme = 0.4 * Math.sin((2 * Math.PI * 1000 * i) / SR);
        const hum =
          0.35 * Math.sin((2 * Math.PI * 50 * i) / SR) +
          0.15 * Math.sin((2 * Math.PI * 150 * i) / SR) +
          0.1 * Math.sin((2 * Math.PI * 250 * i) / SR);
        l[i] = programme + hum;
        r[i] = programme + hum;
      }
      return [l, r];
    };
    const pre = mk();
    const post = mk();
    humNotchChannels(post, SR, 50);
    const p = (ch: Float32Array, f: number): number => goertzelMag(ch, f, SR, n);
    // hum fundamental + 3rd + 5th harmonics attenuated by >= 20 dB
    for (const f of [50, 150, 250]) {
      for (const ch of [0, 1]) expect(p(post[ch]!, f)).toBeLessThan(p(pre[ch]!, f) / 100);
    }
    // programme tone untouched within ~1 dB
    for (const ch of [0, 1]) expect(p(post[ch]!, 1000)).toBeGreaterThan(p(pre[ch]!, 1000) * 0.79);
  });

  test('sens type surface matches the reference contract', () => {
    const sens: RepairSens[] = ['low', 'med', 'high'];
    for (const s of sens) expect(deClickChannel(sine(8192, 440, 0.5), SR, s)).toBe(0);
  });
});
