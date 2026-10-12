# Phase 3 Report — Retrieval (Smart RAG v2)

**Branch:** `feat/smart-rag` · **Tag:** `rag-phase-3-done` · **Date:** 2026-10-12

## Scope delivered

Hybrid on-device retrieval over local transcripts: chunking, embeddings,
persistent index, hybrid search (BM25 + cosine via RRF), index job
controller, transcript-panel search UI, and a deterministic eval harness.
Zero regressions; privacy invariants unchanged (nothing leaves the device;
CI never downloads real ML models).

## Tasks

| Task | What | Status | Evidence |
| --- | --- | --- | --- |
| P3.1 | BM25 index + tokenizer | DONE | 16 tests (golden tf-idf, idf direction, tie-break) |
| P3.2 | Segment-aware chunker | DONE | 9 tests (never splits segments, overlap carry, ids `tid#k`) |
| P3.3 | Embeddings worker + deterministic fake | DONE | 9 tests (protocol zod, transferables, NOT_INITIALIZED/MODEL_NOT_INSTALLED) + D8 |
| P3.4 | Index store (IDB) | DONE | 8 tests (atomic putDoc, quota→RagQuotaError, corrupt-row drop) |
| P3.5 | Hybrid search + RRF k=60 | DONE | 11 tests (hand-computed RRF golden, k-dominance, degenerate modes) |
| P3.6 | Index job controller + `ragIndexBusy` | DONE | 10 tests (typed errors, idempotency, abort leaves no rows, IDB e2e) |
| P3.7 | Transcript-panel search UI | DONE | e2e ragSearch 2/2 (click/Enter seek, axe 0, inert text, reopen) + D9 |
| P3.8 | Deterministic eval harness | DONE | 5 tests (hit@1/hit@3 + MRR fixed thresholds, distractor guard) |
| P3.9 | Full gate + tag + report | DONE | see Gate below |

## Gate (real output, this tree)

- Unit/integration: `vitest run` → **Test Files 110 passed (110), Tests 964 passed (964)** (P2 end: 896).
- `tests/rag`: 244 passing (bm25 16, chunk 9, embed 9, indexStore 8, search 11, indexJob 10, eval 5, earlier 176).
- tsc `--noEmit`: **0 errors**. eslint (touched dirs): **0 problems**.
- Bundle gate: entry **122,347 B gz** vs baseline 120,554 / limit 122,602 → **+1,793 ≤ +2,048 ✓** (workers carrying transformers.js are lazy chunks, never the entry).
- e2e: **69 passed** (`chromium-fake-media`; 67 prior + 2 ragSearch). Playwright preview project unchanged (1 test, run separately).

## Architecture fit

- Pure kernels (`bm25`, `chunk`, `embedFake`, `search`, `eval/*`) — no I/O, fully deterministic.
- Workers + transferables + cancelable: embed results ride the transfer list; every job takes an `AbortSignal` (abort = no partial rows).
- zod boundaries: embed protocol messages validated; `z.input` for client-facing option types.
- Signals: `ragIndexBusy` is a NEW signal (no renames); panel state flows unchanged.
- `performEdit` untouched — Phase 3 is read-only retrieval; models propose nothing, code computes everything.
- Untrusted data: transcripts render as TEXT NODES ONLY (search snippets included; e2e asserts no script/iframe/img smuggling).

## Privacy

- All retrieval paths are local (IDB + workers). Query embeddings run in the
  same sandboxed worker contract as ASR (`allowRemoteModels=false`,
  `allowLocalModels=false`, vendored ORT under `/rag-assets/ort/`).
- CI uses the deterministic 256-dim fake embedder — no model downloads, ever.

## Decisions recorded (new in Phase 3)

- **D8** — embeddings reuse `@huggingface/transformers` `feature-extraction`
  (MiniLM class, q8, mean+normalize) behind the P2.5 offline contract; the
  deterministic fake (overlap-sensitive, NOT semantic) backs CI; real-model
  quality checks are opt-in scripts at P6.
- **D9** — panel search runs **lexical** mode: RRF cannot say "no matches"
  without a calibrated score floor, and fake-embedder hash noise would leak
  into UX. Hybrid stays the engine default and is what the eval measures;
  semantic UI ranking returns at P4 once a floor is calibrated.

## Known notes

- P3.3 docs originally said "14 tests" for embed; the correct count is 9
  (row corrected here; PROGRESS.md row fixes deferred to P6 docs pass).
- `ragIndexBusy` guards concurrent index jobs; transcription and indexing
  are independent jobs (indexing a transcript does not block playback).
- Eval thresholds are code-fixed (`tests/rag/eval/searchEval.test.ts`);
  the golden corpus lives in `src/rag/eval/corpus.ts` for reuse.

## Next

Phase 4 — Ask (intent router, extractive default, opt-in WebLLM, grounding,
injection red-team). Awaiting `PROCEED TO PHASE 4`.
