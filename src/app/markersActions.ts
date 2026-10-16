/**
 * PF-01 / AM-07 — marker flows (add/rename/delete/clear/jump/select).
 *
 * Markers are document-anchored: positions live in the engine's sample
 * domain, labels are user text (clamped by the kernel). They ride the
 * draft payload (optional field, no version bump) and render as labeled
 * flags via the waveform renderer. Marker ops are not undo steps (they
 * annotate, not edit audio — matches the reference app).
 */
import {
  defaultMarkerName,
  insertMarker,
  nearestMarker,
  nextMarker,
  prevMarker,
  removeMarker,
  renameMarker,
  type Marker,
} from '../engine/markers';
import * as S from './state';
import { engine, getDoc, renderer } from './runtime';
import { toastError as toastWarn, toastInfo } from './toast';
import { t } from '../i18n';

/** Jump-to tolerance: a marker counts as "at the cursor" within 1 s. */
const NEAR_SAMPLES = 44_100;

function renderList(): Array<{ t: number; label: string }> {
  const doc = getDoc();
  const sr = doc?.sampleRate ?? 44_100;
  return S.markers.value.map((m) => ({ t: m.t / sr, label: m.label }));
}

function syncRenderer(): void {
  renderer.setMarkers(renderList());
}

/** Clear markers when the document changes (installDoc calls this). */
export function resetMarkers(): void {
  S.markers.value = [];
  syncRenderer();
}

function cursorSample(): number {
  const doc = getDoc();
  return Math.round(S.cursorPos.value * (doc?.sampleRate ?? 44_100));
}

function anchorSample(): number {
  const sel = S.selection.value;
  if (sel) {
    const doc = getDoc();
    const sr = doc?.sampleRate ?? 44_100;
    return Math.round(Math.min(sel.start, sel.end) * sr);
  }
  return S.cursorPos.value;
}

export function openMarkerAddPrompt(): void {
  if (!getDoc()) return;
  S.markerPrompt.value = { mode: 'add', initial: defaultMarkerName(S.markers.value) };
}

/** Canvas double-click: add a marker at the clicked position (AM-07 parity). */
export function openMarkerAddPromptAt(tSec: number): void {
  const doc = getDoc();
  if (!doc) return;
  const t = Math.max(0, Math.min(Math.round(tSec * doc.sampleRate), doc.length));
  S.markerPrompt.value = {
    mode: 'add',
    initial: defaultMarkerName(S.markers.value),
    anchor: t,
  };
}

export function openMarkerRenamePrompt(): void {
  const doc = getDoc();
  if (!doc) return;
  const target = nearestMarker(S.markers.value, cursorSample(), NEAR_SAMPLES);
  if (!target) {
    toastWarn(t().markerNoneNear);
    return;
  }
  S.markerPrompt.value = { mode: 'rename', id: target.id, initial: target.label };
}

/**
 * Confirm the prompt. The prompt snapshot is captured by the CALLER's
 * closure (the dialog passes it back) — onCancel() has already cleared
 * the signal by the time this runs.
 */
export function confirmMarkerPrompt(
  label: string,
  prompt: NonNullable<typeof S.markerPrompt.value> | null,
): void {
  if (!prompt) return;
  S.markerPrompt.value = null;
  const clean = label.trim().slice(0, 200) || prompt.initial;
  if (prompt.mode === 'add') {
    const doc = getDoc();
    if (!doc) return;
    const id = `mk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const marker: Marker = { id, t: prompt.anchor ?? anchorSample(), label: clean };
    try {
      S.markers.value = insertMarker(S.markers.value, marker);
    } catch {
      return; // kernel guards (dup id / bad t) — anchor always valid here
    }
    toastInfo(t().markerAdded(clean));
  } else if (prompt.id) {
    S.markers.value = renameMarker(S.markers.value, prompt.id, clean);
    toastInfo(t().markerRenamed(clean));
  }
  syncRenderer();
}

export function closeMarkerPrompt(): void {
  S.markerPrompt.value = null;
}

export function deleteMarkerNearCursor(): void {
  const doc = getDoc();
  if (!doc) return;
  const target = nearestMarker(S.markers.value, cursorSample(), NEAR_SAMPLES);
  if (!target) {
    toastWarn(t().markerNoneNear);
    return;
  }
  S.markers.value = removeMarker(S.markers.value, target.id);
  syncRenderer();
  toastInfo(t().markerDeleted(target.label));
}

export function clearMarkers(): void {
  if (S.markers.value.length === 0) return;
  S.markers.value = [];
  syncRenderer();
  toastInfo(t().markerCleared);
}

export function jumpToPrevMarker(): void {
  const doc = getDoc();
  if (!doc) return;
  const target = prevMarker(S.markers.value, cursorSample());
  if (target) engine.seek(target.t / doc.sampleRate);
}

export function jumpToNextMarker(): void {
  const doc = getDoc();
  if (!doc) return;
  const target = nextMarker(S.markers.value, cursorSample());
  if (target) engine.seek(target.t / doc.sampleRate);
}

/** Shift-jump: select from the cursor to the previous/next marker. */
export function selectToPrevMarker(): void {
  const cur = cursorSample();
  const target = prevMarker(S.markers.value, cur);
  if (!target) return;
  selectBetween(target.t, cur);
}

export function selectToNextMarker(): void {
  const cur = cursorSample();
  const target = nextMarker(S.markers.value, cur);
  if (!target) return;
  selectBetween(cur, target.t);
}

function selectBetween(aSample: number, bSample: number): void {
  const doc = getDoc();
  if (!doc) return;
  const sr = doc.sampleRate;
  const sel = {
    start: Math.min(aSample, bSample) / sr,
    end: Math.max(aSample, bSample) / sr,
  };
  renderer.setSelection(sel);
  S.selection.value = sel;
}
