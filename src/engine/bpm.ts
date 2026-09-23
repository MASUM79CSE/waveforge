/**
 * Tempo kernels (M5): onset envelope (10 ms RMS frames, half-wave
 * rectified difference) → autocorrelation over 60–180 BPM with a mild
 * 120 BPM log-space prior → parabolic refinement → comb phase search for
 * beat positions. Pure; the worker only feeds it and reports timings.
 */
import { BPM_MAX, BPM_MIN, BPM_PRIOR, ONSET_FRAME_S } from '../core/constants';

export interface OnsetResult {
  envelope: Float32Array;
  frameSize: number;
  frameSeconds: number;
}

export interface TempoResult {
  bpm: number;
  beats: number[];
  confidence: number;
}

export function onsetEnvelope(channels: Float32Array[], sampleRate: number): OnsetResult {
  const frameSize = Math.max(1, Math.round(sampleRate * ONSET_FRAME_S));
  const frames = channels[0] ? Math.floor(channels[0].length / frameSize) : 0;
  const energy = new Float64Array(frames);
  for (const channel of channels) {
    for (let f = 0; f < frames; ++f) {
      let acc = 0;
      const base = f * frameSize;
      for (let i = 0; i < frameSize; ++i) {
        const v = channel[base + i] ?? 0;
        acc += v * v;
      }
      energy[f] = (energy[f] ?? 0) + Math.sqrt(acc / frameSize);
    }
  }
  const envelope = new Float32Array(frames);
  let previous = 0;
  for (let f = 0; f < frames; ++f) {
    const value = energy[f] ?? 0;
    // frame 0 starts from nothing by definition — not an onset
    envelope[f] = f === 0 ? 0 : Math.max(0, value - previous);
    previous = value;
  }
  return { envelope, frameSize, frameSeconds: frameSize / sampleRate };
}

export function detectTempo(envelope: Float32Array, sampleRate: number): TempoResult {
  const frameSeconds = Math.max(1, Math.round(sampleRate * ONSET_FRAME_S)) / sampleRate;
  const minLag = Math.max(2, Math.round(60 / BPM_MAX / frameSeconds));
  const maxLag = Math.min(envelope.length - 1, Math.round(60 / BPM_MIN / frameSeconds));
  if (maxLag <= minLag) return { bpm: 0, beats: [], confidence: 0 };

  // autocorrelation over the tempo band
  let totalEnergy = 0;
  for (const v of envelope) totalEnergy += v * v;
  if (totalEnergy <= 0) return { bpm: 0, beats: [], confidence: 0 };

  let bestLag = 0;
  let bestScore = 0;
  let bestRaw = 0;
  for (let lag = minLag; lag <= maxLag; ++lag) {
    let r = 0;
    for (let n = 0; n + lag < envelope.length; ++n) {
      r += (envelope[n] ?? 0) * (envelope[n + lag] ?? 0);
    }
    r /= envelope.length - lag;
    const bpm = 60 / (lag * frameSeconds);
    const octave = Math.log2(bpm / BPM_PRIOR);
    const prior = Math.exp((-0.5 * octave * octave) / 0.9); // gentle 120-lean
    const score = r * prior;
    if (score > bestScore) {
      bestScore = score;
      bestRaw = r;
      bestLag = lag;
    }
  }
  if (bestLag === 0) return { bpm: 0, beats: [], confidence: 0 };

  // parabolic refinement on the raw correlation around the winner
  const rawAt = (lag: number): number => {
    let r = 0;
    for (let n = 0; n + lag < envelope.length; ++n) {
      r += (envelope[n] ?? 0) * (envelope[n + lag] ?? 0);
    }
    return r / (envelope.length - lag);
  };
  const rPrev = rawAt(Math.max(minLag, bestLag - 1));
  const rNext = rawAt(Math.min(maxLag, bestLag + 1));
  const denom = rPrev - 2 * bestRaw + rNext;
  const shift = denom !== 0 ? (0.5 * (rPrev - rNext)) / denom : 0;
  const refinedLag = Math.max(1, bestLag + Math.max(-1, Math.min(1, shift)));
  const bpm = 60 / (refinedLag * frameSeconds);

  // phase: offset maximising the comb-summed onset energy
  const period = refinedLag;
  let bestOffset = 0;
  let bestSum = -1;
  for (let offset = 0; offset < period; ++offset) {
    let sum = 0;
    for (let n = offset; n < envelope.length; n += period) {
      const v = envelope[Math.round(n)] ?? 0;
      const left = envelope[Math.round(n) - 1] ?? 0;
      sum += v + left * 0.5; // tolerate 1-frame late clicks
    }
    if (sum > bestSum) {
      bestSum = sum;
      bestOffset = offset;
    }
  }

  const duration = envelope.length * frameSeconds;
  const beatPeriod = 60 / bpm;
  const beats: number[] = [];
  for (let t = bestOffset * frameSeconds; t < duration; t += beatPeriod) {
    beats.push(Math.round(t * 1000) / 1000);
  }

  const confidence = Math.min(1, bestRaw / ((totalEnergy / envelope.length) + 1e-12));
  return { bpm: Math.round(bpm * 10) / 10, beats, confidence };
}

/**
 * Snap one timeline position (seconds) to the nearest beat within `radius`;
 * returns the input unchanged when no beat is close enough. Used by the
 * selection pipeline where beats take priority over zero-crossings (ADR 007).
 */
export function snapEdgeToBeat(
  beats: number[],
  t: number,
  radius: number,
): number {
  let best = t;
  let bestDist = radius;
  for (const beat of beats) {
    const dist = Math.abs(beat - t);
    if (dist < bestDist) {
      bestDist = dist;
      best = beat;
    }
    if (beat > t + radius) break; // sorted beats — nothing closer ahead
  }
  return best;
}
