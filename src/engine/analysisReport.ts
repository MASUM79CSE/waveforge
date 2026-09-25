/**
 * P1 — professional analysis report: one pure scan
 * composing the existing BS.1770-4 loudness kernel, the true-peak estimator
 * and the radix-2 FFT into the metrics the 2026 delivery market expects —
 * streaming verdicts (LUFS/LRA/PLR/dBTP vs per-platform targets), stereo
 * quality (correlation + mid/side), integrity audits (clipping with
 * jump-to-offender, DC offset), octave balance, and a noise-floor estimate.
 * Deterministic, worker-runnable, any channel count (stereo section is
 * null for mono).
 */
import { Fft } from '../fx/fft';
import { truePeakDb } from '../fx/mastering';
import { integrateLoudness, momentaryTrack } from './lufs';

export interface StreamTarget {
  id: string;
  /** i18n-free label (platform name). */
  label: string;
  /** Integrated LUFS the platform normalizes to. */
  target: number;
  /** True-peak ceiling in dBTP. */
  tpCeiling: number;
}

/** 2026 delivery table. */
export const STREAM_TARGETS: readonly StreamTarget[] = [
  { id: 'spotify', label: 'Spotify', target: -14, tpCeiling: -1 },
  { id: 'youtube', label: 'YouTube', target: -14, tpCeiling: -1 },
  { id: 'appleMusic', label: 'Apple Music', target: -16, tpCeiling: -1 },
  { id: 'applePodcasts', label: 'Apple Podcasts', target: -16, tpCeiling: -1 },
  { id: 'amazon', label: 'Amazon Music', target: -14, tpCeiling: -1 },
  { id: 'tidal', label: 'Tidal', target: -14, tpCeiling: -1 },
  { id: 'deezer', label: 'Deezer', target: -15, tpCeiling: -1 },
  { id: 'ebu', label: 'EBU R128', target: -23, tpCeiling: -1 },
  { id: 'netflix', label: 'Netflix', target: -27, tpCeiling: -2 },
];

export interface LoudnessSection {
  integrated: number;
  momentaryMax: number;
  shortTermMax: number;
  /** Loudness range: p95 − p10 over the gated momentary blocks (LU). */
  lra: number;
  /** Peak-to-loudness ratio: truePeakDb − integrated (limiter headroom). */
  plr: number;
}

export interface StereoSection {
  /** Mean/min inter-channel correlation over energy-gated 50 ms blocks. */
  correlationMean: number;
  correlationMin: number;
  /** Side energy as % of total mid+side power. */
  sidePct: number;
}

export interface IntegritySection {
  clippedSamples: number;
  clippedRuns: number;
  /** First clipped run [startSample, len] — jump-to-offender. */
  firstRun: [number, number] | null;
  /** Per-channel DC offset (−1..1). */
  dc: number[];
  samplePeakDb: number;
}

export interface NoiseSection {
  /** 10th-percentile frame RMS in dBFS. */
  floorDb: number;
  /** p95 − p10 in dB. */
  snrDb: number;
  /** % of frames at or below −60 dBFS. */
  silencePct: number;
}

export interface AnalysisReport {
  lufs: LoudnessSection;
  truePeakDb: number;
  stereo: StereoSection | null;
  integrity: IntegritySection;
  /** 10 octave bands 31.25 Hz–16 kHz, % of total power. */
  balance: number[];
  noise: NoiseSection;
}

export interface Verdict {
  id: string;
  label: string;
  target: number;
  tpCeiling: number;
  /** Gain (dB, positive = turn down needed is negative) to hit the target. */
  gainDb: number;
  /** True peak stays ≤ ceiling after gainDb. */
  tpSafe: boolean;
}

const CLIP_EPS = 1e-4; // ≈ 0 dBFS — long flat ±full-scale runs survive resampling
const CLIP_RUN = 3;
const CORR_BLOCK_S = 0.05;
const CORR_GATE = Math.pow(10, -60 / 20); // −60 dBFS block energy gate
const FRAME_S = 0.05;
const FFT_SIZE = 8192;
const FFT_MAX_WINDOWS = 120;

