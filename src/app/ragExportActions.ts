/**
 * P2.9 — export the current transcript (SRT/VTT/TXT) via the existing
 * anchor-download path. Rag pieces are reached through dynamic imports
 * so commands.ts (entry chunk) pays nothing for them. Flag OFF → no-op.
 */
import { isRagEnabled } from '../rag/flag';
import { toastInfo, toastError } from './toast';
import { logger } from '../core/logger-instance';
import { t } from '../i18n';

export type TranscriptFormat = 'srt' | 'vtt' | 'txt';

const EXT = { srt: 'srt', vtt: 'vtt', txt: 'txt' } as const;

export async function exportTranscriptAction(format: TranscriptFormat): Promise<void> {
  if (!isRagEnabled()) return;
  try {
    const { ragTranscript } = await import('../rag/runtime');
    const { toSrt, toVtt, toTxt } = await import('../rag/transcripts/export');
    const record = ragTranscript.value;
    if (!record || record.segments.length === 0) {
      toastError(t().ragExportNone);
      return;
    }
    const body =
      format === 'srt' ? toSrt(record.segments) : format === 'vtt' ? toVtt(record.segments) : toTxt(record.segments);
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `waveforge-transcript.${EXT[format]}`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toastInfo(`${t().ragExportDone}: waveforge-transcript.${EXT[format]}`);
  } catch (error: unknown) {
    logger.error('transcript export failed', { detail: String(error) });
    toastError(t().exportFailed);
  }
}
