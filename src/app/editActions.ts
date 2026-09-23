/**
 * Destructive edit actions (M2). Every mutation flows through
 * `performEdit` (stage-then-swap) so failure never touches the published
 * document, and every operation is undoable (ADR 002).
 */
import {
  GAIN_MAX_DB,
  GAIN_MIN_DB,
  NORMALIZE_TARGET_DB,
  SILENCE_MIN_MS,
  SILENCE_THRESHOLD_DB,
} from '../core/constants';
import { logger } from '../core/logger-instance';
import {
  fadeInRange,
  fadeOutRange,
  gainRange,
  invertRange,
  makeCut,
  makeInsert,
  makeOverwritePaste,
  makeRangeWrite,
  makeRemoveSilence,
  makeTrim,
  normalizeRange,
  reverseRange,
  silenceRanges,
  sliceRegion,
  type EditOutcome,
} from '../engine/editOps';
import { getDoc, engine, performEdit, runRedo, runUndo } from './runtime';
import * as S from './state';
import { t } from '../i18n';
import { toastInfo } from './actions';

interface Clipboard {
  channels: Float32Array[];
  sampleRate: number;
}

let clipboard: Clipboard | null = null;

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/** Selection as a sample range, or null when there is no usable selection. */
function selectionRange(): { start: number; len: number } | null {
  const doc = getDoc();
  const sel = S.selection.value;
  if (!doc || !sel) return null;
  const sr = doc.sampleRate;
  const start = Math.max(0, Math.round(Math.min(sel.start, sel.end) * sr));
  const end = Math.min(doc.length, Math.round(Math.max(sel.start, sel.end) * sr));
  if (end - start < 2) return null;
  return { start, len: end - start };
}

/** Edit target: the selection when present, else the whole document. */
export function targetRange(): { start: number; len: number } | null {
  const doc = getDoc();
  if (!doc || doc.length === 0) return null;
  return selectionRange() ?? { start: 0, len: doc.length };
}

export function currentChannels(): Float32Array[] {
  const doc = getDoc();
  if (!doc) return [];
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < doc.channels; ++ch) channels.push(doc.channelData(ch));
  return channels;
}

function safeEdit(run: () => EditOutcome | null, label: string): void {
  try {
    const outcome = run();
    if (outcome) performEdit(outcome, label);
  } catch (error: unknown) {
    // recover + report (never rethrow into the command runner — §6.2)
    logger.error('edit failed', { op: label, detail: String(error) });
    toastInfo(t().editFailed);
  }
}

// ---- clipboard ----

export function copySelection(): void {
  const doc = getDoc();
  const range = selectionRange();
  if (!doc || !range) {
    toastInfo(t().needsSelection);
    return;
  }
  clipboard = { channels: sliceRegion(currentChannels(), range.start, range.len), sampleRate: doc.sampleRate };
  toastInfo(t().copied);
}

export function cutSelection(): void {
  const doc = getDoc();
  const range = selectionRange();
  if (!doc || !range) {
    toastInfo(t().needsSelection);
    return;
  }
  safeEdit(() => {
    clipboard = { channels: sliceRegion(currentChannels(), range.start, range.len), sampleRate: doc.sampleRate };
    return makeCut(currentChannels(), range.start, range.len);
  }, t().opCut);
}

export function pasteFromClipboard(): void {
  const doc = getDoc();
  if (!doc) return;
  if (!clipboard) {
    toastInfo(t().nothingToPaste);
    return;
  }
  if (clipboard.sampleRate !== doc.sampleRate) {
    toastInfo(t().pasteRateMismatch);
    return;
  }

  safeEdit(() => {
    const sel = selectionRange();
    const channels = currentChannels();
    if (!sel) {
      const at = Math.min(doc.length, Math.round(S.cursorPos.value * doc.sampleRate));
      return makeInsert(channels, at, clipboard!.channels);
    }
    // overwrite-style paste: delete the selection, then insert at its start
    return makeOverwritePaste(channels, sel.start, sel.len, clipboard!.channels);
  }, t().opPaste);
}

// ---- structural selection ops ----

export function deleteSelection(): void {
  const range = selectionRange();
  if (!range) {
    toastInfo(t().needsSelection);
    return;
  }
  safeEdit(() => makeCut(currentChannels(), range.start, range.len), t().opDelete);
}

/** Trim = keep only the selection (cut before and after). */
export function trimToSelection(): void {
  const doc = getDoc();
  const range = selectionRange();
  if (!doc || !range) {
    toastInfo(t().needsSelection);
    return;
  }
  safeEdit(() => makeTrim(currentChannels(), range.start, range.len), t().opTrim);
}

