/**
 * Draft + autosave actions (M6): the browser bridge between the storage
 * layer (ADR 008) and the app. Drafts decode through the same AudioDocument
 * pipeline as files; the autosave ring snapshots the live document on the
 * controller's schedule; quota problems surface as WF-E401 via the drafts
 * manager — never as silent data loss (§6.3.5).
 */
import { logger } from '../core/logger-instance';
import { isWaveForgeError, makeError } from '../core/errors';
import { AudioDocument } from '../engine/AudioDocument';
import { t } from '../i18n';
import { AutosaveController } from '../storage/autosave';
import { openDraftDb } from '../storage/db';
import { encodeDraft, encodeDraftTracks } from '../storage/draftPayload';
import { IdbDraftRepository } from '../storage/DraftRepository';
import type { DraftSummary } from '../storage/DraftRepository';
import { toastError, toastInfo } from './actions';
import { exportProjectTracks, restoreProjectTracks } from './projectActions';
import { currentChannels } from './editActions';
import { bufferFactory, getDoc, installDoc, engine } from './runtime';
import * as S from './state';

const STORAGE_PRESSURE = 0.9;
const OPEN_RETRIES = 2;
const OPEN_RETRY_MS = 300;

let repoPromise: Promise<IdbDraftRepository> | null = null;

/** Bounded-retry DB open (§6.3.3 — versionchange races, private mode). */
function repo(): Promise<IdbDraftRepository> {
  if (!repoPromise) {
    repoPromise = (async () => {
      let lastError: unknown = null;
      for (let attempt = 0; attempt <= OPEN_RETRIES; ++attempt) {
        try {
          return new IdbDraftRepository(await openDraftDb());
        } catch (error) {
          lastError = error;
          await new Promise((resolve) => setTimeout(resolve, OPEN_RETRY_MS));
        }
      }
      throw makeError('WF-E402', { detail: 'database unavailable' }, lastError);
    })();
  }
  return repoPromise;
}

// ---- drafts manager ----

export async function refreshDrafts(): Promise<void> {
  S.draftsBusy.value = true;
  try {
    const [all, usage] = await Promise.all([
      (await repo()).findAll(),
      readUsage(),
    ]);
    S.draftsList.value = all.map((row) => rowToView(row));
    S.draftsUsage.value = usage;
  } catch (error) {
    toastError(t().draftListFailed);
    logger.error('draft list failed', { detail: String(error) });
  } finally {
    S.draftsBusy.value = false;
  }
}

export function openDraftsDialog(): void {
  S.draftsOpen.value = true;
  void refreshDrafts();
}

export function closeDraftsDialog(): void {
  S.draftsOpen.value = false;
}

export function openSaveDraftDialog(): void {
  if (!getDoc()) {
    toastInfo(t().draftNothingToSave);
    return;
  }
  S.draftSaveOpen.value = true;
}

export function closeSaveDraftDialog(): void {
  S.draftSaveOpen.value = false;
}

export async function confirmSaveDraft(name: string): Promise<void> {
  const doc = getDoc();
  if (!doc || S.draftsBusy.value) return;
  const trimmed = name.trim().slice(0, 200) || t().draftUntitled;
  if (!(await guardQuota())) return;
  S.draftsBusy.value = true;
  try {
    await (await repo()).save({
      name: trimmed,
      sampleRate: doc.sampleRate,
      channels: doc.channels === 1 ? 1 : 2,
      length: doc.length,
      audio: currentChannels(),
      cursor: engine.cursor,
      selection: S.selection.value ?? undefined,
      noisePrint: S.sessionNoisePrint.value
        ? Array.from(S.sessionNoisePrint.value)
        : undefined,
      tracks: exportProjectTracks() ?? undefined,
    });
    toastInfo(t().draftSaved(trimmed));
    S.draftSaveOpen.value = false;
  } catch (error) {
    reportDraftError(error);
  } finally {
    S.draftsBusy.value = false;
  }
}

export async function openDraft(id: string): Promise<void> {
  const summary = S.draftsList.value.find((row) => row.id === id);
  S.draftsBusy.value = true;
  try {
    const record = await (await repo()).findById(id);
    if (!record) return;
    const buffer = bufferFactory(record.channels, record.header.sampleRate);
    installDoc(
      new AudioDocument(buffer, {
        name: record.header.name,
        sizeBytes: summary?.sizeBytes ?? 0,
        source: 'draft',
      }),
    );
    if (record.tracks && record.tracks.length > 0) {
      restoreProjectTracks(record.tracks); // M8e: lanes ride the draft
    }
    if (record.header.cursor !== undefined) engine.seek(record.header.cursor);
    S.sessionNoisePrint.value = record.header.noisePrint
      ? Float32Array.from(record.header.noisePrint)
      : null;
    S.draftsOpen.value = false;
    toastInfo(t().draftOpened(record.header.name));
  } catch (error) {
    // WF-E402: row stays listed; delete remains available — never blocks (§6.3)
    reportDraftError(error);
  } finally {
    S.draftsBusy.value = false;
  }
}

