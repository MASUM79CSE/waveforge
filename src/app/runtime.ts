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
import { pushError } from './errorLog';
import { ZERO_CROSS_RADIUS_S } from '../core/constants';
import { snapEdgeToBeat } from '../engine/bpm';

/** Max distance (s) for a selection edge to snap onto a beat. */
const BEAT_SNAP_RADIUS_S = 0.08;
import { getSharedContext, resumeSharedContext } from '../io/decode';
import { tError } from '../i18n';
import * as S from './state';
import { invalidateAnalysis } from './analysisActions';
import { notifyAutosaveEdit } from './draftActions';

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
  invalidateAnalysis();
  S.restoreStamp.value = null; // an explicit load supersedes the restore offer
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
  invalidateAnalysis();
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
  notifyAutosaveEdit();
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

// ---- local error log (§6.3 #8): capture globals, never networked ----
window.addEventListener('error', (e) => {
  pushError({
    message: e.message,
    detail: e.error?.name ?? 'Error',
    stack: e.error?.stack?.slice(0, 2000),
    time: Date.now(),
  });
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason as Error | undefined;
  pushError({
    message: String(r?.message ?? e.reason),
    detail: 'unhandledrejection',
    stack: r?.stack?.slice(0, 2000),
    time: Date.now(),
  });
});

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

/** Selection snap: beats take priority over zero-crossings (ADR 007). */
function snapSelection(sel: { start: number; end: number } | null): { start: number; end: number } | null {
  const doc = getDoc();
  if (!sel || !doc) return sel;
  if (!S.zeroCrossEnabled.value && !S.beatsShown.value) return sel;
  const beats = S.beats.value;
  const beatRadius = Math.min(BEAT_SNAP_RADIUS_S, (beats.length > 1 ? (beats[1]! - beats[0]!) : 1) / 4);
  const radius = doc.sampleRate * ZERO_CROSS_RADIUS_S;
  const data = doc.channelData(0);
  const snapEdge = (t: number): number => {
    if (S.beatsShown.value && beats.length > 0) {
      const snapped = snapEdgeToBeat(beats, t, beatRadius);
      if (snapped !== t) return snapped; // beat wins
    }
    if (!S.zeroCrossEnabled.value) return t;
    return findZeroCross(data, Math.round(t * doc.sampleRate), radius) / doc.sampleRate;
  };
  const s = snapEdge(sel.start);
  const e = snapEdge(sel.end);
  return {
    start: Math.min(s, e),
    end: Math.max(s, e),
  };
}
