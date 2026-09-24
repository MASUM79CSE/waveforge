/**
 * E7 noise reduction v3 — "natural voice" (effects-nr-v3-plan.md). Pure
 * STFT kernel, deterministic. Same WOLA scaffolding as the E6a print
 * engine (2048/512 Hann², 4096-point FFT, noisy phase), upgraded decision
 * core:
 *
 *   1. Adaptive noise tracking (IMCRA-lite): per-bin noise PSD follows a
 *      speech-presence-gated smoothing — fast when absent (tracks drift),
 *      near-frozen when speech is present (never eats sustained tones).
 *      Init: learned print when provided, else first-8-frame per-bin
 *      minimum energy — so **no manual selection is required**.
 *   2. Decision-directed a priori SNR (Ephraim–Malah, α = 0.98): the
 *      historical fix for musical noise — the estimator is smooth by
 *      construction.
 *   3. Speech-presence probability p = ξ/(ξ+1) (temporally smoothed):
 *      a soft gate; speech bins are never hard-zeroed.
 *   4. Floored Wiener gain G = ξ/(1+ξ) with asymmetric temporal smoothing
 *      (fast rise / slower fall — onsets stay crisp) and ±1-bin
 *      log-domain frequency smoothing — no watery texture.
 *
 * `reduction` dB maps to the gain floor; 0 dB is the bit-exact bypass.
 */

import { Fft } from './fft';

const FRAME = 2048;
const HOP = 512;
const FFT_N = FRAME * 2;
const BINS = FFT_N / 2 + 1;

/** Decision-directed smoothing (Ephraim–Malah). */
const ALPHA_DD = 0.98;
/** Present-speech noise-PSD smoothing ceiling (soft-gated tracker). */
const LAMBDA_PRESENT = 0.98;
/** Init frames for the no-print minimum-energy noise seed. */
const INIT_FRAMES = 8;
/** Half-width of the local-median window for tonality-aware init. */
const INIT_MED_HALF = 8;
/** Bin energy vs its ±INIT_MED_HALF-bin neighbourhood median → narrowband. */
const NARROW_RATIO = 100;

export interface Nr3Params {
  /** Max suppression in dB → gain floor 10^(−dB/20). 0 = bit-exact bypass. */
  reduction: number;
  /** Adaptation speed 0..1 (UI); maps the noise-tracker time constant. */
  adapt: number;
}

/** Periodic Hann window (COLA at HOP). */
function hann(i: number): number {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FRAME);
}