export function insertSilence(): void {
  const doc = getDoc();
  if (!doc) return;
  safeEdit(() => {
    const at = selectionRange()?.start ?? Math.round(S.cursorPos.value * doc.sampleRate);
    const len = Math.round(doc.sampleRate * 1); // one second
    const silence = Array.from({ length: doc.channels }, () => new Float32Array(len));
    return makeInsert(currentChannels(), at, silence);
  }, t().opSilence);
}

// ---- range transforms (selection or whole file) ----

export function applyGainDb(db: number): void {
  const clamped = Math.max(GAIN_MIN_DB, Math.min(GAIN_MAX_DB, db));
  const range = targetRange();
  if (!range) return;
  safeEdit(() => {
    const channels = currentChannels();
    const before = sliceRegion(channels, range.start, range.len);
    const after = gainRange(channels, range.start, range.len, dbToGain(clamped));
    return makeRangeWrite(channels, range.start, before, after);
  }, t().opGain);
}

export function applyFadeIn(): void {
  const range = targetRange();
  if (!range || range.len < 2) return;
  safeEdit(() => {
    const channels = currentChannels();
    const before = sliceRegion(channels, range.start, range.len);
    const after = fadeInRange(channels, range.start, range.len);
    return makeRangeWrite(channels, range.start, before, after);
  }, t().opFadeIn);
}

export function applyFadeOut(): void {
  const range = targetRange();
  if (!range || range.len < 2) return;
  safeEdit(() => {
    const channels = currentChannels();
    const before = sliceRegion(channels, range.start, range.len);
    const after = fadeOutRange(channels, range.start, range.len);
    return makeRangeWrite(channels, range.start, before, after);
  }, t().opFadeOut);
}

export function applyNormalize(targetDb: number = NORMALIZE_TARGET_DB): void {
  const range = targetRange();
  if (!range) return;
  safeEdit(() => {
    const channels = currentChannels();
    const before = sliceRegion(channels, range.start, range.len);
    const { data, factor } = normalizeRange(channels, range.start, range.len, dbToGain(targetDb));
    if (factor === 1) {
      toastInfo(t().alreadyNormalized);
      return null;
    }
    return makeRangeWrite(channels, range.start, before, data);
  }, t().opNormalize);
}

export function applyReverse(): void {
  const range = targetRange();
  if (!range || range.len < 2) return;
  safeEdit(() => {
    const channels = currentChannels();
    const before = sliceRegion(channels, range.start, range.len);
    const after = reverseRange(channels, range.start, range.len);
    return makeRangeWrite(channels, range.start, before, after);
  }, t().opReverse);
}

export function applyInvert(): void {
  const range = targetRange();
  if (!range) return;
  safeEdit(() => {
    const channels = currentChannels();
    const before = sliceRegion(channels, range.start, range.len);
    const after = invertRange(channels, range.start, range.len);
    return makeRangeWrite(channels, range.start, before, after);
  }, t().opInvert);
}

export function applyRemoveSilence(): void {
  const doc = getDoc();
  if (!doc) return;
  safeEdit(() => {
    const channels = currentChannels();
    const threshold = dbToGain(SILENCE_THRESHOLD_DB);
    const minLen = Math.round((doc.sampleRate * SILENCE_MIN_MS) / 1000);
    const ranges = silenceRanges(channels, 0, doc.length, threshold, minLen);
    if (ranges.length === 0) {
      toastInfo(t().noSilenceFound);
      return null;
    }
    return makeRemoveSilence(channels, ranges);
  }, t().opRemoveSilence);
}

// ---- history ----

export function undo(): void {
  try {
    const label = runUndo();
    if (label) toastInfo(`${t().undid} ${label}`);
  } catch {
    logger.error('undo failed', {});
  }
}

export function redo(): void {
  try {
    const label = runRedo();
    if (label) toastInfo(`${t().redid} ${label}`);
  } catch {
    logger.error('redo failed', {});
  }
}

// ---- channel routing (playback-side, not undoable) ----

export function toggleChannelMute(ch: number): void {
  const mutes: [boolean, boolean] = [...S.channelMutes.value];
  mutes[ch] = !mutes[ch];
  S.channelMutes.value = mutes;
  engine.setChannelMute(ch, mutes[ch] ?? false);
}

export function toggleChannelsSwapped(): void {
  const next = !S.channelsSwapped.value;
  S.channelsSwapped.value = next;
  engine.setChannelsSwapped(next);
}

export function hasClipboard(): boolean {
  return clipboard !== null;
}
