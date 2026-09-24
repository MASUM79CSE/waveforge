import { Brand } from '../brand';
import { TOAST_ERROR_MS, TOAST_INFO_MS } from '../core/constants';
import { getErrorMessage, isWaveForgeError, makeError, redactContext } from '../core/errors';
import { logger } from '../core/logger-instance';
import { audioFileSchema, fileMetaSchema, urlInputSchema } from '../core/schemas';
import { AudioDocument } from '../engine/AudioDocument';
import type { LoopRegion } from '../engine/transportMath';
import { clampSeek } from '../engine/transportMath';
import { decodeBlob } from '../io/decode';
import { parseId3 } from '../io/id3';
import { t, tError } from '../i18n';
import { installDoc, engine, renderer, getDoc } from './runtime';
import { stopPreview } from './preview';
import * as S from './state';
import type { Toast } from './state';

/** All user-facing operations. Commands and components call into these. */

let nextToastId = 1;

export function pushToast(kind: Toast['kind'], message: string, action?: Toast['action']): void {
  const id = nextToastId++;
  S.toasts.value = [...S.toasts.value, { id, kind, message, action }];
  const ttl = kind === 'err' ? TOAST_ERROR_MS : TOAST_INFO_MS;
  setTimeout(() => dismissToast(id), ttl);
}

export function dismissToast(id: number): void {
  S.toasts.value = S.toasts.value.filter((toast) => toast.id !== id);
}

export function toastInfo(message: string): void {
  pushToast('info', message);
}

export function toastError(message: string): void {
  pushToast('err', message);
}

/** One reporting path for every caught error (Build Plan §6.2). */
function reportError(error: unknown): void {
  if (isWaveForgeError(error)) {
    logger.error(error.code, redactContext(error.context ?? {}));
    pushToast('err', tError(error.code));
    return;
  }
  logger.error('unexpected error', { detail: getErrorMessage(error) });
  pushToast('err', tError('WF-E601'));
}

/** Honest placeholder for features landing in a later milestone. */
export function toastNotYet(feature: string, milestone: string): void {
  pushToast('info', t().notYet(feature, milestone));
}

export function isFollowOn(): boolean {
  return S.followCursor.value;
}

export function isZeroCrossOn(): boolean {
  return S.zeroCrossEnabled.value;
}

// ---- dialogs ----

export function openWelcome(): void {
  S.welcomeOpen.value = true;
}

export function closeWelcome(): void {
  S.welcomeOpen.value = false;
}

export function openAbout(): void {
  S.aboutOpen.value = true;
}

export function closeAbout(): void {
  S.aboutOpen.value = false;
}

export function openUrlDialog(): void {
  S.urlOpen.value = true;
}

export function closeUrlDialog(): void {
  S.urlOpen.value = false;
}

export function openGainPrompt(): void {
  S.gainPromptOpen.value = true;
}

export function closeGainPrompt(): void {
  S.gainPromptOpen.value = false;
}

export function openNormalizePrompt(): void {
  S.normalizePromptOpen.value = true;
}

export function openExportDialog(): void {
  S.exportOpen.value = true;
}

export function closeExportDialog(): void {
  S.exportOpen.value = false;
}

export function openRecordSettings(): void {
  S.recordSettingsOpen.value = true;
}

export function closeRecordSettings(): void {
  S.recordSettingsOpen.value = false;
}

export function openEffectDialog(id: string): void {
  S.effectDialogId.value = id;
}

export function closeEffectDialog(): void {
  stopPreview();
  S.effectDialogId.value = null;
}

export function closeNormalizePrompt(): void {
  S.normalizePromptOpen.value = false;
}

export function toggleZeroCross(): void {
  S.setZeroCrossEnabled(!S.zeroCrossEnabled.value);
}

export function isExperimentalFxOn(): boolean {
  return S.experimentalFx.value;
}

export function toggleExperimentalFx(): void {
  S.setExperimentalFx(!S.experimentalFx.value);
}

// ---- loading ----

function beginLoading(label: string): void {
  S.loadingActive.value = true;
  S.loadingLabel.value = label;
  S.loadingProgress.value = null;
}

function endLoading(): void {
  S.loadingActive.value = false;
  S.loadingProgress.value = null;
}

function finishLoad(buffer: AudioBuffer, name: string, sizeBytes: number, source: 'file' | 'url' | 'sample'): void {
  installDoc(new AudioDocument(buffer, { name, sizeBytes, source }));
  S.welcomeOpen.value = false;
  S.urlOpen.value = false;
  toastInfo(t().toastLoaded(name));
}

