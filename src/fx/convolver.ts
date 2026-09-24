/**
 * E4 pure partitioned overlap-save convolver (effects v2 plan §E4).
 * Uniform partitioned scheme, hop H = CONV_BLOCK, FFT size 2H: block q's
 * transform is the overlap-save window [x_{q−1} | x_q]; partition p of
 * the IR pairs with the window from p steps ago (y[qH+s] =
 * Σ_p Σ_b h[pH+b]·x[(q−p)H+s−b] — the block index absorbs the partition
 * delay, and the H-sample window history covers taps reaching into the
 * previous block). Output = second half of each inverse, wrap-free by
 * construction. All signals are real, so spectra are kept/accumulated
 * only over the conjugate-symmetric half. float64 accumulation; anchor
 * tests verify ≤1e-6 against direct convolution.
 *
 * The stereo entry packs both channels into ONE complex FFT per block
 * (re = left, im = right) and one packed inverse (B = Y_L + i·Y_R),
 * halving the transform count — the profiled hot path for Apply.
 */

import { Fft } from './fft';

export const CONV_BLOCK = 8192;
export const CONV_FFT = CONV_BLOCK * 2;
const HALF_BINS = CONV_FFT / 2 + 1;

function padTo(sig: Float32Array | Float64Array, len: number): Float64Array {
  const out = new Float64Array(len);
  out.set(sig.subarray(0, Math.min(sig.length, len)), 0);
  return out;
}

/**
 * Linear convolution y = sig ⊛ ir, truncated to sig.length. The caller
 * extends the signal with tail padding before calling (the fxActions
 * `tail` mechanism), so the truncation is where the wet tail lives.
 */
export function convolvePartitioned(
  sig: Float32Array | Float64Array,
  ir: Float32Array | Float64Array,
): Float64Array {
  const irLen = ir.length;
  const partitions = Math.max(1, Math.ceil(irLen / CONV_BLOCK));
  const fft = new Fft(CONV_FFT);

  const hRe: Float64Array[] = [];
  const hIm: Float64Array[] = [];
  {
    const padded = padTo(ir, partitions * CONV_BLOCK);
    const re = new Float64Array(CONV_FFT);
    const im = new Float64Array(CONV_FFT);
    for (let p = 0; p < partitions; ++p) {
      re.fill(0);
      im.fill(0);
      const base = p * CONV_BLOCK;
      for (let i = 0; i < CONV_BLOCK; ++i) re[i] = padded[base + i] ?? 0;
      fft.forward(re, im);
      const hr = new Float64Array(HALF_BINS);
      const hi = new Float64Array(HALF_BINS);
      for (let k = 0; k < HALF_BINS; ++k) {
        hr[k] = re[k]!;
        hi[k] = im[k]!;
      }
      hRe.push(hr);
      hIm.push(hi);
    }
  }

  // Spectral FIFO: frame p holds the window spectrum from p steps ago
  // (zeros = silence before the signal start).
  const fifoRe: Float64Array[] = Array.from(
    { length: partitions },
    () => new Float64Array(HALF_BINS),
  );
  const fifoIm: Float64Array[] = Array.from(
    { length: partitions },
    () => new Float64Array(HALF_BINS),
  );

  const out = new Float64Array(sig.length);
  const winRe = new Float64Array(CONV_FFT);
  const winIm = new Float64Array(CONV_FFT);
  const block = new Float64Array(CONV_BLOCK);
  const yRe = new Float64Array(HALF_BINS);
  const yIm = new Float64Array(HALF_BINS);
  const invRe = new Float64Array(CONV_FFT);
  const invIm = new Float64Array(CONV_FFT);

  for (let start = 0; start < sig.length; start += CONV_BLOCK) {
    const end = Math.min(sig.length, start + CONV_BLOCK);
    winRe.fill(0);
    winIm.fill(0);
    winRe.set(block, 0); // overlap-save window: [previous | current]
    block.fill(0);
    for (let i = start; i < end; ++i) {
      const v = sig[i] ?? 0;
      block[i - start] = v;
      winRe[CONV_BLOCK + (i - start)] = v;
    }
    fft.forward(winRe, winIm);

    const oldestRe = fifoRe.pop()!;
    const oldestIm = fifoIm.pop()!;
    for (let k = 0; k < HALF_BINS; ++k) {
      oldestRe[k] = winRe[k]!;
      oldestIm[k] = winIm[k]!;
    }
    fifoRe.unshift(oldestRe);
    fifoIm.unshift(oldestIm);

    for (let k = 0; k < HALF_BINS; ++k) yRe[k] = 0;
    for (let k = 0; k < HALF_BINS; ++k) yIm[k] = 0;
    for (let p = 0; p < partitions; ++p) {
      const fr = fifoRe[p]!;
      const fi = fifoIm[p]!;
      const hr = hRe[p]!;
      const hi = hIm[p]!;
      for (let k = 0; k < HALF_BINS; ++k) {
        yRe[k] = (yRe[k] ?? 0) + fr[k]! * hr[k]! - fi[k]! * hi[k]!;
        yIm[k] = (yIm[k] ?? 0) + fr[k]! * hi[k]! + fi[k]! * hr[k]!;
      }
    }
    // expand to the full conjugate-symmetric spectrum, then invert
    invRe[0] = yRe[0]!;
    invIm[0] = 0;
    invRe[CONV_FFT / 2] = yRe[CONV_FFT / 2]!;
    invIm[CONV_FFT / 2] = 0;
    for (let k = 1; k < CONV_FFT / 2; ++k) {
      invRe[k] = yRe[k]!;
      invIm[k] = yIm[k]!;
      invRe[CONV_FFT - k] = yRe[k]!;
      invIm[CONV_FFT - k] = -yIm[k]!;
    }
    fft.inverse(invRe, invIm);

    const copyEnd = Math.min(CONV_BLOCK, sig.length - start);
    for (let i = 0; i < copyEnd; ++i) out[start + i] = invRe[CONV_BLOCK + i]!;
  }
  return out;
}

