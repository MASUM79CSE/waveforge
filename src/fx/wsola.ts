/**
 * E5 WSOLA time stretch + pitch shift (effects v2 plan §E5). Pure,
 * deterministic (no Math.random), length set by the stretch ratio alone.
 *
 * Waveform-Similarity Overlap-Add: output frames land on the synthesis
 * grid k·Hs; each frame reads the input at k·Ha + δ where a normalized
 * cross-correlation search over ±τ (tolerance window) picks the most
 * similar continuation of the previous frame — Hs = Ha·ratio, 46 ms Hann
 * frame, 50 % overlap-add with an exact per-sample window-sum denominator.
 * Transient protection: frames whose onset flux exceeds 3× the median skip
 * the search and take the onset-locked offset δ = (ratio−1)(k·Ha − t)
 * (clamped to ±τ), which places the onset sample EXACTLY at its ideal
 * stretched position t·ratio — drum hits stay on the grid, no smear.
 * Search cost is bounded with a ×3-decimated coarse pass + ±3 refine.
 *
 * Pitch shift n semitones = stretch by 2^(n/12) then resample by the same
 * factor (shipped linear-interpolation kernel) — duration preserved.
 * ratio 1 (and 0 semitones) is bit-exact pass-through.
 */

import { resample } from './resample';

/** 46 ms analysis frame (plan spec). */
const FRAME_SEC = 0.046;
/** ±10 ms tolerance window (plan spec). */
const TAU_SEC = 0.01;
/** Onset-flux threshold over the median (plan spec). */
const ONSET_FACTOR = 3;

/**
 * WSOLA stretch. ratio = output/input duration (×1.25 → 25 % longer).
 * Output length is exactly round(inLen·ratio).
 */
