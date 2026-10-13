/**
 * Export actions (M4): gather the export range (selection when present,
 * else the whole document), run the encoder service, and save via the
 * File System Access API when available — the picker opens inside the
 * click gesture, before encoding — falling back to <a download>.
 */
import { logger } from '../core/logger-instance';
import { sanitizeFilename, estimateExportBytes, type ExportFormat } from '../io/exportName';
import { formatInfo } from '../io/exportFormats';
import { runExport } from '../io/exportService';
import { buildId3Tag } from '../io/id3';
import { sliceRegion } from '../engine/editOps';
import { t } from '../i18n';
import { toastInfo, toastError } from './actions';
import { currentChannels, targetRange } from './editActions';
import { getDoc } from './runtime';
import { mixdownChannels, stemChannels } from './projectActions';
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

// WF-010: the format catalog is the single authority for MIME/extension
const MIME_BY_FORMAT: Record<ExportFormat, string> = {
  wav: formatInfo('wav').mime,
  mp3: formatInfo('mp3').mime,
  flac: formatInfo('flac').mime,
};

const EXTENSION: Record<ExportFormat, string> = {
  wav: formatInfo('wav').ext,
  mp3: formatInfo('mp3').ext,
  flac: formatInfo('flac').ext,
};

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

  // Full range passes the canonical document channels (WF-002: never
  // transferred — the worker boundary clones them). A sub-range hands
  // over fresh sliceRegion copies the caller never reads again, so the
  // worker request can be transferred (zero-copy move).
  const fullRange = range.start === 0 && range.len === doc.length;
  const channels = fullRange
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
      transferChannels: !fullRange,
      onProgress: (fraction) => {
        S.exportProgress.value = fraction;
      },
      signal,
    });
    if (signal.cancelled) {
      toastInfo(t().exportCancelled);
      return;
    }

    // MP3 metadata: prepend the ID3v2.4 tag when song info is set
    const tagBytes = Object.values(S.tags.value).some((v) => v !== '')
      ? buildId3Tag(S.tags.value)
      : null;
    const blob =
      tagBytes && format === 'mp3'
        ? new Blob([tagBytes, result.blob], { type: MIME_BY_FORMAT[format] })
        : result.blob;

    if (handle) {
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    } else {
      const url = URL.createObjectURL(blob);
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

/**
 * M8e: export the multitrack project — 'mixdown' renders the deterministic
 * mix kernel output; 'stems' renders one file per lane. Both reuse the
 * per-file save flow of performExport (picker → worker → progress).
 */
export async function performProjectExport(
  format: ExportFormat,
  quality: string,
  filename: string,
  kind: 'mixdown' | 'stems',
): Promise<void> {
  if (S.exportBusy.value) return;
  const sampleRate = S.docInfo.value?.sampleRate ?? 44100;
  const jobs: Array<{ name: string; channels: Float32Array[] }> = [];
  if (kind === 'mixdown') {
    const mix = mixdownChannels();
    if (mix) jobs.push({ name: sanitizeFilename(filename), channels: mix });
  } else {
    const stems = stemChannels();
    for (const [i, stem] of (stems ?? []).entries()) {
      jobs.push({
        name: `${sanitizeFilename(filename)}-${String(i + 1).padStart(2, '0')}-${sanitizeFilename(stem.name)}`,
        channels: stem.channels,
      });
    }
  }
  if (jobs.length === 0) return;

  const signal = { cancelled: false };
  S.exportCancel.value = signal;
  S.exportBusy.value = true;
  S.exportProgress.value = 0;
  try {
    for (const [idx, job] of jobs.entries()) {
      if (signal.cancelled) break;
      const fullName = `${job.name}.${EXTENSION[format]}`;
      const picker = (window as SavePickerWindow).showSaveFilePicker;
      let handle: Awaited<
        ReturnType<NonNullable<SavePickerWindow['showSaveFilePicker']>>
      > | null = null;
      if (typeof picker === 'function' && jobs.length === 1) {
        try {
          handle = await picker({
            suggestedName: fullName,
            types: [
              {
                description: format.toUpperCase(),
                accept: { [MIME_BY_FORMAT[format]]: [`.${EXTENSION[format]}`] },
              },
            ],
          });
        } catch {
          S.exportBusy.value = false; // user cancelled the picker
          return;
        }
      }
      const result = await runExport({
        channels: job.channels,
        sampleRate,
        options: { format, quality },
        onProgress: (fraction) => {
          S.exportProgress.value = (idx + fraction) / jobs.length;
        },
        signal,
      });
      if (signal.cancelled) break;
      const tagBytes =
        Object.values(S.tags.value).some((v) => v !== '') && format === 'mp3' && idx === 0
          ? buildId3Tag(S.tags.value)
          : null;
      const blob =
        tagBytes && format === 'mp3'
          ? new Blob([tagBytes, result.blob], { type: MIME_BY_FORMAT[format] })
          : result.blob;
      if (handle) {
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fullName;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    }
    if (signal.cancelled) toastInfo(t().exportCancelled);
    else toastInfo(`${t().exportDone}: ${kind === 'mixdown' ? 'mixdown' : `${jobs.length} stems`}`);
  } catch (error: unknown) {
    if (signal.cancelled || (error instanceof Error && error.message === 'cancelled')) {
      toastInfo(t().exportCancelled);
    } else {
      logger.error('project export failed', { detail: String(error) });
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
