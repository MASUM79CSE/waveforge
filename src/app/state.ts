import { createTakes, type TakesState } from '../engine/takes';
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
export const doctorOpen = signal(false);
export const shortcutsOpen = signal(false);
/** E6a noise print held across the session; persisted in draft headers (M7). */
export const sessionNoisePrint = signal<Float32Array | null>(null);
export const urlOpen = signal(false);
export const gainPromptOpen = signal(false);
export const normalizePromptOpen = signal(false);

// editing
export const canUndo = signal(false);
export const canRedo = signal(false);

// M8 — multitrack project
export const projectOpen = signal(false);
export const projectTracks = signal<import('./projectActions').TrackSnapshot[]>([]);
export const activeTrackId = signal<string | null>(null);
/** Bumped on every project mutation (lane redraws subscribe). */
export const projectVersion = signal(0);
export const effectDialogId = signal<string | null>(null);
/** C2: FX Rack dialog open. */
export const rackOpen = signal(false);
export const previewActive = signal(false);

// M4 — recording & export
export const recording = signal(false);
export const recLevel = signal({ peakDb: Number.NEGATIVE_INFINITY, rmsDb: Number.NEGATIVE_INFINITY });
export const recSeconds = signal(0);

/** R1: armed = mic open + meter live, waiting for the roll. */
export const armed = signal(false);
/** R1: peak-hold (dBFS) + latched clip LED for the studio meter. */
export const peakHoldDb = signal(Number.NEGATIVE_INFINITY);
export const clipLatched = signal(false);
/** R2: beats remaining in the count-in (0 = no count-in running). */
export const countInBeat = signal(0);
/** R3: session takes (pure reducer state, docs/recording-plan.md). */
export const takes = signal<TakesState>(createTakes());
/** R-series studio recording settings (persisted). */
export interface RecStudioSettings {
  countInBars: number; // 0–4
  metronome: boolean;
  useDetectedBpm: boolean;
  manualBpm: number; // 40–240
  clickVolume: number; // 0–1
  monitoring: boolean; // input monitor — feedback-safe default OFF
  preRollSec: number; // R6: punch pre-roll playback (0.5–3 s)
}
export const recStudio = signal<RecStudioSettings>({
  countInBars: 1,
  metronome: false,
  useDetectedBpm: false,
  manualBpm: 120,
  clickVolume: 0.8,
  monitoring: false,
  preRollSec: 1.5,
});
export const recordSettingsOpen = signal(false);
export const exportOpen = signal(false);
export const exportBusy = signal(false);
export const exportProgress = signal<number | null>(null);
export const exportCancel = signal<{ cancelled: boolean } | null>(null);
export const channelMutes = signal<[boolean, boolean]>([false, false]);
export const channelsSwapped = signal(false);
/** D9: theme ('dark' | 'light') + accent id — persisted, applied via <html> data attrs. */
export type ThemeName = 'dark' | 'light';
export const ACCENTS = ['cyan', 'teal', 'green', 'amber', 'magenta'] as const;
export type AccentName = (typeof ACCENTS)[number];

function readStoredString(key: string, fallback: string): string {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}.${key}`) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStoredString(key: string, value: string): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}.${key}`, value);
  } catch {
    return; // private mode — preferences stay in-memory
  }
}

export const theme = signal<ThemeName>(
  readStoredString('theme', 'dark') === 'light' ? 'light' : 'dark',
);
export const accent = signal<AccentName>(
  (ACCENTS as readonly string[]).includes(readStoredString('accent', 'cyan'))
    ? (readStoredString('accent', 'cyan') as AccentName)
    : 'cyan',
);

export function setThemeName(value: ThemeName): void {
  theme.value = value;
  writeStoredString('theme', value);
}

export function setAccent(value: AccentName): void {
  accent.value = value;
  writeStoredString('accent', value);
}

/** D8: per-channel playback volume (0..1.5) and pan (-1..1). */
export const channelVolumes = signal<[number, number]>([1, 1]);
export const channelPans = signal<[number, number]>([0, 0]);

export function clampChannelVolume(v: number): number {
  if (Number.isNaN(v)) return 1;
  return Math.min(1.5, Math.max(0, v));
}

export function clampPan(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(-1, v));
}

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
/** P2: full professional analysis report (docs/analyze-plan.md). */
export const analysisReport = signal<import('../engine/analysisReport').AnalysisReport | null>(
  null,
);
export const beats = signal<number[]>([]); // seconds, ascending
export const analysisBusy = signal<'bpm' | 'lufs' | 'report' | null>(null);
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

// drafts + autosave + PWA (M6)
export const draftsOpen = signal(false);
export const draftSaveOpen = signal(false);
export const draftsBusy = signal(false);
export const restoreStamp = signal<number | null>(null);
export const updateReady = signal(false);
export interface DraftRow {
  id: string;
  name: string;
  updatedAt: number;
  duration: number;
  channels: number;
  sizeBytes: number;
  compressed: boolean;
}
export const draftsList = signal<DraftRow[]>([]);
export const draftsUsage = signal<{ usage: number; quota: number } | null>(null);

function readStoredNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}.${key}`);
    return raw === null ? fallback : Number(raw);
  } catch {
    return fallback;
  }
}

function writeStoredNumber(key: string, value: number): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}.${key}`, String(value));
  } catch {
    return; // private mode — preferences stay in-memory
  }
}

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
/** D4: amplitude axis + channel rail along the canvas edges (AudioMass parity). */
export const amplitudeAxis = signal(readStoredBool('amplitudeaxis', true));
/** D5: vertical zoom — wave amplitude scale, clamped 0.5..3 (AudioMass parity). */
export const VZOOM_MIN = 0.5;
export const VZOOM_MAX = 3;
export const vzoom = signal(clampVZoom(readStoredNumber('vzoom', 1)));
/** D5: snap selection edges to detected beats (default keeps the old behavior). */
export const snapToBeat = signal(readStoredBool('snaptobeat', true));

export function clampVZoom(v: number): number {
  if (Number.isNaN(v)) return 1;
  return Math.min(VZOOM_MAX, Math.max(VZOOM_MIN, v));
}

export function setVZoom(value: number): void {
  const v = clampVZoom(value);
  vzoom.value = v;
  writeStoredNumber('vzoom', v);
}

export function setZeroCrossEnabled(value: boolean): void {
  zeroCrossEnabled.value = value;
  writeStoredBool('zerocross', value);
}

export function setAmplitudeAxis(value: boolean): void {
  amplitudeAxis.value = value;
  writeStoredBool('amplitudeaxis', value);
}

// toasts
export const toasts = signal<Toast[]>([]);

export function setDocInfo(value: DocInfo | null): void {
  docInfo.value = value;
}