/**
 * Stereo convolution with both channels packed into one complex FFT per
 * block (re = left, im = right) and one packed inverse (B = Y_L + i·Y_R
 * ⇒ re = outL, im = outR). Separation is exact via conjugate symmetry:
 * X_L(k) = (A(k) + conj(A(N−k)))/2, X_R(k) = (A(k) − conj(A(N−k)))/(2i).
 * Each channel keeps its own spectral FIFO so partition p pairs with the
 * window from p steps ago for BOTH channels. IRs are padded to a common
 * partition count; signal lengths must match.
 */
export function convolvePartitionedStereo(
  a: Float32Array | Float64Array,
  b: Float32Array | Float64Array,
  irA: Float32Array | Float64Array,
  irB: Float32Array | Float64Array,
): [Float64Array, Float64Array] {
  if (a.length !== b.length) throw new Error('stereo convolve: length mismatch');
  const irLen = Math.max(irA.length, irB.length);
  const partitions = Math.max(1, Math.ceil(irLen / CONV_BLOCK));
  const sigLen = a.length;
  const fft = new Fft(CONV_FFT);
  const half = CONV_FFT / 2;

  const irs = [padTo(irA, partitions * CONV_BLOCK), padTo(irB, partitions * CONV_BLOCK)];
  const hRe: Float64Array[][] = [[], []];
  const hIm: Float64Array[][] = [[], []];
  {
    const re = new Float64Array(CONV_FFT);
    const im = new Float64Array(CONV_FFT);
    for (let ch = 0; ch < 2; ++ch) {
      for (let p = 0; p < partitions; ++p) {
        re.fill(0);
        im.fill(0);
        const base = p * CONV_BLOCK;
        for (let i = 0; i < CONV_BLOCK; ++i) re[i] = irs[ch]![base + i] ?? 0;
        fft.forward(re, im);
        const hr = new Float64Array(HALF_BINS);
        const hi = new Float64Array(HALF_BINS);
        for (let k = 0; k < HALF_BINS; ++k) {
          hr[k] = re[k]!;
          hi[k] = im[k]!;
        }
        hRe[ch]!.push(hr);
        hIm[ch]!.push(hi);
      }
    }
  }

  // per-channel spectral FIFOs: frame p = window spectrum from p steps ago
  const mkFifo = (): Float64Array[] =>
    Array.from({ length: partitions }, () => new Float64Array(HALF_BINS));
  const fifoLRe = mkFifo();
  const fifoLIm = mkFifo();
  const fifoRRe = mkFifo();
  const fifoRIm = mkFifo();

  const outL = new Float64Array(sigLen);
  const outR = new Float64Array(sigLen);
  const winRe = new Float64Array(CONV_FFT);
  const winIm = new Float64Array(CONV_FFT);
  const blockL = new Float64Array(CONV_BLOCK);
  const blockR = new Float64Array(CONV_BLOCK);
  const ylRe = new Float64Array(HALF_BINS);
  const ylIm = new Float64Array(HALF_BINS);
  const yrRe = new Float64Array(HALF_BINS);
  const yrIm = new Float64Array(HALF_BINS);
  const invRe = new Float64Array(CONV_FFT);
  const invIm = new Float64Array(CONV_FFT);

  for (let start = 0; start < sigLen; start += CONV_BLOCK) {
    const end = Math.min(sigLen, start + CONV_BLOCK);
    winRe.fill(0);
    winIm.fill(0);
    for (let i = 0; i < CONV_BLOCK; ++i) {
      winRe[i] = blockL[i]!;
      winIm[i] = blockR[i]!;
    }
    blockL.fill(0);
    blockR.fill(0);
    for (let i = start; i < end; ++i) {
      const l = a[i] ?? 0;
      const r = b[i] ?? 0;
      blockL[i - start] = l;
      blockR[i - start] = r;
      winRe[CONV_BLOCK + (i - start)] = l;
      winIm[CONV_BLOCK + (i - start)] = r;
    }
    fft.forward(winRe, winIm);

    // separate packed window spectrum into per-channel half spectra
    const oLRe = fifoLRe.pop()!;
    const oLIm = fifoLIm.pop()!;
    const oRRe = fifoRRe.pop()!;
    const oRIm = fifoRIm.pop()!;
    // k = 0 special case: A(0) is complex for packed input, and the
    // per-channel DC bins are exactly real
    oLRe[0] = winRe[0]!;
    oLIm[0] = 0;
    oRRe[0] = winIm[0]!;
    oRIm[0] = 0;
    for (let k = 1; k < HALF_BINS; ++k) {
      const ar = winRe[k]!;
      const ai = winIm[k]!;
      const br = winRe[CONV_FFT - k]!;
      const bi = winIm[CONV_FFT - k]!;
      oLRe[k] = (ar + br) / 2; // X_L re
      oLIm[k] = (ai - bi) / 2; // X_L im
      oRRe[k] = (ai + bi) / 2; // X_R re
      oRIm[k] = (br - ar) / 2; // X_R im
    }
    fifoLRe.unshift(oLRe);
    fifoLIm.unshift(oLIm);
    fifoRRe.unshift(oRRe);
    fifoRIm.unshift(oRIm);

    for (let k = 0; k < HALF_BINS; ++k) {
      ylRe[k] = 0;
      ylIm[k] = 0;
      yrRe[k] = 0;
      yrIm[k] = 0;
    }
    for (let p = 0; p < partitions; ++p) {
      const flr = fifoLRe[p]!;
      const fli = fifoLIm[p]!;
      const frr = fifoRRe[p]!;
      const fri = fifoRIm[p]!;
      const hlr = hRe[0]![p]!;
      const hli = hIm[0]![p]!;
      const hrr = hRe[1]![p]!;
      const hri = hIm[1]![p]!;
      for (let k = 0; k < HALF_BINS; ++k) {
        const lr = flr[k]!, li = fli[k]!;
        ylRe[k] = (ylRe[k] ?? 0) + lr * hlr[k]! - li * hli[k]!;
        ylIm[k] = (ylIm[k] ?? 0) + lr * hli[k]! + li * hlr[k]!;
        const rr = frr[k]!, ri = fri[k]!;
        yrRe[k] = (yrRe[k] ?? 0) + rr * hrr[k]! - ri * hri[k]!;
        yrIm[k] = (yrIm[k] ?? 0) + rr * hri[k]! + ri * hrr[k]!;
      }
    }
    // packed inverse B = Y_L + i·Y_R (re = outL, im = outR);
    // DC and Nyquist: B_re = YL_re − YR_im, B_im = YL_im + YR_re
    invRe[0] = ylRe[0]!;
    invIm[0] = yrRe[0]!;
    invRe[half] = ylRe[half]!;
    invIm[half] = yrRe[half]!;
    for (let k = 1; k < half; ++k) {
      invRe[k] = ylRe[k]! - yrIm[k]!;
      invIm[k] = ylIm[k]! + yrRe[k]!;
      invRe[CONV_FFT - k] = ylRe[k]! + yrIm[k]!;
      invIm[CONV_FFT - k] = yrRe[k]! - ylIm[k]!;
    }
    fft.inverse(invRe, invIm);
    const copyEnd = Math.min(CONV_BLOCK, sigLen - start);
    for (let i = 0; i < copyEnd; ++i) {
      outL[start + i] = invRe[CONV_BLOCK + i]!;
      outR[start + i] = invIm[CONV_BLOCK + i]!;
    }
  }
  return [outL, outR];
}
