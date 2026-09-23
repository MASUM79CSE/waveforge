import { signal } from '@preact/signals';
import { STORAGE_PREFIX } from '../core/constants';

/**
 * Central UI state (Preact Signals). The engine layer never imports this —
 * the app runtime pushes engine events into these signals.
 */

export interface DocInfo {
  name: string;
  duration: number; // seconds
  sampleRate: number;
  channels: number;
  sizeBytes: number;
}

export interface Toast {
  id: number;
  kind: 'info' | 'ok' | 'err';
  message: string;
  action?: { label: string; run: () => void };
}

export interface Selection {
  start: number;
  end: number;
}

// document
export const docInfo = signal<DocInfo | null>(null);

// transport
export const playing = signal(false);
export const looping = signal(false);
export const cursorPos = signal(0);

// view
export const viewSpp = signal(1024);
export const viewStart = signal(0);
export const followCursor = signal(true);

// editing
export const selection = signal<Selection | null>(null);

// io
export const loadingActive = signal(false);
export const loadingLabel = signal('');
export const loadingProgress = signal<number | null>(null);

// dialogs
export const welcomeOpen = signal(true);
export const aboutOpen = signal(false);
export const urlOpen = signal(false);
export const gainPromptOpen = signal(false);
export const normalizePromptOpen = signal(false);

// editing
export const canUndo = signal(false);
export const canRedo = signal(false);
export const effectDialogId = signal<string | null>(null);
export const previewActive = signal(false);

// M4 — recording & export
export const recording = signal(false);
export const recLevel = signal({ peakDb: Number.NEGATIVE_INFINITY, rmsDb: Number.NEGATIVE_INFINITY });
export const recSeconds = signal(0);
export const recordSettingsOpen = signal(false);
export const exportOpen = signal(false);
export const exportBusy = signal(false);
export const exportProgress = signal<number | null>(null);
export const exportCancel = signal<{ cancelled: boolean } | null>(null);
export const channelMutes = signal<[boolean, boolean]>([false, false]);
export const channelsSwapped = signal(false);

// analysis (M5)
export interface BpmResult {
  bpm: number;
  beatCount: number;
  confidence: number;
}
export interface LufsResult {
  integrated: number;
  momentaryMax: number;
  shortTermMax: number;
}
export const bpmResult = signal<BpmResult | null>(null);
export const lufsResult = signal<LufsResult | null>(null);
export const beats = signal<number[]>([]); // seconds, ascending
export const analysisBusy = signal<'bpm' | 'lufs' | null>(null);
export const analysisPanelOpen = signal(readStoredBool('analysis', false));
export const beatsShown = signal(readStoredBool('beats', true));

export function setAnalysisPanelOpen(value: boolean): void {
  analysisPanelOpen.value = value;
  writeStoredBool('analysis', value);
}

export function setBeatsShown(value: boolean): void {
  beatsShown.value = value;
  writeStoredBool('beats', value);
}

// song metadata (M5, ID3 on MP3 export)
export const metadataOpen = signal(false);
export const tags = signal<Record<string, string>>({});

function readStoredBool(key: string, fallback: boolean): boolean {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}.${key}`) === '1' ? true :
      localStorage.getItem(`${STORAGE_PREFIX}.${key}`) === '0' ? false : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}.${key}`, value ? '1' : '0');
  } catch {
    /* private mode — preference simply is not persisted */
  }
}

export const zeroCrossEnabled = signal(readStoredBool('zerocross', true));

export function setZeroCrossEnabled(value: boolean): void {
  zeroCrossEnabled.value = value;
  writeStoredBool('zerocross', value);
}

// toasts
export const toasts = signal<Toast[]>([]);

export function setDocInfo(value: DocInfo | null): void {
  docInfo.value = value;
}
