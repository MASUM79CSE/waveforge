/**
 * Export actions (M4): gather the export range (selection when present,
 * else the whole document), run the encoder service, and save via the
 * File System Access API when available — the picker opens inside the
 * click gesture, before encoding — falling back to <a download>.
 */
import { logger } from '../core/logger-instance';
import { sanitizeFilename, estimateExportBytes, type ExportFormat } from '../io/exportName';
import { runExport } from '../io/exportService';
import { sliceRegion } from '../engine/editOps';
import { t } from '../i18n';
import { toastInfo, toastError } from './actions';
import { currentChannels, targetRange } from './editActions';
import { getDoc } from './runtime';
import * as S from './state';

interface SavePickerWindow {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{
    name: string;
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}

const MIME_BY_FORMAT: Record<ExportFormat, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
};

const EXTENSION: Record<ExportFormat, string> = { wav: 'wav', mp3: 'mp3', flac: 'flac' };

export function defaultExportName(): string {
  const doc = getDoc();
  const base = (doc?.meta.name ?? 'untitled').replace(/\.[a-z0-9]+$/i, '');
  return sanitizeFilename(base);
}

export function currentEstimate(
  format: ExportFormat,
  quality: string,
): number {
  const range = targetRange();
  const doc = getDoc();
  if (!range || !doc) return 0;
  return estimateExportBytes(format, quality, range.len, doc.channels, doc.sampleRate);
}

export async function performExport(
  format: ExportFormat,
  quality: string,
  filename: string,
): Promise<void> {
  const doc = getDoc();
  const range = targetRange();
  if (!doc || !range || S.exportBusy.value) return;

  const channels =
    range.start === 0 && range.len === doc.length
      ? currentChannels()
      : sliceRegion(currentChannels(), range.start, range.len);

  const safeName = sanitizeFilename(filename);
  const fullName = `${safeName}.${EXTENSION[format]}`;
  const signal = { cancelled: false };
  S.exportCancel.value = signal;

  S.exportBusy.value = true;
  S.exportProgress.value = 0;
  try {
    // File System Access: pick the destination first (transient activation)
    const picker = (window as SavePickerWindow).showSaveFilePicker;
    let handle: Awaited<ReturnType<NonNullable<SavePickerWindow['showSaveFilePicker']>>> | null =
      null;
    if (typeof picker === 'function') {
      try {
        handle = await picker({
          suggestedName: fullName,
          types: [{ description: format.toUpperCase(), accept: { [MIME_BY_FORMAT[format]]: [`.${EXTENSION[format]}`] } }],
        });
      } catch {
        S.exportBusy.value = false; // user cancelled the picker
        return;
      }
    }

    const result = await runExport({
      channels,
      sampleRate: doc.sampleRate,
      options: { format, quality },
      onProgress: (fraction) => {
        S.exportProgress.value = fraction;
      },
      signal,
    });
    if (signal.cancelled) {
      toastInfo(t().exportCancelled);
      return;
    }

    if (handle) {
      const writable = await handle.createWritable();
      await writable.write(result.blob);
      await writable.close();
    } else {
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fullName;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
    toastInfo(`${t().exportDone}: ${handle ? handle.name : fullName}`);
  } catch (error: unknown) {
    if (signal.cancelled || (error instanceof Error && error.message === 'cancelled')) {
      toastInfo(t().exportCancelled);
    } else {
      logger.error('export failed', { detail: String(error) });
      toastError(t().exportFailed);
    }
  } finally {
    S.exportBusy.value = false;
    S.exportProgress.value = null;
    S.exportCancel.value = null;
  }
}

export function cancelExport(): void {
  const signal = S.exportCancel.value;
  if (signal) signal.cancelled = true;
}
