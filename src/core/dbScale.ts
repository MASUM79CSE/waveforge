/**
 * Vertical scale mapping (UX-4, pure) — linear-in-dB amplitude curve with
 * the master-prompt analytic anchors: amplitude 1.0 → 0 dB (lane edge),
 * 0.5 → −6.02 dB, 0.1 → −20 dB, and the dB floor (−60) → lane CENTER.
 * Consumed by the frame2 scale panel (DOM labels) and the batched lane
 * painter (waveform truth), so picture and labels can never disagree.
 */

export const FLOOR_DB = 60;

/** 20·log10 amplitude → dBFS (0 → −Infinity). */
export function ampToDb(amp: number): number {
  return amp <= 0 ? Number.NEGATIVE_INFINITY : 20 * Math.log10(amp);
}

/** 0 at 0 dB (edge) … 1 at the floor or quieter (center); clamped. */
export function dbFraction(amp: number, floorDb: number = FLOOR_DB): number {
  const db = ampToDb(Math.abs(amp));
  if (!Number.isFinite(db)) return 1;
  return Math.min(1, Math.max(0, -db / floorDb));
}

/** y position of an amplitude between the lane edge and the center line. */
export function yForAmp(amp: number, edge: number, mid: number, floorDb: number = FLOOR_DB): number {
  const half = mid - edge;
  if (half === 0 || amp === 0) return mid;
  const quiet = 1 - dbFraction(amp, floorDb); // 1 = 0 dB (edge) … 0 = floor (center)
  return amp > 0 ? mid - quiet * half : mid + quiet * half;
}

/**
 * Signed amplitude transformer for the lane painter: keeps the sign,
 * remaps magnitude onto the dB curve (edge..center). Identity at ±1 and 0.
 */
export function dBValueMapper(floorDb: number = FLOOR_DB): (v: number) => number {
  return (v: number): number =>
    v === 0 ? 0 : Math.sign(v) * (1 - dbFraction(Math.abs(v), floorDb));
}
