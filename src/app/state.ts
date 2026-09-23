import { signal } from '@preact/signals';

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

// toasts
export const toasts = signal<Toast[]>([]);

export function setDocInfo(value: DocInfo | null): void {
  docInfo.value = value;
}