export async function deleteDraft(id: string): Promise<void> {
  try {
    await (await repo()).delete(id);
    await refreshDrafts();
  } catch (error) {
    reportDraftError(error);
  }
}

export async function renameDraft(id: string, name: string): Promise<void> {
  const trimmed = name.trim().slice(0, 200);
  if (!trimmed) return;
  try {
    await (await repo()).update(id, { name: trimmed });
    await refreshDrafts();
  } catch (error) {
    reportDraftError(error);
  }
}

// ---- autosave ring ----

export const autosave = new AutosaveController({
  write: async () => {
    const doc = getDoc();
    if (!doc) return;
    await (await repo()).writeAutosave({
      name: doc.meta.name,
      sampleRate: doc.sampleRate,
      channels: doc.channels === 1 ? 1 : 2,
      length: doc.length,
      audio: currentChannels(),
      cursor: engine.cursor,
      selection: S.selection.value ?? undefined,
      noisePrint: S.sessionNoisePrint.value
        ? Array.from(S.sessionNoisePrint.value)
        : undefined,
      tracks: exportProjectTracks() ?? undefined,
    });
  },
  clear: async () => {
    await (await repo()).clearAutosave();
  },
  read: async () => {
    const record = await (await repo()).readAutosave();
    if (!record) return null;
    // payload already validated by decode; encode back for the generic read
    if (record.tracks) {
      return encodeDraftTracks(record.header, record.tracks, { compress: false });
    }
    return encodeDraft(record.header, record.channels, { compress: false });
  },
});

/** Boot probe: offer crash recovery when a ring record exists. */
export async function probeAutosave(): Promise<void> {
  try {
    const stamp = await (await repo()).readAutosaveStamp();
    if (stamp !== null) S.restoreStamp.value = stamp;
  } catch {
    /* no recoverable state — boot continues silently */
  }
}

export async function restoreAutosave(): Promise<void> {
  const record = await (await repo()).readAutosave();
  S.restoreStamp.value = null;
  if (!record) return;
  const buffer = bufferFactory(record.channels, record.header.sampleRate);
  installDoc(
    new AudioDocument(buffer, {
      name: record.header.name,
      sizeBytes: 0,
      source: 'draft',
    }),
  );
  if (record.tracks && record.tracks.length > 0) {
    restoreProjectTracks(record.tracks); // M8e: lanes ride the autosave
  }
  if (record.header.cursor !== undefined) engine.seek(record.header.cursor);
  S.sessionNoisePrint.value = record.header.noisePrint
    ? Float32Array.from(record.header.noisePrint)
    : null;
  toastInfo(t().draftRestored(record.header.name));
}

export async function discardAutosave(): Promise<void> {
  S.restoreStamp.value = null;
  await autosave.discard();
}

/** Edit pipeline hook — runtime.performEdit calls this after each commit. */
export function notifyAutosaveEdit(): void {
  autosave.notifyEdit();
}

// ---- quota guard (§6.3.5) ----

async function readUsage(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usage, quota };
}

/** True when the write may proceed; otherwise WF-E401 + drafts manager. */
async function guardQuota(): Promise<boolean> {
  try {
    const usage = await readUsage();
    if (!usage || usage.quota === 0) return true;
    S.draftsUsage.value = usage;
    if (usage.usage / usage.quota >= STORAGE_PRESSURE) {
      toastError(t().errors['WF-E401']);
      S.draftSaveOpen.value = false;
      S.draftsOpen.value = true;
      return false;
    }
    return true;
  } catch {
    return true; // estimate unavailable — the write path still maps quota errors
  }
}

function reportDraftError(error: unknown): void {
  if (isWaveForgeError(error)) {
    toastError(t().errors[error.code] ?? String(error.code));
    return;
  }
  logger.error('draft operation failed', { detail: String(error) });
  toastError(t().draftListFailed);
}

function rowToView(row: DraftSummary): S.DraftRow {
  return {
    id: row.id,
    name: row.name,
    updatedAt: row.updatedAt,
    duration: row.sampleRate > 0 ? row.length / row.sampleRate : 0,
    channels: row.channels,
    sizeBytes: row.payloadBytes,
    compressed: row.compressed,
  };
}
