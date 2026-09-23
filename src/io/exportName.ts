/**
 * Export helpers (M4): filename sanitizing, size estimation and the
 * int16 conversions lamejs needs. All pure.
 */
import type { WavEncoding } from './wavEncoder';

export type ExportFormat = 'wav' | 'mp3' | 'flac';

const MAX_NAME_LENGTH = 120;
const DEFAULT_NAME = 'untitled';

/** Strip everything unsafe for a download filename (control chars, path
 *  separators, Windows-reserved characters), collapse dot runs (path
 *  traversal optics) and edge junk. */
export function sanitizeFilename(raw: string): string {
  const stripped = raw.replace(/[\u0000-\u001f\u007f/\\?%*:|"<>\u0080-\u009f]/g, '');
  const edges = stripped.replace(/^[.\s]+|[.\s]+$/g, '');
  const collapsed = edges.replace(/\.{2,}/g, '.').trim();
  if (collapsed.length === 0) return DEFAULT_NAME;
  return collapsed.slice(0, MAX_NAME_LENGTH);
}

const FLAC_FACTOR_BY_LEVEL = (level: number): number =>
  Math.max(0.35, 0.9 - Math.max(0, Math.min(8, level)) * 0.06);

/** Rough size estimate for the export dialog (bytes). */
export function estimateExportBytes(
  format: ExportFormat,
  quality: string,
  frames: number,
  channels: number,
  sampleRate: number,
): number {
  if (format === 'wav') {
    const bytesPerSample = quality === 'pcm16' ? 2 : quality === 'pcm24' ? 3 : 4;
    return wavOverhead(quality as WavEncoding) + frames * channels * bytesPerSample;
  }
  if (format === 'mp3') {
    const kbps = Number(quality) || 192;
    return Math.round((kbps * 1000 * frames) / (8 * sampleRate));
  }
  const level = Number(quality) || 5;
  return Math.round(frames * channels * 2 * FLAC_FACTOR_BY_LEVEL(level));
}

function wavOverhead(encoding: WavEncoding): number {
  return encoding === 'float32' ? 58 : 44;
}

/** lamejs input conversion: ×32767 up, ×32768 down, clamp, round. */
export function floatToInt16(data: Float32Array): Int16Array {
  const out = new Int16Array(data.length);
  for (let i = 0; i < data.length; ++i) {
    const x = data[i] ?? 0;
    const v = Math.round(x < 0 ? x * 32768 : x * 32767);
    out[i] = Math.max(-32768, Math.min(32767, v));
  }
  return out;
}

/** Frame-ordered interleaving (L R L R …) for multi-channel encoders. */
export function interleaveToInt16(channels: Float32Array[]): Int16Array {
  const chCount = channels.length;
  if (chCount <= 1) return floatToInt16(channels[0] ?? new Float32Array(0));
  const frames = channels[0]?.length ?? 0;
  const out = new Int16Array(frames * chCount);
  for (let i = 0; i < frames; ++i) {
    for (let ch = 0; ch < chCount; ++ch) {
      const x = channels[ch]?.[i] ?? 0;
      const v = Math.round(x < 0 ? x * 32768 : x * 32767);
      out[i * chCount + ch] = Math.max(-32768, Math.min(32767, v));
    }
  }
  return out;
}
