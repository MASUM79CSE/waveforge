# Smart RAG v2 — Privacy Audit (P6.5)

Scope: the complete Smart RAG v2 surface as shipped at tag
`rag-phase-6-done`. Verdict: **the invariants hold** — audio,
transcripts, embeddings, and queries never leave the device; the only
new outbound traffic in the entire app is the consent-gated model
downloader hitting registry-documented hosts.

## 1. Egress inventory (complete)

| Path | When | Host | Gate |
| --- | --- | --- | --- |
| Model file downloads (ASR / embeddings / optional LLM) | only after the user clicks Download in the consent dialog | hosts documented per entry in `src/rag/models/manifest.ts` (test seam: `models.example`) | P1.4 consent dialog + P1.3 manifest + SHA-256 pinning |
| Everything else | — | **none** | e2e `ragEgressJourney.spec.ts` asserts `outbound == ['https://models.example/x.onnx']` on a full journey (transcribe → index → ask), filtering only localhost + the preview host |

The ML runtimes (`@huggingface/transformers` workers) run with
`allowRemoteModels=false` + `allowLocalModels=false` + a storage-backed
custom cache (asserted in `tests/rag/retrieval/embed.test.ts` worker-env
checks) — the library is structurally unable to fetch. A missing model
is a typed `MODEL_NOT_INSTALLED`, never a fetch.

## 2. Storage inventory (all on-device)

| Store | Kind | Contents | Cleared by |
| --- | --- | --- | --- |
| `waveforge-rag-models-v1` | CacheStorage | consented model files (bytes + SHA-256 metadata) | Manage models → Delete |
| `waveforge-rag-transcripts` | IndexedDB | transcript records (text + timing) keyed by model+fingerprint | manage UI / user delete |
| `waveforge-rag-index` | IndexedDB | chunk rows + 256-d float vectors | deleteDoc per transcript |
| `localStorage['wf.rag']` | localStorage | the feature flag ('1' when ON) | user |

No `sessionStorage`, no cookies, no analytics, no telemetry anywhere in
`src/rag/`. Transcripts are local-only artifacts; exports (SRT/VTT/TXT)
happen through the browser's download flow only.

## 3. Untrusted-data discipline

- Transcript text renders as TEXT NODES ONLY (never `innerHTML`);
  e2e asserts no `script/iframe/img` can be smuggled into segment,
  search-result, or ask-answer areas (`ragTranscribe`, `ragSearch`,
  `ragAsk`).
- Ask answers surface only verified transcript substrings with
  citations (grounding contract, P4.6; red-team suite, P4.7 — 15 tests).
- Smart-edit plans carry no code surface; hostile transcript text can
  only produce bounded proposals — never an execution without an
  explicit user action (P5.8 + e2e `ragEdits` hostile-transcript test).

## 4. Footprint guard

Zero audiomass.co traces (grep across src/tests/docs/index.html = 0;
the permanent e2e FORBIDDEN guard in `welcomePage.spec.ts` is green in
the release gate run). THIRD_PARTY_NOTICES lists exactly the real
dependency set (see `docs/THIRD_PARTY_NOTICES.md`).

## 5. CI model policy

CI never downloads ML models: unit tests use the deterministic 256-dim
fake embedder and the in-memory fake ASR/LLM clients; e2e uses the mock
host (`models.example`) for the downloader path with 16-byte fake
bodies. Real-model quality measurement exists only as opt-in maintainer
scripts (`scripts/rag/quality-*.mjs`), documented to download on run.