export async function openFileObject(file: File): Promise<void> {
  if (!audioFileSchema.safeParse(file).success) {
    reportError(makeError('WF-E101', { file: file.name }));
    return;
  }
  if (!fileMetaSchema.safeParse({ name: file.name, size: file.size }).success) {
    const tooBig = file.size > 512 * 1024 * 1024;
    reportError(makeError(tooBig ? 'WF-E103' : 'WF-E101', { file: file.name }));
    return;
  }

  beginLoading(t().loadingFile(file.name));
  try {
    // ID3 sniff (M5): prefill song info from a leading v2.3/v2.4 tag
    try {
      const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
      if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
        const size =
          ((head[6] ?? 0) << 21) | ((head[7] ?? 0) << 14) | ((head[8] ?? 0) << 7) | (head[9] ?? 0);
        const full = new Uint8Array(await file.slice(0, 10 + size).arrayBuffer());
        const meta = parseId3(full);
        if (meta) {
          S.tags.value = Object.fromEntries(
            Object.entries(meta).filter(([, v]) => typeof v === 'string' && v !== ''),
          ) as Record<string, string>;
          toastInfo(t().metadataTitle);
        }
      }
    } catch {
      /* metadata is best-effort — decode proceeds regardless */
    }
    const buffer = await decodeBlob(file);
    finishLoad(buffer, file.name, file.size, 'file');
  } catch (error: unknown) {
    reportError(isWaveForgeError(error) ? error : makeError('WF-E102', { file: file.name }, error));
  } finally {
    endLoading();
  }
}

export function pickAudioFile(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*,.mp3,.wav,.flac,.ogg,.oga,.opus,.m4a,.aac,.aif,.aiff,.webm';
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) void openFileObject(file);
  };
  input.click();
}

export async function openUrl(rawUrl: string): Promise<void> {
  const parsed = urlInputSchema.safeParse({ url: rawUrl.trim() });
  if (!parsed.success) {
    reportError(makeError('WF-E201', { url: rawUrl }));
    return;
  }
  const url = parsed.data.url;

  beginLoading(t().loadingUrl);
  try {
    let response: Response;
    try {
      response = await fetch(url, { mode: 'cors' });
    } catch (cause: unknown) {
      throw makeError('WF-E201', { url }, cause);
    }
    if (!response.ok) throw makeError('WF-E202', { status: response.status });

    const total = Number(response.headers.get('content-length') || 0);
    let blob: Blob;
    if (total > 0 && response.body) {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.length;
          S.loadingProgress.value = received / total;
        }
      }
      blob = new Blob(chunks as BlobPart[]);
    } else {
      blob = await response.blob();
    }

    let buffer: AudioBuffer;
    try {
      buffer = await decodeBlob(blob);
    } catch (cause: unknown) {
      throw makeError('WF-E102', { url }, cause);
    }
    const name = basename(url);
    finishLoad(buffer, name, blob.size, 'url');
  } catch (error: unknown) {
    reportError(error);
  } finally {
    endLoading();
  }
}

export async function loadSample(): Promise<void> {
  beginLoading(t().loadingSample);
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}samples/demo.wav`);
    if (!response.ok) throw makeError('WF-E201', { resource: 'demo.wav' });
    const blob = await response.blob();
    const buffer = await decodeBlob(blob);
    finishLoad(buffer, 'demo.wav', blob.size, 'sample');
  } catch (error: unknown) {
    reportError(error);
  } finally {
    endLoading();
  }
}

function basename(url: string): string {
  try {
    const path = new URL(url).pathname;
    const last = path.split('/').pop() ?? 'audio';
    return last.length > 0 ? decodeURIComponent(last) : 'audio';
  } catch {
    return 'audio';
  }
}

// ---- transport ----

export const transport = {
  togglePlay(): void {
    if (engine.playing) engine.pause();
    else void engine.play();
  },
  stop(): void {
    engine.stop();
  },
  toggleLoop(): void {
    const next = !S.looping.value;
    S.looping.value = next;
    const sel = S.selection.value;
    const region: LoopRegion | null = sel ? sel : null;
    engine.setLoop(next, region);
    toastInfo(next ? t().loopOn : t().loopOff);
  },
  seekStart(): void {
    engine.seek(0);
  },
  seekEnd(): void {
    engine.seek(getDoc()?.duration ?? 0);
  },
  nudge(seconds: number): void {
    engine.seek(clampSeek(engine.cursor + seconds, getDoc()?.duration ?? 0));
  },
};

// ---- view ----

export const view = {
  zoomIn(): void {
    renderer.zoom(1.5);
  },
  zoomOut(): void {
    renderer.zoom(1 / 1.5);
  },
  zoomReset(): void {
    renderer.zoomReset();
  },
  center(): void {
    renderer.centerOn(engine.cursor);
  },
  toggleFollow(): void {
    S.followCursor.value = !S.followCursor.value;
  },
};

// ---- edit ----

export const edit = {
  selectAll(): void {
    const doc = getDoc();
    if (!doc) return;
    const sel = { start: 0, end: doc.duration };
    renderer.setSelection(sel);
    S.selection.value = sel;
  },
  deselect(): void {
    renderer.setSelection(null);
    S.selection.value = null;
  },
};

export {
  detectBpm,
  isAnalysisPanelOn,
  isBeatsShown,
  measureLoudness,
  toggleAnalysisPanel,
  toggleBeatsShown,
} from './analysisActions';

export {
  closeDraftsDialog,
  closeSaveDraftDialog,
  confirmSaveDraft,
  deleteDraft,
  discardAutosave,
  openDraft,
  openDraftsDialog,
  openSaveDraftDialog,
  renameDraft,
  restoreAutosave,
} from './draftActions';

export { Brand };
