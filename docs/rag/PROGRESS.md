# WaveForge Smart RAG — Progress Ledger

> Protocol: v2 master prompt. A task is DONE only when its "Done when" list
> is satisfied, the micro-gate passed, and Evidence holds real output.
> Resume rule: start at the first task not marked DONE.

| Task | Title | Status | Commit | Evidence (command + result) | Notes |
|------|-------|--------|--------|-----------------------------|-------|
| P0.1 | Capability check + repo orientation | DONE | (this) | read/capability check in session; Orientation in DECISIONS.md | see DECISIONS.md §Orientation |
| P0.2 | Create ledger + decision log | DONE | (this) | files created; full task table P0.1–P6.9 | this file |
| P0.3 | Clean install + baseline gates | DONE | (this) | typecheck OK; lint 0; 720/720 unit (86 files); 59/59 e2e; build OK; main JS 120,084 B gz; LH d98/100/100/100 m99 | see BASELINE.md |
| P0.4 | Verify audit A1–A9 | DONE | (this) | 9 rows with file/line evidence in BASELINE.md §Audit | A7 partially pre-fixed (CI e2e job exists since f662e19) |
| P0.5 | Low-risk hygiene fixes | TODO | — | — | A5, A2, A4, A6, A9 |
| P0.6 | CI upgrade | TODO | — | — | bundle check step; e2e job already exists |
| P0.7 | Bundle-size guard | TODO | — | — | scripts/check-bundle-size.mjs + baseline json |
| P0.8 | Feature flag `rag` | TODO | — | — | src/rag/flag.ts + tests |
| P0.9 | Large-file ceiling | TODO | — | — | 10/30/60-min WAV loads in Chromium |
| P0.10 | Phase 0 gate | TODO | — | — | full gate + tag rag-phase-0-done |
| P1.1 | Capability detection | TODO | — | — | — |
| P1.2 | Typed worker RPC harness | TODO | — | — | — |
| P1.3 | Model manifest + storage | TODO | — | — | — |
| P1.4 | Resumable verified downloader | TODO | — | — | — |
| P1.5 | Consent dialog + settings | TODO | — | — | — |
| P1.6 | Headers: CSP allow-list + COOP/COEP exp. | TODO | — | — | — |
| P1.7 | Network-egress guard test | TODO | — | — | — |
| P1.8 | UI shell behind the flag | TODO | — | — | — |
| P1.9 | Lazy chunk + bundle verification | TODO | — | — | — |
| P1.10 | Phase 1 gate | TODO | — | — | — |
| P2.1 | Pure-TS resampler kernel | TODO | — | — | — |
| P2.2 | Audio feeder (16 kHz windows) | TODO | — | — | — |
| P2.3 | Transcript model + IDB store + migration | TODO | — | — | — |
| P2.4 | Timeline mapper (pure) | TODO | — | — | — |
| P2.5 | ASR worker (Whisper/transformers.js) | TODO | — | — | — |
| P2.6 | Window stitching (pure) | TODO | — | — | — |
| P2.7 | Transcription job controller | TODO | — | — | — |
| P2.8 | Transcript panel UI | TODO | — | — | — |
| P2.9 | Export SRT / VTT / TXT | TODO | — | — | — |
| P2.10 | Phase 2 e2e + docs | TODO | — | — | — |
| P2.11 | Phase 2 gate | TODO | — | — | — |
| P3.1 | Tokenizer + BM25 | TODO | — | — | — |
| P3.2 | Chunker | TODO | — | — | — |
| P3.3 | Embedding worker (+ fake) | TODO | — | — | — |
| P3.4 | Index store + migration | TODO | — | — | — |
| P3.5 | Hybrid search + RRF | TODO | — | — | — |
| P3.6 | Index job controller | TODO | — | — | — |
| P3.7 | Search UI | TODO | — | — | — |
| P3.8 | Evaluation harness | TODO | — | — | — |
| P3.9 | Phase 3 gate | TODO | — | — | — |
| P4.1 | Deterministic intent router | TODO | — | — | — |
| P4.2 | History-aware query rewrite | TODO | — | — | — |
| P4.3 | Evidence sufficiency + calibration | TODO | — | — | — |
| P4.4 | Provider interface + extractive default | TODO | — | — | — |
| P4.5 | Local LLM provider (opt-in) | TODO | — | — | — |
| P4.6 | Grounding contract | TODO | — | — | — |
| P4.7 | Prompt-injection defenses | TODO | — | — | — |
| P4.8 | Ask UI | TODO | — | — | — |
| P4.9 | Phase 4 evals | TODO | — | — | — |
| P4.10 | Phase 4 gate | TODO | — | — | — |
| P5.1 | EditPlan schema | TODO | — | — | — |
| P5.2 | Deterministic planners | TODO | — | — | — |
| P5.3 | Range normalization | TODO | — | — | — |
| P5.4 | Preview + audition UI | TODO | — | — | — |
| P5.5 | Executor through performEdit | TODO | — | — | — |
| P5.6 | Markers / chapters | TODO | — | — | — |
| P5.7 | Command integration + NL box | TODO | — | — | — |
| P5.8 | Safety review | TODO | — | — | — |
| P5.9 | Phase 5 gate | TODO | — | — | — |
| P6.1 | Scale test (1 h end-to-end) | TODO | — | — | — |
| P6.2 | Failure-mode matrix | TODO | — | — | — |
| P6.3 | Accessibility sweep | TODO | — | — | — |
| P6.4 | i18n completeness | TODO | — | — | — |
| P6.5 | Privacy audit | TODO | — | — | — |
| P6.6 | Perf / bundle / Lighthouse | TODO | — | — | — |
| P6.7 | Documentation | TODO | — | — | — |
| P6.8 | Rollout recommendation | TODO | — | — | — |
| P6.9 | Release gate + final report | TODO | — | — | — |
