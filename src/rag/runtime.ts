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
/** P3.6 — true while a transcript-index job (chunk → embed → store) runs. */
export const ragIndexBusy = signal(false);
// Dialog open flags live in src/app/state.ts (shared with the host + keyboard chain).
export const ragConsentOpen = modelConsentOpen;
export const ragManageOpen = manageModelsOpen;

let storage: ModelStorage | null = null;
let indexStore: import('./retrieval/indexStore').IndexStorage | null = null;

/** The embedding model used for chunk vectors (D8: MiniLM class, q8). */
export const EMBED_MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

function fakeMode(): boolean {
  return Boolean((window as unknown as Record<string, unknown>)['__wfRagTest'] !== undefined &&
    ((window as unknown as { __wfRagTest?: { useFakeAsr?: () => void } })['__wfRagTest']?.useFakeAsr !== undefined));
}

async function getIndexStore(): Promise<import('./retrieval/indexStore').IndexStorage> {
  if (!indexStore) {
    const { createIndexStorage } = await import('./retrieval/indexStore');
    const { openIndexDB } = await import('./retrieval/indexStore');
    indexStore = createIndexStorage(await openIndexDB(indexedDB as never));
  }
  return indexStore;
}

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
    /** P4.5 — force Ask onto the deterministic fake LLM client (CI). */
    useFakeLlm: () => {
      fakeLlm = true;
    },
    /** P4.7 e2e — inject an untrusted (hostile) transcript directly. */
    seedTranscript: (segments: Array<{ start: number; end: number; text: string }>) => {
      ragTranscript.value = {
        id: 'seed@1/hostile',
        modelId: 'test-model',
        modelVersion: '1.0.0',
        fingerprint: 'hostile',
        language: 'en',
        segments,
        createdAt: 1,
        stale: false,
      };
    },
    transcribe: (modelId: string) => startTranscription(modelId),
    /** P5.5 e2e — current document sample length (ONE-undo assertions). */
    docLength: (): number => getDoc()?.length ?? 0,
  };
}

// ── P2.7: transcription job controller wiring ────────────────────────

let fakeAsr = false;
let fakeLlm = false;
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

/**
 * P3.6 — index the CURRENT transcript (chunk → embed → IDB store) so the
 * transcript panel can run hybrid search over it. Idempotent per
 * transcript (short-circuit unless `force`); flips `ragIndexBusy`.
 */
export async function indexTranscript(
  opts: { signal?: AbortSignal; force?: boolean; onProgress?: (pct: number) => void } = {},
): Promise<import('./retrieval/indexJob').IndexRunResult> {
  if (ragIndexBusy.value) {
    throw new (await import('./retrieval/indexJob')).IndexError('INDEX_FAILED', 'indexing already running');
  }
  const record = ragTranscript.value;
  if (!record) {
    throw new (await import('./retrieval/indexJob')).IndexError('NO_SEGMENTS', 'no transcript to index');
  }
  ragIndexBusy.value = true;
  try {
    const { createIndexController } = await import('./retrieval/indexJob');
    const { createEmbedClient, createFakeEmbedClient, createEmbedWorker } = await import('./retrieval/embedClient');
    const fake = fakeMode();
    const modelId = fake ? 'fake-embed' : EMBED_MODEL_ID;
    const storage = getStorage();
    const version = fake ? '1.0.0' : await storage.installedVersion(modelId);
    const controller = createIndexController({
      index: await getIndexStore(),
      makeEmbedder: () =>
        fake ? createFakeEmbedClient() : createEmbedClient(() => createEmbedWorker() as never),
      embedModel: { modelId, version: version ?? '0' },
      installedVersion: async (id) => (fake ? (id === 'fake-embed' ? '1.0.0' : null) : storage.installedVersion(id)),
      clock: () => Date.now(),
    });
    return await controller.run(record, {
      signal: opts.signal,
      force: opts.force,
      device: 'wasm',
      onProgress: (p) => opts.onProgress?.(p),
    });
  } finally {
    ragIndexBusy.value = false;
  }
}

/**
 * P3.7 — hybrid search over the CURRENT transcript's index. Returns []
 * when there is no transcript or no index yet (the panel builds the
 * index on first search via `indexTranscript`). The query embedder
 * always matches the model that produced the stored vectors.
 */
export async function searchTranscript(
  query: string,
  opts: { topK?: number; mode?: 'hybrid' | 'lexical' | 'vector' } = {},
): Promise<Array<{ chunk: import('./retrieval/indexStore').StoredChunk; score: number }>> {
  const record = ragTranscript.value;
  if (!record || query.trim().length === 0) return [];
  const mode = opts.mode ?? 'hybrid';
  const rows = (await getIndexStore())
    .loadAll()
    .then((all) => all.filter((r) => r.transcriptId === record.id));
  const all = await rows;
  if (all.length === 0) return [];
  const fake = fakeMode();
  const modelId = all[0]!.modelId;
  const { SearchIndex } = await import('./retrieval/search');
  // Lexical mode needs no query vector at all.
  if (mode === 'lexical') {
    const idx = new SearchIndex({ embedQuery: () => new Float32Array(0) });
    idx.load(all);
    return idx.query(query, { topK: opts.topK ?? 5, mode });
  }
  // Embed the query ONCE up front (async is fine here); the SearchIndex
  // takes a sync embedder, so it gets a closure over the fixed vector.
  let qvec: Float32Array;
  if (fake || modelId === 'fake-embed') {
    const { embedTexts } = await import('./retrieval/embedFake');
    qvec = embedTexts([query])[0]!;
  } else {
    const { createEmbedClient, createEmbedWorker } = await import('./retrieval/embedClient');
    const client = createEmbedClient(() => createEmbedWorker() as never);
    try {
      const version = (await getStorage().installedVersion(modelId)) ?? '0';
      await client.init({ modelId, version, device: 'wasm' });
      const res = await client.embed([query]);
      qvec = res.vectors[0]!;
    } finally {
      client.close();
    }
  }
  const idx = new SearchIndex({ embedQuery: () => qvec });
  idx.load(all);
  return idx.query(query, { topK: opts.topK ?? 5, mode });
}

