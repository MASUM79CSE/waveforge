/**
 * Meter math (M4): peak/RMS levels in dBFS for the recording meter. Pure.
 */
export interface MeterLevel {
  peakDb: number;
  rmsDb: number;
}

export function meterLevel(data: Float32Array): MeterLevel {
  let peak = 0;
  let sumSquares = 0;
  for (let i = 0; i < data.length; ++i) {
    const abs = Math.abs(data[i] ?? 0);
    if (abs > peak) peak = abs;
    sumSquares += (data[i] ?? 0) * (data[i] ?? 0);
  }
  if (peak === 0) return { peakDb: Number.NEGATIVE_INFINITY, rmsDb: Number.NEGATIVE_INFINITY };
  const rms = Math.sqrt(sumSquares / Math.max(1, data.length));
  return {
    peakDb: 20 * Math.log10(peak),
    rmsDb: rms > 0 ? 20 * Math.log10(rms) : Number.NEGATIVE_INFINITY,
  };
}

/** R1 — peak-hold state for the studio meter (pure, frame-driven). */
export interface MeterHold {
  /** Held peak in dBFS. */
  db: number;
  /** Frames since the hold was refreshed (decay gate). */
  age: number;
  /** Latched clip (>= CLIP_DB) until explicitly reset. */
  clip: boolean;
}

export const CLIP_DB = -0.1;
const HOLD_FRAMES = 45; // ~0.75 s at 60 fps before decay starts
const HOLD_DECAY_DB = 0.5; // dB per frame after the gate

export function initialHold(): MeterHold {
  return { db: Number.NEGATIVE_INFINITY, age: 0, clip: false };
}

export function advanceHold(hold: MeterHold, peakDb: number): MeterHold {
  const refreshed = peakDb >= hold.db;
  const db = refreshed
    ? peakDb
    : hold.age >= HOLD_FRAMES
      ? Math.max(peakDb, hold.db - HOLD_DECAY_DB)
      : hold.db;
  const clip = hold.clip || peakDb >= CLIP_DB;
  return { db, age: refreshed ? 0 : hold.age + 1, clip };
}
