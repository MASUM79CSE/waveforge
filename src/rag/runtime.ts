/**
 * Smart RAG runtime (P1.5) — the ONLY module allowed to touch model
 * storage; dynamically imported so nothing RAG lands in the entry chunk.
 * Also hosts the e2e test seam (`__wfRagTest`) behind the rag flag.
 */
import { signal } from '@preact/signals';
import { manageModelsOpen, modelConsentOpen } from '../app/state';
import type { ModelEntry } from './models/manifest';
import { MODEL_REGISTRY } from './models/manifest';
import { createModelStorage, type ModelStorage } from './models/storage';

export const ragState = signal<'idle' | 'downloading' | 'ready'>('idle');
export const ragProgress = signal(0);
export const ragPendingModel = signal<ModelEntry | null>(null);
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
  };
}