export function wsolaStretch(
  channels: Float32Array[],
  sampleRate: number,
  ratio: number,
): Float32Array[] {
  if (!Number.isFinite(ratio) || ratio <= 0) return channels.map((ch) => ch.slice());
  if (ratio === 1) return channels.map((ch) => ch.slice()); // bit-exact null

  const inLen = channels[0]?.length ?? 0;
  if (inLen === 0) return channels.map(() => new Float32Array(0));
  const outLen = Math.max(2, Math.round(inLen * ratio));

  const frame = Math.max(4, 2 * Math.round((FRAME_SEC * sampleRate) / 2)); // even
  const hs = frame >> 1; // 50 % overlap-add
  const ha = Math.max(1, Math.round(hs / ratio));
  const tau = Math.max(1, Math.round(TAU_SEC * sampleRate));

  // Hann analysis window + exact per-sample window-sum denominator
  const win = new Float64Array(frame);
  for (let i = 0; i < frame; ++i) {
    win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / frame);
  }

  // ---- onset map + correlation decision signal ----
  // SIGNED channel signal (channel 0). Correlating rectified audio locks
  // joins to the envelope period instead of the waveform period and
  // produces deep OLA cancellation holes — caught by the pitch anchor.
  const mono = channels[0] ?? new Float32Array(0);
  const framesCount = Math.floor((inLen - frame) / ha) + 1;
  const flux = new Float64Array(Math.max(1, framesCount));
  let prevEnergy = 0;
  for (let k = 0; k < framesCount; ++k) {
    let e = 0;
    const s = k * ha;
    const end = Math.min(inLen, s + hs);
    for (let i = s; i < end; ++i) e += mono[i]! ** 2; // i < end ≤ inLen
    flux[k] = Math.max(0, e - prevEnergy);
    prevEnergy = e;
  }
  const sorted = Float64Array.from(flux).sort();
  const median = sorted.length > 0 ? sorted[sorted.length >> 1]! : 0;
  const threshold = ONSET_FACTOR * median;

  /** Precise onset sample in frame k, or −1 when below threshold. */
  const onsetAt = (k: number): number => {
    if (k >= flux.length) return -1;
    const f = flux[k]!;
    if (f <= threshold || f <= 0) return -1;
    const s = k * ha;
    const end = Math.min(inLen - 1, s + hs);
    let best = -1;
    let bestVal = 0;
    for (let i = Math.max(1, s); i < end; ++i) {
      const d = Math.abs(mono[i]! - mono[i - 1]!); // 1 ≤ i ≤ inLen−1
      if (d > bestVal) {
        bestVal = d;
        best = i;
      }
    }
    return best;
  };

  const frameCountOut = Math.max(1, Math.ceil((outLen - frame) / hs) + 1);
  const acc = channels.map(() => new Float64Array(outLen));
  const winSum = new Float64Array(outLen);
  const ref = new Float64Array(hs); // template: previous frame's continuation
  let segE2 = 0; // template energy at ×3 decimation (fixed per frame)
  let haveTemplate = false;

  for (let k = 0; k < frameCountOut; ++k) {
    let delta = 0;
    const onset = onsetAt(k);
    if (onset >= 0) {
      // onset-locked: place the onset sample exactly at t·ratio
      delta = Math.round((ratio - 1) * (k * ha - onset));
      delta = Math.max(-tau, Math.min(tau, delta));
    } else {
      const ideal = k * ha;
      const lo = Math.max(0, ideal - tau);
      const hi = Math.min(inLen - frame, ideal + tau);
      if (hi > lo) {
        if (!haveTemplate) {
          delta = 0;
        } else {
          // normalized cross-correlation on SIGNED samples (abs-domain
          // matching loses phase and produces audibly rougher joins),
          // ×3-decimated coarse pass + ±3 refine at full resolution
          let bestScore = -Infinity;
          let bestDelta = lo;
          const step = 3;
          const dec = (start: number): number => {
            let dot = 0;
            let e2 = 0;
            for (let i = 0; i < hs; i += step) {
              const a = ref[i]!; // ref fully written; start+i < inLen
              const b = mono[start + i]!;
              dot += a * b;
              e2 += b * b;
            }
            return dot / (Math.sqrt(segE2 * e2) + 1e-12);
          };
          for (let start = lo; start <= hi; start += step) {
            const score = dec(start);
            if (score > bestScore) {
              bestScore = score;
              bestDelta = start;
            }
          }
          const refLo = Math.max(lo, bestDelta - step);
          const refHi = Math.min(hi, bestDelta + step);
          for (let start = refLo; start <= refHi; ++start) {
            const score = dec(start);
            if (score > bestScore) {
              bestScore = score;
              bestDelta = start;
            }
          }
          delta = bestDelta - ideal;
        }
      }
    }

    const readStart = Math.max(0, Math.min(inLen - frame, k * ha + delta));
    const outStart = k * hs;
    const copyEnd = Math.min(outLen, outStart + frame);
    for (let i = 0; i < copyEnd - outStart; ++i) {
      const w = win[i]!; // i < frame
      const v = readStart + i;
      for (let c = 0; c < channels.length; ++c) {
        acc[c]![outStart + i] = acc[c]![outStart + i]! + (channels[c]![v] ?? 0) * w;
      }
      winSum[outStart + i] = winSum[outStart + i]! + w; // index < outLen
    }

    // template for the next frame: the signal immediately AFTER this
    // frame's read — the natural continuation the next frame's head must
    // match (correlating against the frame's own second half would make
    // frames REPEAT content → half-period phase jumps → OLA holes)
    let e = 0;
    const tStart = readStart + frame;
    for (let i = 0; i < hs; ++i) {
      const v = mono[tStart + i] ?? 0;
      ref[i] = v;
      e += v * v * 9; // ×3 decimation energy of the same samples
    }
    segE2 = e;
    haveTemplate = tStart + hs <= inLen;
  }

  return channels.map((_, c) => {
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; ++i) out[i] = acc[c]![i]! / (winSum[i]! || 1);
    return out;
  });
}

/**
 * Pitch shift by n semitones with duration preserved: stretch by
 * 2^(n/12), then resample by the same factor (pitch × factor, length ÷
 * factor). 0 semitones is bit-exact.
 */
export function pitchShift(
  channels: Float32Array[],
  sampleRate: number,
  semitones: number,
): Float32Array[] {
  if (!Number.isFinite(semitones) || semitones === 0) return channels.map((ch) => ch.slice());
  const factor = Math.pow(2, semitones / 12);
  return resample(wsolaStretch(channels, sampleRate, factor), factor);
}
