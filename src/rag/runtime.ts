/**
 * Smart RAG runtime (P1.5) — the ONLY module allowed to touch model
 * storage; dynamically imported so nothing RAG lands in the entry chunk.
 * Also hosts the e2e test seam (`__wfRagTest`) behind the rag flag.
 */
import { signal } from '@preact/signals';
import { manageModelsOpen, modelConsentOpen } from '../app/state';
import { getDoc } from '../app/runtime';
import type { ModelEntry } from './models/manifest';
import { MODEL_REGISTRY } from './models/manifest';
import { createModelStorage, type ModelStorage } from './models/storage';

export const ragState = signal<'idle' | 'downloading' | 'transcribing' | 'ready'>('idle');
export const ragProgress = signal(0);
export const ragPendingModel = signal<ModelEntry | null>(null);
/** Latest transcript for the CURRENT document (null = none/stale). */
export const ragTranscript = signal<import('./transcripts/model').TranscriptRecord | null>(null);
// Dialog open flags live in src/app/state.ts (shared with the host + keyboard chain).
export const ragConsentOpen = modelConsentOpen;
export const ragManageOpen = manageModelsOpen;

let storage: ModelStorage | null = null;

export function getStorage(): ModelStorage {
  if (!storage) storage = createModelStorage(globalThis.caches as never);
  return storage;
}

/** Open the consent dialog for a model id from the registry. */
export async function requestModel(modelId: string): Promise<void> {
  const entry = MODEL_REGISTRY.find((m) => m.id === modelId) ?? pendingTestModels.find((m) => m.id === modelId);
  if (!entry) return;
  if (await getStorage().has(entry.id)) {
    ragState.value = 'ready';
    return;
  }
  ragPendingModel.value = entry;
  ragConsentOpen.value = true;
}

const pendingTestModels: ModelEntry[] = [];

/** Models the panel can offer: registry + seam-registered test models. */
export function ragModelChoices(): ModelEntry[] {
  return [...MODEL_REGISTRY, ...pendingTestModels];
}

/** Current document as the controller's audio source (copies per call). */
function getAudioSource(): { sampleRate: number; durationSec: number; channels: Float32Array[] } | null {
  const doc = getDoc();
  if (!doc) return null;
  const channels: Float32Array[] = [];
  for (let c = 0; c < doc.channels; c++) channels.push(doc.channelData(c));
  return { sampleRate: doc.sampleRate, durationSec: doc.duration, channels };
}

/**
 * Load the stored transcript for `modelId` + the CURRENT audio into
 * `ragTranscript` (fingerprint lookup — stale docs find nothing). The
 * panel calls this on open; startTranscription supersedes it.
 */
export async function loadStoredTranscript(modelId: string): Promise<void> {
  const audio = getAudioSource();
  if (!audio) {
    ragTranscript.value = null;
    return;
  }
  const version = await getStorage().installedVersion(modelId);
  if (!version) {
    ragTranscript.value = null;
    return;
  }
  const { defaultFingerprint } = await import('./transcripts/controller');
  const { createTranscriptStorage } = await import('./transcripts/store');
  const { openTranscriptDB } = await import('./transcripts/idb');
  if (!transcriptStore) transcriptStore = createTranscriptStorage(await openTranscriptDB(indexedDB as never));
  ragTranscript.value = await transcriptStore.findForFingerprint(
    modelId,
    version,
    defaultFingerprint(audio),
  );
}

/** Download the pending model after consent (consent dialog calls this). */
export async function consentedDownload(): Promise<void> {
  const entry = ragPendingModel.value;
  if (!entry) return;
  ragState.value = 'downloading';
  ragProgress.value = 0;
  try {
    const { downloadModel } = await import('./models/downloader');
    await downloadModel(entry.id, entry, {
      storage: getStorage(),
      fetchImpl: (...args) => fetch(...args),
      onProgress: (pct) => {
        ragProgress.value = pct;
      },
    });
    ragState.value = 'ready';
  } catch (err) {
    ragState.value = 'idle';
    throw err;
  } finally {
    ragConsentOpen.value = false;
    ragPendingModel.value = null;
  }
}

/**
 * E2E test seam — only exists with the rag flag ON (see main wiring).
 * Lets Playwright register a mock-host model and drive dialogs without
 * polluting the production registry.
 */
export function installTestSeam(): void {
  (window as unknown as Record<string, unknown>)['__wfRagTest'] = {
    register: (entry: ModelEntry) => {
      pendingTestModels.push(entry);
    },
    openConsent: (modelId: string) => void requestModel(modelId),
    openManage: () => {
      ragManageOpen.value = true;
    },
    state: ragState,
    startTranscription,
    /** Force the P2.7 controller onto in-memory fake ASR clients (CI). */
    useFakeAsr: () => {
      fakeAsr = true;
    },
    transcribe: (modelId: string) => startTranscription(modelId),
  };
}

// ── P2.7: transcription job controller wiring ────────────────────────

let fakeAsr = false;
let transcriptStore: import('./transcripts/store').TranscriptStorage | null = null;

/** Transcribe the current document with an installed model (P2.7). */
export async function startTranscription(
  modelId: string,
  opts: { signal?: AbortSignal; device?: 'wasm' | 'webgpu' } = {},
): Promise<import('./transcripts/model').TranscriptRecord> {
  if (ragState.value === 'downloading' || ragState.value === 'transcribing') {
    const { TranscribeError } = await import('./transcripts/controller');
    throw new TranscribeError('TRANSCRIBE_FAILED', 'a RAG job is already running');
  }
  ragState.value = 'transcribing';
  ragProgress.value = 0;
  try {
    const mod = await import('./transcripts/controller');
    const { createTranscribeController } = mod;
    type TranscribeDeps = import('./transcripts/controller').TranscribeDeps;
    const { createTranscriptStorage } = await import('./transcripts/store');
    const { openTranscriptDB } = await import('./transcripts/idb');
    const { createFeederClient, createFeederWorker } = await import('./audio/feederClient');
    const { createAsrClient, createAsrWorker } = await import('./asr/asrClient');
    const { createFeederPumpClient } = await import('./audio/feederTestClient');
    const { createFakeAsrClient } = await import('./asr/fakeAsr');

    if (!transcriptStore) {
      transcriptStore = createTranscriptStorage(await openTranscriptDB(indexedDB as never));
    }
    const deps: TranscribeDeps = {
      storage: getStorage(),
      transcripts: transcriptStore,
      getAudio: getAudioSource,
      clock: () => Date.now(),
      makeFeeder: () => (fakeAsr ? createFeederPumpClient() : createFeederClient(() => createFeederWorker() as never)),
      makeAsr: () => (fakeAsr ? createFakeAsrClient() : createAsrClient(() => createAsrWorker() as never)),
    };
    const controller = createTranscribeController(deps);
    const record = await controller.run(modelId, {
      signal: opts.signal,
      device: opts.device,
      onProgress: (p) => {
        ragProgress.value = p;
      },
    });
    ragTranscript.value = record;
    ragState.value = 'ready';
    return record;
  } catch (err) {
    ragState.value = 'idle';
    throw err;
  }
}