const OCTAVE_HZ = [31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

/** Percentile of a copied+sorted array (linear index, simple + stable). */
function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NEGATIVE_INFINITY;
  const at = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[at]!;
}

/** EBU LRA percentile method over the gated momentary loudness blocks. */
function loudnessRange(blocks: readonly number[]): number {
  const absGate = blocks.filter((l) => l > -70);
  if (absGate.length === 0) return 0;
  const sorted = [...absGate].sort((a, b) => a - b);
  const relGateLevel = percentile(sorted, 10) - 20;
  const gated = absGate.filter((l) => l > relGateLevel).sort((a, b) => a - b);
  if (gated.length === 0) return 0;
  return percentile(gated, 95) - percentile(gated, 10);
}

function clippedRunsOf(ch: Float32Array): { samples: number; runs: number; first: [number, number] | null } {
  let samples = 0;
  let runs = 0;
  let runLen = 0;
  let runStart = -1;
  let first: [number, number] | null = null;
  for (let i = 0; i < ch.length; ++i) {
    if (Math.abs(ch[i]!) >= 1 - CLIP_EPS) {
      ++samples;
      if (runLen === 0) runStart = i;
      ++runLen;
    } else {
      if (runLen >= CLIP_RUN) {
        ++runs;
        if (first === null) first = [runStart, runLen];
      }
      runLen = 0;
    }
  }
  if (runLen >= CLIP_RUN) {
    ++runs;
    if (first === null) first = [runStart, runLen];
  }
  return { samples, runs, first };
}

function frameRmsDb(ch: Float32Array, sampleRate: number): number[] {
  const len = Math.max(1, Math.round(sampleRate * FRAME_S));
  const out: number[] = [];
  for (let start = 0; start < ch.length; start += len) {
    let sum = 0;
    const end = Math.min(ch.length, start + len);
    for (let i = start; i < end; ++i) sum += ch[i]! * ch[i]!;
    const rms = Math.sqrt(sum / Math.max(1, end - start));
    out.push(rms > 0 ? 20 * Math.log10(rms) : Number.NEGATIVE_INFINITY);
  }
  return out;
}

/** Average power spectrum → % of total power in each octave band. */
function octaveBalance(channels: Float32Array[], sampleRate: number): number[] {
  const fft = new Fft(FFT_SIZE);
  const half = FFT_SIZE >> 1;
  const power = new Float64Array(half);
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  const hop = FFT_SIZE >> 1;
  const hann = new Float64Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; ++i) hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
  let windows = 0;
  const ch = channels[0]!; // balance profile from channel 1 (stereo sums rarely differ meaningfully)
  for (let start = 0; start + FFT_SIZE <= ch.length && windows < FFT_MAX_WINDOWS; start += hop) {
    for (let i = 0; i < FFT_SIZE; ++i) {
      re[i] = ch[start + i]! * hann[i]!;
      im[i] = 0;
    }
    fft.forward(re, im);
    for (let k = 1; k < half; ++k) power[k]! += re[k]! * re[k]! + im[k]! * im[k]!;
    ++windows;
  }
  if (windows === 0) return OCTAVE_HZ.map(() => 0);
  const total = power.reduce((a, b) => a + b, 0);
  const out: number[] = [];
  const edges = [0, ...OCTAVE_HZ.map((f) => Math.round((f * FFT_SIZE) / sampleRate)), half];
  for (let b = 0; b < OCTAVE_HZ.length; ++b) {
    let band = 0;
    const lo = Math.max(1, edges[b]!);
    const hi = Math.min(half, edges[b + 1]!);
    for (let k = lo; k < hi; ++k) band += power[k]!;
    out.push(total > 0 ? (band / total) * 100 : 0);
  }
  return out;
}

