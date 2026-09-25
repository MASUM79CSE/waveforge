/**
 * Export format catalog (professional chooser): the single source for the
 * export dialog's format cards and per-format quality presets. Pure data —
 * the encoder service (`exportService.ts`) stays the authority on what the
 * quality ids mean; this catalog only describes the choices to the user.
 */
import type { ExportFormat } from './exportName';

export interface ExportQualityOption {
  id: string;
  label: string;
  /** One-line guidance shown next to the select. */
  hint: string;
}

export interface ExportFormatInfo {
  id: ExportFormat;
  name: string;
  ext: string;
  badge: 'Lossless' | 'Lossy';
  /** One-line use-case under the card title. */
  blurb: string;
  qualities: ExportQualityOption[];
  defaultQuality: string;
}

const WAV: ExportFormatInfo = {
  id: 'wav',
  name: 'WAV',
  ext: 'wav',
  badge: 'Lossless',
  blurb: 'Uncompressed PCM — archival, editing and DAW interchange',
  defaultQuality: 'pcm24',
  qualities: [
    { id: 'pcm16', label: '16-bit PCM', hint: 'CD standard — universal compatibility' },
    { id: 'pcm24', label: '24-bit PCM', hint: 'Studio master — extra dynamic headroom' },
    { id: 'float32', label: '32-bit float', hint: 'DAW-native — no clipping on the bus' },
  ],
};

const MP3: ExportFormatInfo = {
  id: 'mp3',
  name: 'MP3',
  ext: 'mp3',
  badge: 'Lossy',
  blurb: 'Universal playback — distribution, sharing and drafts',
  defaultQuality: '320',
  qualities: [
    { id: '128', label: '128 kbps', hint: 'Small files — voice and podcasts' },
    { id: '192', label: '192 kbps', hint: 'Good quality — everyday listening' },
    { id: '256', label: '256 kbps', hint: 'High quality — music releases' },
    { id: '320', label: '320 kbps', hint: 'Maximum — transparent for most listeners' },
  ],
};

const FLAC: ExportFormatInfo = {
  id: 'flac',
  name: 'FLAC',
  ext: 'flac',
  badge: 'Lossless',
  blurb: 'Compressed lossless — archival at a fraction of the WAV size',
  defaultQuality: '5',
  qualities: [
    { id: '0', label: 'Level 0 — fastest', hint: 'Largest FLAC files, quick encode' },
    { id: '3', label: 'Level 3 — fast', hint: 'Good balance for long sessions' },
    { id: '5', label: 'Level 5 — balanced', hint: 'Recommended default' },
    { id: '8', label: 'Level 8 — best', hint: 'Smallest files — slowest encode' },
  ],
};

export const EXPORT_FORMATS: ExportFormatInfo[] = [WAV, MP3, FLAC];

export function formatInfo(id: ExportFormat): ExportFormatInfo {
  const found = EXPORT_FORMATS.find((f) => f.id === id);
  if (!found) throw new Error(`exportFormats: unknown format "${id}"`);
  return found;
}

export function qualityHint(format: ExportFormat, qualityId: string): string {
  const info = formatInfo(format);
  return (
    info.qualities.find((q) => q.id === qualityId)?.hint ??
    info.qualities.find((q) => q.id === info.defaultQuality)!.hint
  );
}
