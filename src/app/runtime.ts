/**
 * Runtime singletons + engine↔UI wiring. The engine layer never imports
 * signals; this module is the only bridge (Build Plan §3 golden rule 1).
 */
import { AudioDocument, type AudioBufferLike } from '../engine/AudioDocument';
import { AudioEditor, type BufferFactory } from '../engine/AudioEditor';
import { AudioEngine } from '../engine/AudioEngine';
import { PeakClient } from '../engine/peakClient';
import { WaveRenderer } from '../engine/WaveRenderer';
import { findZeroCross, type EditOutcome } from '../engine/editOps';
import { toastInfo } from './actions';
import { ZERO_CROSS_RADIUS_S } from '../core/constants';
import { getSharedContext, resumeSharedContext } from '../io/decode';
import { tError } from '../i18n';
import * as S from './state';

export const engine = new AudioEngine();
export const renderer = new WaveRenderer();

export const bufferFactory: BufferFactory = (channels, sampleRate): AudioBufferLike => {
  const ctx = getSharedContext();
  const buffer = ctx.createBuffer(channels.length, channels[0]?.length ?? 0, sampleRate);
  for (let ch = 0; ch < channels.length; ++ch) {
    buffer.copyToChannel((channels[ch] ?? new Float32Array(0)) as Float32Array<ArrayBuffer>, ch);
  }
  return buffer;
};

/** 256 MB edit-history byte budget, minimum 10 kept steps (ADR 002). */
export const editor = new AudioEditor(bufferFactory, { maxBytes: 256 * 1024 * 1024, minKeep: 10 });

let peaks: PeakClient | null = null;

export function getDoc(): AudioDocument | null {
  return engine.document;
}

export function getPeaks(): PeakClient | null {
  return peaks;
}

function updateHistorySignals(): void {
  S.canUndo.value = editor.canUndo();
  S.canRedo.value = editor.canRedo();
}

/** Fresh load: resets view, history and transport. */
export function installDoc(doc: AudioDocument | null): void {
  engine.setDocument(doc);
  peaks?.dispose();
  peaks = doc ? new PeakClient(doc.buffer) : null;
  renderer.setDocument(doc, peaks);
  renderer.cursor = 0;
  if (doc) editor.adopt(doc);
  else editor.reset();
  updateHistorySignals();

  if (doc) {
    S.setDocInfo({
      name: doc.meta.name,
      duration: doc.duration,
      sampleRate: doc.sampleRate,
      channels: doc.channels,
      sizeBytes: doc.meta.sizeBytes,
    });
    S.selection.value = null;
  } else {
    S.setDocInfo(null);
    S.selection.value = null;
  }
}

/** Post-edit swap: keeps the view and (clamped) cursor, rebuilds peaks. */
export function swapDoc(doc: AudioDocument, keepCursorSeconds: number): void {
  engine.setDocument(doc);
  peaks?.dispose();
  peaks = new PeakClient(doc.buffer);
  renderer.setDocument(doc, peaks, { keepView: true });

  S.setDocInfo({
    name: doc.meta.name,
    duration: doc.duration,
    sampleRate: doc.sampleRate,
    channels: doc.channels,
    sizeBytes: doc.meta.sizeBytes,
  });
  S.selection.value = null;
  engine.seek(Math.min(keepCursorSeconds, doc.duration));
}

/** Stage-then-swap edit execution (Build Plan §6.3). */
export function performEdit(outcome: EditOutcome, label: string): boolean {
  const doc = editor.execute(outcome, label);
  if (!doc) return false;
  swapDoc(doc, engine.cursor);
  updateHistorySignals();
  return true;
}

export function runUndo(): string | null {
  const result = editor.undo();
  if (!result) return null;
  swapDoc(result.doc, engine.cursor);
  updateHistorySignals();
  return result.label;
}

export function runRedo(): string | null {
  const result = editor.redo();
  if (!result) return null;
  swapDoc(result.doc, engine.cursor);
  updateHistorySignals();
  return result.label;
}

// ---- audio unlock: browsers suspend AudioContexts until a user gesture ----
engine.onBlocked = () => toastInfo(tError('WF-E301'));
function unlockAudio(): void {
  engine.unlockFromGesture();
  resumeSharedContext();
}
document.addEventListener('pointerdown', unlockAudio);
document.addEventListener('keydown', unlockAudio);

// ---- engine → signals ----
engine.onCursor = (t) => {
  S.cursorPos.value = t;
  renderer.cursor = t;
  if (engine.playing && S.followCursor.value) renderer.followCursor(t);
  renderer.requestDraw();
};

engine.onPlayingChange = (p) => {
  S.playing.value = p;
};

// ---- renderer → signals / engine ----
renderer.onSeek = (t) => engine.seek(t);

renderer.onSelectionChange = (sel) => {
  const snapped = snapSelection(sel);
  if (snapped && sel && (snapped.start !== sel.start || snapped.end !== sel.end)) {
    renderer.setSelection(snapped); // does not re-enter this handler
  }
  S.selection.value = snapped ?? (sel as S.Selection | null);
};

renderer.onViewChange = () => {
  S.viewSpp.value = renderer.view.spp;
  S.viewStart.value = renderer.view.start;
};

/** Zero-crossing snap on selection commit (toggleable, AudioMass parity). */
function snapSelection(sel: { start: number; end: number } | null): { start: number; end: number } | null {
  const doc = getDoc();
  if (!sel || !S.zeroCrossEnabled.value || !doc) return sel;
  const radius = doc.sampleRate * ZERO_CROSS_RADIUS_S;
  const data = doc.channelData(0);
  const s = findZeroCross(data, Math.round(sel.start * doc.sampleRate), radius);
  const e = findZeroCross(data, Math.round(sel.end * doc.sampleRate), radius);
  return {
    start: Math.min(s, e) / doc.sampleRate,
    end: Math.max(s, e) / doc.sampleRate,
  };
}