function stereoSection(channels: Float32Array[], sampleRate: number): StereoSection | null {
  if (channels.length < 2) return null;
  const [l, r] = [channels[0]!, channels[1]!];
  const len = Math.min(l.length, r.length);
  const block = Math.max(1, Math.round(sampleRate * CORR_BLOCK_S));
  let sum = 0;
  let count = 0;
  let min = 1;
  let midSum = 0;
  let sideSum = 0;
  for (let start = 0; start + block <= len; start += block) {
    let lr = 0;
    let ll = 0;
    let rr = 0;
    for (let i = start; i < start + block; ++i) {
      const a = l[i]!;
      const b = r[i]!;
      lr += a * b;
      ll += a * a;
      rr += b * b;
      const m = (a + b) / 2;
      const s = (a - b) / 2;
      midSum += m * m;
      sideSum += s * s;
    }
    // energy gate: skip near-silent blocks (they carry no phase information)
    if (Math.sqrt(ll) < CORR_GATE * block || Math.sqrt(rr) < CORR_GATE * block) continue;
    const denom = Math.sqrt(ll * rr);
    if (denom <= 0) continue;
    const r2 = lr / denom;
    sum += r2;
    min = Math.min(min, r2);
    ++count;
  }
  const totalMs = midSum + sideSum;
  return {
    correlationMean: count > 0 ? sum / count : 1,
    correlationMin: count > 0 ? min : 1,
    sidePct: totalMs > 0 ? (sideSum / totalMs) * 100 : 0,
  };
}

/** The full professional scan (pure; O(n) plus a bounded FFT pass). */
export function analyzeReport(channels: Float32Array[], sampleRate: number): AnalysisReport {
  const loud = integrateLoudness(channels, sampleRate);
  const blocks = momentaryTrack(channels, sampleRate);
  const tp = truePeakDb(channels);

  let clippedSamples = 0;
  let clippedRuns = 0;
  let firstRun: [number, number] | null = null;
  const dc: number[] = [];
  let peak = 0;
  for (const ch of channels) {
    const run = clippedRunsOf(ch);
    clippedSamples += run.samples;
    clippedRuns += run.runs;
    if (firstRun === null && run.first !== null) firstRun = run.first;
    let sum = 0;
    for (let i = 0; i < ch.length; ++i) {
      sum += ch[i]!;
      const a = Math.abs(ch[i]!);
      if (a > peak) peak = a;
    }
    dc.push(ch.length > 0 ? sum / ch.length : 0);
  }

  const rmsDb = frameRmsDb(channels[0] ?? new Float32Array(0), sampleRate);
  const finite = rmsDb.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const floorDb = percentile(finite, 10);
  const loudDb = percentile(finite, 95);

  return {
    lufs: {
      integrated: loud.integrated,
      momentaryMax: loud.momentaryMax,
      shortTermMax: loud.shortTermMax,
      lra: loudnessRange(blocks),
      plr: Number.isFinite(tp) && Number.isFinite(loud.integrated) ? tp - loud.integrated : Number.POSITIVE_INFINITY,
    },
    truePeakDb: tp,
    stereo: stereoSection(channels, sampleRate),
    integrity: { clippedSamples, clippedRuns, firstRun, dc, samplePeakDb: peak > 0 ? 20 * Math.log10(peak) : Number.NEGATIVE_INFINITY },
    balance: octaveBalance(channels, sampleRate),
    noise: {
      floorDb,
      snrDb: Number.isFinite(floorDb) && Number.isFinite(loudDb) ? loudDb - floorDb : 0,
      silencePct:
        rmsDb.length > 0 ? (rmsDb.filter((v) => v <= -60).length / rmsDb.length) * 100 : 0,
    },
  };
}

/** Delivery verdicts against the 2026 streaming table. */
export function verdicts(report: AnalysisReport): Verdict[] {
  return STREAM_TARGETS.map((t) => {
    const gainDb = t.target - report.lufs.integrated;
    const projectedTp = Number.isFinite(report.truePeakDb) ? report.truePeakDb + gainDb : Number.NEGATIVE_INFINITY;
    return {
      id: t.id,
      label: t.label,
      target: t.target,
      tpCeiling: t.tpCeiling,
      gainDb,
      tpSafe: projectedTp <= t.tpCeiling + 0.1,
    };
  });
}