// ── P4.8: Ask (question answering over the transcript) ───────────────

/** One rendered Ask exchange (capped history — new signal, no renames). */
export interface AskTurn {
  id: number;
  query: string;
  status: 'answer' | 'insufficient';
  text: string;
  citations: Array<{ chunkId: string; startSec: number; endSec: number; quote: string }>;
  provider: 'extractive' | 'local-llm' | 'none';
  /** 'chat' = smalltalk routed away from the transcript answerer. */
  note?: 'chat';
}

export const ragAskHistory = signal<AskTurn[]>([]);
/** Opt-in for the local LLM provider — OFF by default (P4.5). */
export const ragAskUseLlm = signal(false);
export const ragAskBusy = signal(false);

let askSeq = 0;

/**
 * P4.8 — full ask pipeline: intent → rewrite → (auto-index) → hybrid
 * retrieval → sufficiency → provider (extractive default; fake/real
 * LLM only when opted in) → grounding gate (inside the provider).
 * Everything stays on-device.
 */
export async function askTranscript(
  rawQuery: string,
  opts: { signal?: AbortSignal } = {},
): Promise<AskTurn> {
  const query = rawQuery.trim();
  if (query.length === 0 || ragAskBusy.value) {
    throw new Error('ask: empty query or busy');
  }
  const { routeIntent } = await import('./ask/intent');
  const routed = routeIntent(query);
  const base: AskTurn = {
    id: ++askSeq,
    query,
    status: 'insufficient',
    text: '',
    citations: [],
    provider: 'none',
  };
  if (routed.intent === 'chat') {
    const turn: AskTurn = { ...base, note: 'chat' };
    ragAskHistory.value = [turn, ...ragAskHistory.value].slice(0, 5);
    return turn;
  }
  ragAskBusy.value = true;
  try {
    const record = ragTranscript.value;
    if (!record) return base;
    const { rewriteQuery } = await import('./ask/rewrite');
    const rewritten = rewriteQuery(query, ragAskHistory.value.map((t) => ({ query: t.query })));

    // ensure an index exists (auto-build on first ask, like search)
    const store = await getIndexStore();
    let rows = (await store.loadAll()).filter((r) => r.transcriptId === record.id);
    if (rows.length === 0 && !ragIndexBusy.value) {
      await indexTranscript({ signal: opts.signal });
      rows = (await store.loadAll()).filter((r) => r.transcriptId === record.id);
    }
    if (rows.length === 0) return base;

    const { assessSufficiency } = await import('./ask/sufficiency');
    const hits = await searchTranscript(rewritten.query, { topK: 5, mode: 'hybrid' });
    const suff = assessSufficiency({ hits: hits.length, bestScore: hits[0]?.score ?? 0 });
    const evidence = hits.map((h) => ({
      id: h.chunk.id,
      text: h.chunk.text,
      startSec: h.chunk.startSec,
      endSec: h.chunk.endSec,
    }));
    const ctx = { evidence, confidence: suff.confidence, signal: opts.signal };

    // provider selection: extractive default; LLM only when opted in
    const llmEntry = llmModelChoice();
    const llmVersion = await getStorage().installedVersion(llmEntry.id);
    const wantLlm = ragAskUseLlm.value && (fakeLlm || llmVersion !== null);
    const { createExtractiveProvider } = await import('./ask/extractive');
    let provider: import('./ask/provider').AskProvider = createExtractiveProvider();
    if (wantLlm) {
      const { createLlmProvider } = await import('./ask/llmProvider');
      const { createLlmClient, createFakeLlmClient, createLlmWorker } = await import('./ask/llmClient');
      provider = createLlmProvider({
        client: fakeLlm
          ? createFakeLlmClient()
          : createLlmClient(() => createLlmWorker() as never),
        modelId: llmEntry.id,
        version: fakeLlm ? '1.0.0' : (llmVersion ?? '0'),
      });
    }
    const answer = await provider.answer({ query: rewritten.query }, ctx);
    const turn: AskTurn = {
      id: ++askSeq,
      query,
      status: answer.status,
      text: answer.status === 'answer' ? answer.text : '',
      citations: answer.citations.map((c) => ({ ...c })),
      provider: answer.provider,
    };
    ragAskHistory.value = [turn, ...ragAskHistory.value].slice(0, 5);
    return turn;
  } finally {
    ragAskBusy.value = false;
  }
}

/** The opted-in LLM entry (registry or seam); falls back to a stub id. */
function llmModelChoice(): import('./models/manifest').ModelEntry {
  return (
    ragModelChoices().find((m) => m.kind === 'llm') ?? {
      id: 'waveforge-llm-small',
      kind: 'llm',
      version: '0',
      files: [],
      licence: 'n/a',
      sourceUrl: 'https://example.invalid/llm',
      minProfile: 'standard',
    }
  );
}