function processChannel(ch: Float32Array, floor: number, lambdaBase: number, seed: Float32Array | null): Float32Array {
  const len = ch.length;
  const analysis = new Float64Array(FRAME);
  const synth = new Float64Array(FRAME);
  for (let i = 0; i < FRAME; ++i) {
    analysis[i] = hann(i);
    synth[i] = analysis[i]! * analysis[i]!;
  }

  const acc = new Float64Array(len);
  const winSum = new Float64Array(len);
  // Real-input FFT pair: both directions run as M-point complex transforms
  // on the packed signal z[j] = x[2j] + i·x[2j+1] — half the butterflies of
  // a naive 4096-point complex pass. Twiddles precomputed per channel.
  const fftHalf = new Fft(FFT_N >> 1);
  const M_HALF = FFT_N >> 1;
  const cosT = new Float64Array(M_HALF + 1);
  const sinT = new Float64Array(M_HALF + 1);
  for (let k = 0; k <= M_HALF; ++k) {
    cosT[k] = Math.cos((2 * Math.PI * k) / FFT_N);
    sinT[k] = Math.sin((2 * Math.PI * k) / FFT_N);
  }
  const zr = new Float64Array(M_HALF);
  const zi = new Float64Array(M_HALF);

  // forward: real x (in re[0..N-1], im ignored) → spectrum in re/im[0..M]
  const forwardReal = (): void => {
    for (let j = 0; j < M_HALF; ++j) {
      zr[j] = re[2 * j]!;
      zi[j] = re[2 * j + 1]!;
    }
    fftHalf.forward(zr, zi);
    // z = E + i·O → E[k] = (Z[k]+conj(Z[M−k]))/2, O = −i/2·(Z[k]−conj(Z[M−k])),
    // X[k] = E[k] + e^{−2πik/N}·O[k]  (k = 0..M; indices mod M)
    for (let k = 0; k <= M_HALF; ++k) {
      const kIdx = k % M_HALF;
      const km = (M_HALF - k) % M_HALF;
      const zkr = zr[kIdx]!;
      const zki = zi[kIdx]!;
      const zmr = zr[km]!;
      const zmi = zi[km]!;
      const er = 0.5 * (zkr + zmr);
      const ei = 0.5 * (zki - zmi);
      const or = 0.5 * (zki + zmi);
      const oi = 0.5 * (zmr - zkr);
      const wr = cosT[k]!;
      const wi = -sinT[k]!;
      re[k] = er + wr * or - wi * oi;
      im[k] = ei + wr * oi + wi * or;
    }
  };

  // inverse: conjugate-symmetric spectrum in re/im[0..M] → real x in re[0..N-1]
  const inverseReal = (): void => {
    // X[k+M] = conj(X[M−k]) → E[k] = (X[k]+conj(X[M−k]))/2, O[k] = (X[k]−conj(X[M−k]))/(2W[k]);
    // z[k] = E[k] + i·O[k]; IFFT_M(z) gives packed x (Fft.inverse scales by 1/M).
    for (let k = 0; k < M_HALF; ++k) {
      const km = (M_HALF - k) % M_HALF;
      const xkr = re[k]!;
      const xki = im[k]!;
      const xmr = re[km]!;
      const xmi = im[km]!;
      const er = 0.5 * (xkr + xmr);
      const ei = 0.5 * (xki - xmi);
      const dr = 0.5 * (xkr - xmr);
      const di = 0.5 * (xki + xmi);
      const c = cosT[k]!;
      const s = sinT[k]!;
      // 1/W = c + i·s → O = (dr + i·di)(c + i·s)
      const or = dr * c - di * s;
      const oi = dr * s + di * c;
      zr[k] = er - oi;
      zi[k] = ei + or;
    }
    fftHalf.inverse(zr, zi);
    for (let j = 0; j < M_HALF; ++j) {
      re[2 * j] = zr[j]!;
      re[2 * j + 1] = zi[j]!;
    }
  };

  const re = new Float64Array(FFT_N);
  const im = new Float64Array(FFT_N);

  // per-bin state (Float64 throughout)
  const noisePsd = new Float64Array(BINS);
  const gainPrev = new Float64Array(BINS).fill(1);
  const xiPrev = new Float64Array(BINS); // a priori SNR memory
  const pSmooth = new Float64Array(BINS); // speech-presence smoothing
  const gSm = new Float64Array(BINS).fill(1); // temporal gain smoothing
  const initTonal = new Uint8Array(BINS); // latched: tonal at init (from t0)
  const y2buf = new Float64Array(BINS); // scratch for the narrowband map
  const narrowScratch = new Uint8Array(BINS);
  let inited = seed !== null;

  if (seed) {
    for (let k = 0; k < BINS; ++k) {
      const s = seed[k] ?? 0;
      noisePsd[k] = s * s * 0.5; // print magnitudes → PSD (Hann coherent gain ≈ 0.5)
    }
  } else {
    noisePsd.fill(Number.POSITIVE_INFINITY); // running minimum until the latch
  }

  /** Local median over ±INIT_MED_HALF bins (tonality-aware init). */
  const localMedian = (arr: Float64Array, k: number): number => {
    const vals: number[] = [];
    for (let j = Math.max(0, k - INIT_MED_HALF); j <= Math.min(BINS - 1, k + INIT_MED_HALF); ++j) {
      const v = arr[j] ?? 0;
      if (Number.isFinite(v)) vals.push(v);
    }
    if (vals.length === 0) return 0;
    vals.sort((a, b) => a - b);
    return vals[Math.floor(vals.length / 2)] ?? 0;
  };

  for (let s = 0; s < len; s += HOP) {
    re.fill(0);
    im.fill(0);
    const end = Math.min(len, s + FRAME);
    for (let i = s; i < end; ++i) re[i - s] = (ch[i] ?? 0) * analysis[i - s]!;
    forwardReal();

    // Frame-local narrowband map: bins whose current energy stands far
    // above their neighbourhood median are tones/harmonics this frame.
    // 4-tap median at ±6/±10 bins (outside a tone's ±4-bin mainlobe,
    // independent draws on stationary noise). Recomputed every 2nd frame
    // — tones are sustained; one skipped frame of tracking is inaudible.
    const narrow = narrowScratch;
    if (inited && ((s / HOP) & 1) === 0) {
      for (let k = 0; k < BINS; ++k) y2buf[k] = re[k]! * re[k]! + im[k]! * im[k]!;
      for (let k = 0; k < BINS; ++k) {
        const a = y2buf[k > 10 ? k - 10 : 0]!;
        const b = y2buf[k > 6 ? k - 6 : 0]!;
        const c = y2buf[k + 6 < BINS ? k + 6 : BINS - 1]!;
        const d = y2buf[k + 10 < BINS ? k + 10 : BINS - 1]!;
        const lo = Math.max(Math.min(a, b), Math.min(c, d));
        const hi = Math.min(Math.max(a, b), Math.max(c, d));
        const med = 0.5 * (lo + hi);
        narrow[k] = y2buf[k]! > NARROW_RATIO * (med || 1e-30) ? 1 : 0;
      }
    }

    // Init pass (no print): pure min-tracking, audio passes untouched.
    if (!inited) {
      for (let k = 0; k < BINS; ++k) {
        const kr = re[k]!;
        const ki = im[k]!;
        const y2 = kr * kr + ki * ki;
        if (y2 < noisePsd[k]!) noisePsd[k] = y2;
      }
    } else {
    // Normal path: adaptive estimation + floored Wiener gain.
    for (let k = 0; k < BINS; ++k) {
      const kr = re[k]!;
      const ki = im[k]!;
      const y2 = kr * kr + ki * ki;

      // --- a posteriori SNR, decision-directed a priori SNR ---
      const noiseFloor = Math.max(noisePsd[k]!, 1e-30);
      const gamma = y2 / noiseFloor;
      const gPrev2 = gainPrev[k]! * gainPrev[k]!;
      const xi =
        ALPHA_DD * xiPrev[k]! * gPrev2 + (1 - ALPHA_DD) * Math.max(gamma - 1, 0);

      // --- speech presence ---
      const pRaw = xi / (xi + 1);
      const p = 0.6 * pSmooth[k]! + 0.4 * pRaw;
      pSmooth[k] = p;

      // --- Wiener gain, floored ---
      let g = xi / (xi + 1);
      if (g < floor) g = floor;

      // --- asymmetric temporal smoothing: fast up / slower down ---
      const rise = 0.67;
      const fall = 0.4;
      const coef = g >= gSm[k]! ? rise : fall * (1 - 0.5 * (1 - p)); // slower fall when speech likely
      gSm[k] = gSm[k]! + coef * (g - gSm[k]!);

      // --- ±1-bin frequency smoothing (linear; edges clamp) ---
      const gL = k > 0 ? gSm[k - 1]! : gSm[k]!;
      const gR = k + 1 < BINS ? gSm[k + 1]! : gSm[k]!;
      const gFinal = 0.25 * gL + 0.5 * gSm[k]! + 0.25 * gR;

      // --- noise PSD update (gated by speech presence + narrowband
      //     protection): the estimate must never climb into speech/music ---
      if (initTonal[k] === 0 && narrow[k] === 0) {
        const lambda = lambdaBase + (LAMBDA_PRESENT - lambdaBase) * p;
        noisePsd[k] = lambda * noisePsd[k]! + (1 - lambda) * y2;
      }

      // --- memory for decision direction ---
      xiPrev[k] = xi;
      gainPrev[k] = gFinal;

      re[k] = kr * gFinal;
      im[k] = ki * gFinal;
    }
    }
    if (!inited && s >= (INIT_FRAMES - 1) * HOP) {
      // Tonality-aware init: bins standing far above their neighborhood's
      // median minimum (tones/hums present from t=0) inherit the local
      // median instead of their own energy.
      const mins = new Float64Array(BINS);
      for (let k = 0; k < BINS; ++k) mins[k] = noisePsd[k]!;
      for (let k = 0; k < BINS; ++k) {
        const med = localMedian(mins, k);
        const mine = mins[k] ?? 0;
        if (med > 0 && mine > 30 * med) {
          noisePsd[k] = med;
          initTonal[k] = 1;
        } else noisePsd[k] = mine;
      }
      inited = true;
    }

    // inverse + WOLA accumulate (inverseReal scatters the real signal)
    inverseReal();
    for (let i = 0; i < FRAME && s + i < len; ++i) {
      acc[s + i] = (acc[s + i] ?? 0) + re[i]! * synth[i]!;
      winSum[s + i] = (winSum[s + i] ?? 0) + analysis[i]! * synth[i]!;
    }
  }

  const out = new Float32Array(len);
  for (let i = 0; i < len; ++i) out[i] = acc[i]! / (winSum[i]! || 1);
  return out;
}

/**
 * NR v3. Output length == input length. `reduction <= 0` returns bit-exact
 * copies (bypass class). `seed` (learned print) is optional.
 */
export function nr3Process(
  channels: Float32Array[],
  params: Nr3Params,
  seed?: Float32Array,
): Float32Array[] {
  const reduction = Number.isFinite(params.reduction) ? params.reduction : 0;
  if (reduction <= 0) return channels.map((c) => c.slice());
  const adapt = Math.min(1, Math.max(0, params.adapt));
  // adapt 0 → slow tracking (λ 0.9), adapt 1 → fast (λ 0.6); default 0.5 → 0.75
  const lambdaBase = 0.9 - 0.3 * adapt;
  const floor = Math.pow(10, -reduction / 20);
  return channels.map((ch) => processChannel(ch, floor, lambdaBase, seed ?? null));
}
