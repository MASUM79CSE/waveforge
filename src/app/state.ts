import { signal } from '@preact/signals';

/**
 * Central UI state (Preact Signals). The engine layer never imports this —
 * the app layer pushes engine events into these signals (wired in M1).
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

export const docInfo = signal<DocInfo | null>(null);
export const loadingActive = signal(false);
export const toasts = signal<Toast[]>([]);
export const welcomeOpen = signal(true);
export const aboutOpen = signal(false);

export function setDocInfo(value: DocInfo | null): void {
  docInfo.value = value;
}
