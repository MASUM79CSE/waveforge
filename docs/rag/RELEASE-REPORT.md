# Smart RAG v2 — RELEASE REPORT

**Branch:** `feat/smart-rag` · **Tag:** `rag-phase-6-done` · **Date:** 2026-10-12
**Feature flag:** `?rag=1` / `localStorage['wf.rag'] = '1'` — flag OFF ⇒ the app is
behaviorally identical to v1 (flag-gated dynamic imports; zero entry-bundle RAG
runtime beyond 2.0 KB gz of plumbing, see D12 accounting).

## 1. What shipped

On-device AI over your recordings — nothing leaves the browser:

- **Transcription** (P2): consented, SHA-256-pinned Whisper-class models;
  progress + cancel; transcript panel with click-to-seek, active highlight,
  copy; SRT/VTT/TXT export; egress-journey-tested.
- **Retrieval** (P3): segment-aware chunking → embeddings (real MiniLM-class or
  deterministic CI fake) → IndexedDB index → hybrid search (BM25 + cosine via
  RRF k=60) → debounced panel search with seekable results.
- **Ask** (P4): intent router → history-aware rewrite → hybrid retrieval →
  sufficiency calibration → EXTRACTIVE answers quoted with seekable citations
  (zero-ML default) → optional local LLM (same transformers.js, same consent
  pipeline) that must pass the grounding gate or falls back → prompt-injection
  red-team guarantee: only verified transcript substrings ever surface.
- **Smart edits** (P5): zod-bounded edit plans (delete / silence / gain /
  insert-silence) from selection, ask citations, or en/bn natural language →
  doc-aware normalization with hard caps → executed through `performEdit` as
  exactly ONE undo step; preview (seek+play+timed pause); chapters derived
  from the transcript.
- **Release hardening** (P6): full Bangla UI (419-key catalog, parity-tested),
  failure-mode matrix, privacy audit, scale harness (1-hour transcript
  end-to-end), opt-in real-model quality tools, re-baselined bundle gate.

## 2. Release gate (real output, this tree)

| Gate | Result |
| --- | --- |
| Unit/integration (`vitest run`) | **1110 passed / 1110** (126 files) |
| e2e (`playwright test`, both projects) | **75 passed / 75** (74 `chromium-fake-media` + 1 `chromium-preview` offline reload) |
| tsc `--noEmit` | 0 errors |
| eslint (src+tests) | 0 errors, 0 warnings |
| Bundle gate | entry **128,447 B gz** = baseline (D12 accounting: RAG +2,039 over five phases, each ≤ +2,048; full bn catalog +5,854 as a one-time release addition) |
| Lazy audit | 0 `transformers` references in the entry chunk; runtimes only in `asr.worker` / `embed.worker` / `llm.worker` chunks |
| Lighthouse (vite preview :4179) | desktop **100 / 100 / 100 / 100** · mobile **98 / 100 / 100 / 100** |
| Scale harness | 1 h transcript (720 seg): chunk 1 ms · embed 9 ms · 20 searches 16 ms · ask 3 ms · chapters 0 ms |
| Footprint | audiomass.co traces: **0** (grep + permanent e2e guard) |

## 3. Invariants ledger (all verified, evidence cited)

| Invariant | Evidence |
| --- | --- |
| Audio/transcripts/embeddings/queries never leave the device | `docs/rag/PRIVACY-AUDIT.md` (complete egress + storage ledger); e2e `ragEgressJourney` — outbound = consented model host only |
| New traffic = consented downloads from documented hosts only | P1.4 consent dialog; manifest hosts; downloader hash-pinning tests |
| No cloud providers without `ENABLE CLOUD PROVIDER` | none used — decision ledger D1–D12 |
| Models never fetched behind the user's back | workers run `allowRemoteModels=false` + storage custom cache (unit-asserted); missing model = typed `MODEL_NOT_INSTALLED` |
| Flag OFF ⇒ behaviorally identical app | flag-gated dynamic imports; commands guarded by `isRagEnabled()`; e2e welcome/v1 flows green |
| Models propose, deterministic code computes + executes | smart-edit plans are data; planners/normalize/caps are pure; ONE `performEdit` per apply (e2e exact-length undo test) |
| Transcripts = untrusted data (text nodes only) | e2e inertness assertions in `ragTranscribe` / `ragSearch` / `ragAsk` / `ragEdits`; red-team suite (15 tests) |
| New UI keyboard-operable + axe-clean + en/bn | 22 axe assertions across 6 rag e2e specs; i18n parity test (419 keys) |
| Never claim a gate without pasted real output | every PROGRESS row + phase report carries measured numbers |
| CI never downloads ML models | deterministic fakes only; real-model tools are opt-in maintainer scripts |

