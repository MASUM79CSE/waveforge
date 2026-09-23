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
