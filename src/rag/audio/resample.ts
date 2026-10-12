/**
 * P2.1 — 16 kHz resampler kernel (pure, dependency-free, zero browser
 * APIs). Whisper-class ASR needs mono Float32 PCM at 16 kHz; the app
 * decodes at the file's own rate. Streaming design: feed arbitrary
 * blocks via `push()`, drain with `flush()` — output is bitwise-identical
 * to the one-shot helper for ANY block split, because each output sample
 * is a fixed-order sum over absolute input positions.
 *
 * Filter: windowed-sinc low-pass, Kaiser window (β=8), half-width
 * K=32 input samples. Cutoff fc = 1/max(1, step) in Nyquist units
 * (step = srcRate/dstRate): exact anti-alias when downsampling, pure
 * band-limited interpolation when upsampling. The window is tabulated
 * on a fixed 1024-point grid (deterministic; quantization ≈ 1e-3 dB).
 *
 * Cost: O(output·taps). P2 scale (minutes of audio) is fine; if it ever
 * matters, a polyphase phase-table is the drop-in optimization — the
 * public API will not change.
 */

export const WHISPER_RATE = 16_000;

/** Kaiser window β — ~80 dB sidelobes asymptotic. */
const BETA = 8;
/** Kernel half-width in input samples (64 effective taps). */
export const KERNEL_HALF_WIDTH = 32;

const WIN_GRID = 1024;
let WIN_TAB: Float64Array | null = null;

/** Modified Bessel first kind I0, series (converges fast for |x| ≤ 8). */
function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  for (let k = 1; k < 48; k++) {
    const f = x / (2 * k);
    term *= f * f;
    sum += term;
    if (term < 1e-14 * sum) break;
  }
  return sum;
}

/** Kaiser window w(r), r ∈ [-1, 1]; tabulated once, immutable after. */
function windowAt(r: number): number {
  if (WIN_TAB === null) {
    const tab = new Float64Array(WIN_GRID + 1);
    const i0 = besselI0(BETA);
    for (let i = 0; i <= WIN_GRID; i++) {
      const x = i / WIN_GRID;
      tab[i] = besselI0(BETA * Math.sqrt(Math.max(0, 1 - x * x))) / i0;
    }
    WIN_TAB = tab;
  }
  const a = Math.abs(r);
  if (a >= 1) return 0;
  const tab = WIN_TAB;
  return tab[Math.round(a * WIN_GRID)] ?? 0;
}

/**
 * Low-pass kernel at distance `tau` (input samples). Cutoff `fc` in
 * Nyquist units: h(τ) = fc·sinc(fc·τ)·w(τ/K).
 */
function kernel(tau: number, fc: number): number {
  const a = Math.abs(tau);
  if (a >= KERNEL_HALF_WIDTH) return 0;
  // h(τ) = fc·sinc(fc·τ)·w(τ/K); sin(π·fc·τ)/(π·τ) already contains the
  // fc of sinc(fc·τ) — the τ→0 limit is fc (window(0)=1).
  const sinc = tau === 0 ? fc : Math.sin(Math.PI * fc * tau) / (Math.PI * tau);
  return sinc * windowAt(tau / KERNEL_HALF_WIDTH);
}

/** Average N equal-length channels to mono. Never mutates the inputs. */
export function mixToMono(channels: readonly Float32Array[]): Float32Array {
  const first = channels[0];
  if (!first) return new Float32Array(0);
  const len = first.length;
  const out = new Float32Array(len);
  const n = channels.length;
  for (let i = 0; i < len; i++) {
    let s = 0;
    for (const ch of channels) s += ch[i] ?? 0;
    out[i] = s / n;
  }
  return out;
}

/** Streaming resampler. Block-split independent (see module doc). */
export class Resampler {
  /** Input samples per output sample (>1 = downsampling). */
  readonly step: number;
  /** Cutoff in Nyquist units of the input rate. */
  readonly fc: number;

  private buf: Float32Array = new Float32Array(0);
  /** Absolute input index of buf[0]. */
  private bufStart = 0;
  /** Absolute index of the next output sample. */
  private nextOut = 0;
  private inputCount = 0;
  private done = false;

  constructor(readonly srcRate: number, readonly dstRate: number = WHISPER_RATE) {
    if (!(srcRate > 0) || !(dstRate > 0)) {
      throw new Error(`invalid rates: src=${srcRate} dst=${dstRate}`);
    }
    this.step = srcRate / dstRate;
    this.fc = 1 / Math.max(1, this.step);
  }

  /** Feed a block; returns the output samples now fully determined. */
  push(block: Float32Array): Float32Array {
    if (this.done) throw new Error('resampler already flushed');
    if (block.length === 0) return new Float32Array(0);
    // keep only inputs the moving output window can still reach
    const reachFrom = Math.ceil(this.nextOut * this.step - KERNEL_HALF_WIDTH - 2);
    const keep = Math.max(0, reachFrom - this.bufStart);
    const tailLen = this.buf.length - keep;
    const merged = new Float32Array(tailLen + block.length);
    if (tailLen > 0) merged.set(this.buf.subarray(keep), 0);
    merged.set(block, tailLen);
    this.buf = merged;
    this.bufStart += keep;
    this.inputCount += block.length;
    return this.emit(false);
  }

  /** Signal end of input; drains outputs whose taps reach real samples. */
  flush(): Float32Array {
    if (this.done) return new Float32Array(0);
    this.done = true;
    if (this.inputCount === 0) return new Float32Array(0);
    return this.emit(true);
  }

  private canEmitAt(m: number, flushing: boolean): boolean {
    const t = m * this.step;
    if (flushing) return t <= this.inputCount - 1 + 1e-9; // no zero-tail past end
    return Math.floor(t + KERNEL_HALF_WIDTH) <= this.inputCount - 1;
  }

  private emit(flushing: boolean): Float32Array {
    let count = 0;
    while (this.canEmitAt(this.nextOut + count, flushing)) count++;
    const out = new Float32Array(count);
    const { step, fc, buf, bufStart } = this;
    for (let j = 0; j < count; j++) {
      const t = (this.nextOut + j) * step;
      const lo = Math.max(0, Math.ceil(t - KERNEL_HALF_WIDTH) - bufStart);
      const hi = Math.min(buf.length - 1, Math.floor(t + KERNEL_HALF_WIDTH) - bufStart);
      let acc = 0;
      for (let n = lo; n <= hi; n++) {
        acc += (buf[n] ?? 0) * kernel(t - (n + bufStart), fc);
      }
      out[j] = acc;
    }
    this.nextOut += count;
    return out;
  }
}

/** One-shot convenience: resample a mono buffer to `dstRate`. */
export function resample(mono: Float32Array, srcRate: number, dstRate: number = WHISPER_RATE): Float32Array {
  const r = new Resampler(srcRate, dstRate);
  const head = r.push(mono);
  const tail = r.flush();
  if (tail.length === 0) return head;
  const out = new Float32Array(head.length + tail.length);
  out.set(head, 0);
  out.set(tail, head.length);
  return out;
}