## 4. Accessibility & i18n sweep (P6.3/P6.4)

| Surface | axe (wcag2a+aa) | en/bn |
| --- | --- | --- |
| Welcome / About | ✅ (welcomePage specs) | ✅ |
| Consent + Manage models dialogs | ✅ (ragConsent) | ✅ |
| Transcript panel + segments | ✅ (ragPanel, ragTranscribe) | ✅ |
| Transcript search | ✅ (ragSearch) | ✅ |
| Ask (incl. insufficient/chat states) | ✅ (ragAsk) | ✅ |
| Smart edits + chapters | ✅ (ragEdits) | ✅ |
| Main catalog (non-RAG UI) | — | ✅ full parity (P6.4, 419 keys) |

## 5. Failure coverage

18 typed failure modes, each mapped to its error, user-visible behavior, and a
named passing test — see `docs/rag/FAILURE-MODES.md`.

## 6. Rollout recommendation (P6.8)

1. **Keep the flag OFF by default** for the first release. Smart RAG is
   opt-in via `?rag=1` / `localStorage['wf.rag']='1'`; the editor's v1
   behavior and bundle are untouched for everyone else.
2. **Staged enablement**: (a) ship with flag OFF → collect diagnostics via
   the in-app Diagnostics panel; (b) flip the default ON for a small cohort
   once model-host bandwidth is provisioned; (c) default ON in a minor
   release after a soak period. **Shipped post-release:** the user-facing
   opt-in/out switch — View → Smart transcript features (beta) — an
   always-visible check item that flips `localStorage['wf.rag']` and
   reloads (e2e `ragToggle`; flag-OFF menu invariant re-specified in
   `ragPanel`). The DEFAULT remains OFF pending the product decision.
3. **Model registry**: ships empty-but-valid by policy (sizes/hashes are
   measured, never guessed). To enable a model, a maintainer runs
   `node scripts/rag/measure-model.mjs …` on a provisioned machine and
   appends the returned entry to `MODEL_REGISTRY` — the UI, consent flow,
   and verification need no code change.
4. **Rollback** = turn the flag OFF (or revert the tag); no data migration
   exists or is needed — stores are additive and v1 ignores them.
5. **Known limitations** (documented, not blockers): panel search scores
   are MiniLM cosines against `SEMANTIC_FLOOR = 0.15` (calibrated on the
   golden corpus — see D9/P6.12); queries in languages the embedder
   handles weakly may rank lower, and fake-embedder installs keep the
   literal lexical search of P3.7 without a floor (by design); the LLM
   registry entry ships via the seam until measured (D10/D12 notes); RAG
   string tables are lazy per module (en/bn parity enforced by test).

## 7. Opt-in maintainer tooling (never CI)

```
npx vite-node scripts/rag/quality-embed.mjs --model=Xenova/all-MiniLM-L6-v2
npx vite-node scripts/rag/quality-asr.mjs --model=onnx-community/whisper-tiny.en --wav=file.wav
node scripts/rag/measure-model.mjs --id=… --kind=embed --version=… --licence=… --url=…
```

Each downloads real model bytes ONLY when a maintainer runs it; output feeds
the eval ledger / registry respectively.

## 8. Decision ledger

D1–D12 in `docs/rag/DECISIONS.md` (D8 embeddings dependency, D9 lexical panel
search, D10 LLM dependency reuse, D11 smart-edit execution contract, D12
bundle rebaseline accounting). Phase reports: `PHASE-1` … `PHASE-5-REPORT.md`
plus this file.

**Status: Smart RAG v2 RELEASED at tag `rag-phase-6-done`.**

## 9. Post-release verification (2026-10-12, later run)

The full gate was re-run from a clean tree at `8b69076` (the released
commit) as a post-release sanity pass. **Every number reproduced
exactly**: unit **1110/1110** (126 files) · e2e **75/75** (both
projects) · tsc 0 · eslint 0/0 · bundle **128,447 B gz = baseline ✓**.
No drift, no flake — the release claims above are independently
reconfirmed on the same day.
