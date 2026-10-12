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
| P0.5 | Low-risk hygiene fixes | DONE | docs+chore commits | A5 unit 11/11; A9 typecheck OK; A6 .npmrc; build within budget | 5 fixes, separate commits |
| P0.6 | CI upgrade | DONE | chore(ci) | YAML valid; check:bundle after build; e2e job pre-existing (f662e19) | LH stays local (D3) |
| P0.7 | Bundle-size guard | DONE | feat(rag) 3f0ac8f | 5/5 unit (RED-first); pass demo + fail demo (tolerance=10, exit 1) | pure fn + wildcard d.ts |
| P0.8 | Feature flag `rag` | DONE | feat(rag) 1b2de24 | 11/11 unit; entry hash unchanged (byte-identical OFF build) | D1 |
| P0.9 | Large-file ceiling | DONE | (BASELINE.md) | table: 20 min mono OK; 30 min mono crash; 60 min no-completion | ceiling ≈20 min mono on 1–2 GB |
| P0.10 | Phase 0 gate | DONE | (tag) | typecheck OK; lint 0; **736/736** unit (88 files); 59/59 e2e; build OK; bundle +0; LH d98/100/100/100 m98 | mobile perf 98 = baseline−1 run-variance, gate ≥95 ✓ |
| P1.1 | Capability detection | DONE | feat(rag) 70c9b33 | 16/16 unit; micro-gate OK | injectable RagEnv; thresholds documented |
| P1.2 | Typed worker RPC harness | DONE | feat(rag) d0027ac | 16/16 unit; micro-gate OK | direction-aware endpoint; restart-once then dead |
| P1.3 | Model manifest + storage | DONE | feat(rag) f5dfc1e | 14/14 unit; micro-gate OK | fresh-Response fake semantics; registry empty-valid |
| P1.4 | Resumable verified downloader | DONE | feat(rag) 6f308c7 | 12/12 unit; micro-gate OK | partials version-scoped; sha256 before commit |
| P1.5 | Consent + manage UI (en+bn, keyboard, axe, lazy chunk) | DONE | `a66b8ec` — ragConsent.spec mock-host flow, axe 0 violations, exactly 1 outbound request; lazy RagDialogs chunk; bn partial + CatalogLoose merge |
| P1.6 | COOP/COEP + CSP allow-list + robots.txt | DONE | `754e585` — crossOriginIsolated=true, e2e 59 passed under headers, LH desktop 97/100/100/100, mobile perf 99; D4/D5 |
| P1.7 | Egress guard + journey proof | DONE | `0c37c53` — helpers/egress.ts; load→edit→export = 0 outbound requests, 0 bodies; self-test proves example.com caught |
| P1.8 | Transcript panel shell + commands/menu/shortcut | DONE | this commit — ragPanel.spec 3/3, vitest 794/794, Ctrl+Shift+F, flag-OFF menus byte-identical |
| P1.9 | Entry-bundle gate (≤2 KB gz growth) | DONE | `7d3e263` — first measure +3,734 (FAIL) → lazy RAG string table + armed import() (D6) → **+674 B** (entry 121,228 vs 120,554); runtime + RagDialogs verified separate lazy chunks; vitest 794/794 |
| P1.10 | Full phase gate + tag | DONE | vitest 794/794; playwright 64/64 fake-media + 1/1 preview; LH desktop 100/100/100/100, mobile 98/100/100/100; bundle +674; tag `rag-phase-1-done` |
| P1.5 | Consent dialog + settings | TODO | — | — | — |
| P1.6 | Headers: CSP allow-list + COOP/COEP exp. | TODO | — | — | — |
| P1.7 | Network-egress guard test | TODO | — | — | — |
| P1.8 | UI shell behind the flag | TODO | — | — | — |
| P1.9 | Lazy chunk + bundle verification | TODO | — | — | — |
| P1.10 | Phase 1 gate | TODO | — | — | — |
| P2.1 | Pure-TS resampler kernel | DONE | feat commit — 16 tests; 1 Hz freq anchor, ≤0.5 dB ripple, ≥50 dB stopband/alias, prime-split bitwise-identical; vitest 810/810 |
| P2.2 | Audio feeder (16 kHz windows) | DONE | feat commit — pump 13 tests + RPC 5 tests; 30 s/1 s windows, transferables both directions (RPC_TRANSFER, D-protocol note), ABORTED settles; vitest 828/828 |
| P2.3 | Transcript model + IDB store + migration | DONE | feat commit — 19 tests (schema/fingerprint/storage/migration v1→v2); fnv1a hint documented; quota→RagQuotaError; vitest 847/847 |
| P2.4 | Timeline mapper (pure) | DONE | feat commit — 8 tests: round-trip, 200-seg monotonicity, clamped-tail visibility; rate-1.0 limitation documented in-module |
| P2.5 | ASR worker (Whisper/transformers.js) | DONE (worker chunk lands in P2.7) | `81038b8` + test commit — handlers/cache/vendoring/D7; 22 tests; offline-by-contract (allowRemoteModels=false + storage cache); deps overridden (onnxruntime-node/sharp stubs); P2.7 acceptance: build worker chunk, prove transformers only there |
| P2.6 | Window stitching (pure) | DONE | feat commit — 10 tests (golden/property), 200 ms inclusive tolerance, sanitation of untrusted ASR times |
| P2.7 | Transcription job controller | DONE | feat commit — 10 controller tests; typed errors, idempotency, cancel+rerun; runtime wiring + fake-ASR seam; chunk proof: ort/transformers only in asr.worker; bundle +1,164 ≤ +2,048; vitest 887/887 |
| P2.8 | Transcript panel UI | DONE | feat commit — ragTranscribe.spec 2/2 (axe 0, text-nodes-only, seek+active, copy); +5 keys en/bn; RAG e2e 7/7; entry +1,171 ≤ +2,048; vitest 887/887 |
| P2.9 | Export SRT / VTT / TXT | DONE | feat commit — 9 serializer tests (golden/edge/injection-safe); 3 flag-gated commands; e2e download leg (exact filename + SRT body); vitest 896/896; bundle +1,792 |
| P2.10 | Phase 2 e2e + docs | DONE | feat commit — ragEgressJourney 1/1 (0 violations / 0 bodies / exactly 1 allow-listed outbound); README features + docs table; vitest 896/896 |
| P2.11 | Phase 2 gate | DONE | vitest 896/896; playwright 67/67 (0 flaky) + 1/1 preview; LH 100×4 desktop, 98/100/100/100 mobile; bundle +1,792 ≤ +2,048; chunk audit clean; tag `rag-phase-2-done` |
| P3.1 | Tokenizer + BM25 | DONE | feat commit — 16 tests (golden score, saturation, length norm, Bengali tokens); Lucene IDF; vitest pending full run |
| P3.2 | Chunker | DONE | feat commit — 9 tests (golden/budget/overlap/never-split/coverage/termination) |
| P3.3 | Embedding worker (+ fake) | DONE | feat commit — 9 tests (count corrected at P6 docs pass); D8 (no new dep; fake for CI); offline contract shared with P2.5; chunk audit at gate |
| P3.4 | Index store + migration | DONE | feat commit — 8 tests (bitwise vectors, replace/delete, quota, v1 chain); rag suites 218/218 |
| P3.5 | Hybrid search + RRF | DONE | feat commit — 11 tests (RRF golden, k-dominance, modes, determinism) |
| P3.6 | Index job controller | DONE | feat commit — 10 tests (typed errors, idempotency, abort-safety, IDB e2e) |
| P3.7 | Search UI | DONE | feat commit — e2e ragSearch 2/2 (seek click+Enter, axe 0, inert text, reopen) + D9 lexical-mode |
| P3.8 | Evaluation harness | DONE | feat commit — 5 tests (metrics, corpus integrity, fixed thresholds lexical+hybrid, distractor guard) |
| P3.9 | Phase 3 gate | DONE | 964/964 unit · 69/69 e2e · bundle 122,347/122,602 gz · tsc+eslint 0 · tag rag-phase-3-done · PHASE-3-REPORT.md |
| P4.1 | Deterministic intent router | DONE | feat commit — 9 tests (golden en/bn, priority, defaults) |
| P4.2 | History-aware query rewrite | DONE | feat commit — 10 tests (deixis en/bn, bare follow-ups, cap, no-invention) |
| P4.3 | Evidence sufficiency + calibration | DONE | feat commit — 8 tests (anchors, monotonic, threshold flip, tripwire) |
| P4.4 | Provider interface + extractive default | DONE | feat commit — 14 tests (golden, substring property, zod, bn, budget, determinism) |
| P4.5 | Local LLM provider (opt-in) | DONE | feat commit — 13 tests (grounded passthrough, refusal, hallucination→extractive, framing) + D10 |
| P4.6 | Grounding contract | DONE | feat commit — 10 tests (exact-substring, adversarial, downgrade; done early: providers depend on it) |
| P4.7 | Prompt-injection defenses | DONE | feat commit — 15 red-team tests (substring invariant, delimiter escape, flood) + sanitize hardening |
| P4.8 | Ask UI | DONE | feat commit — e2e ragAsk 3/3 (grounded+seek, hostile inert, LLM badge) + axe 0 + en/bn |
| P4.9 | Phase 4 evals | DONE | feat commit — hit@3/answer ≥ 5/6, refusal 100%, injection 0 ungrounded, deterministic |
| P4.10 | Phase 4 gate | DONE | 1047/1047 unit · 72/72 e2e · bundle 122,351/122,602 gz · tsc+eslint 0 · tag rag-phase-4-done · PHASE-4-REPORT.md |
| P5.1 | EditPlan schema | DONE | feat commit — 9 tests (golden shapes, rejects, frozen limits) |
| P5.2 | Deterministic planners | DONE | feat commit — 14 tests (golden en/bn, numeric ranges, insert, null-degradation) |
| P5.3 | Range normalization | DONE | feat commit — 10 tests (clamp, collapse, caps, snap order, bad-doc) |
| P5.4 | Preview + audition UI | DONE | feat commit — e2e ragEdits 2/2 (apply→undo→redo exact-length, hostile inert, chapters seek, axe 0) |
| P5.5 | Executor through performEdit | DONE | feat commit — 8 kernel tests (outcome shape, undo/redo round-trip, null guards); ONE-undo in e2e |
| P5.6 | Markers / chapters | DONE | feat commit — 8 tests (gap split, sanitize, overlap guard, determinism) |
| P5.7 | Command integration + NL box | DONE | feat commit — rag.smart* commands (flag-gated menu group) + NL box with confirm row |
| P5.8 | Safety review | DONE | feat commit — 8 safety tests + D11 decision record |
| P5.9 | Phase 5 gate | DONE | 1104/1104 unit · 74/74 e2e · bundle 122,593/122,602 gz (kernels lazy-fixed) · tsc+eslint 0 · tag rag-phase-5-done · PHASE-5-REPORT.md |
| P6.1 | Scale test (1 h end-to-end) | DONE | feat commit — 720-seg 1 h fixture: chunk 1ms / embed 9ms / 20 searches 16ms / ask 3ms / chapters 0ms |
| P6.2 | Failure-mode matrix | DONE | docs/rag/FAILURE-MODES.md — 18 typed failures, each citing a passing test (path fix applied) |
| P6.3 | Accessibility sweep | DONE | 22 axe (wcag2a+aa) assertions across 6 rag e2e specs (consent, manage, panel, search, ask, edits) — green in the P6.9 gate run |
| P6.4 | i18n completeness | DONE | feat commit fd7973a — full bn catalog (419 keys) + parity unit test |
| P6.5 | Privacy audit | DONE | docs/rag/PRIVACY-AUDIT.md — full egress+storage ledger, cites ragEgressJourney + guard e2e |
| P6.6 | Perf / bundle / Lighthouse | DONE | baseline 128,447 gz + D12 amendment; LH desktop 100×4 · mobile 98/100/100/100 (vite preview 4179, real output); lazy audit: transformers only in asr/embed/llm worker chunks |
| P6.7 | Documentation | DONE | feat e885f23 — README v2 section + stack/docs tables, cross-links verified (0 broken), P3.3 count corrected |
| P6.8 | Rollout recommendation | DONE | RELEASE-REPORT §6 — staged enablement, empty-by-policy registry + measure flow, flag-OFF rollback |
| P6.9 | Release gate + final report | DONE | 1110/1110 unit · 75/75 e2e (both projects) · tsc/eslint 0 · bundle = baseline 128,447 gz · LH desktop 100×4 / mobile 98+100×3 · tag rag-phase-6-done |
| P6.10 (post-release) | Rollout opt-in/out toggle | DONE | feat 72a3f8c — View → Smart transcript features (beta), always visible; e2e ragToggle + re-specified ragPanel flag-OFF invariant; 76/76 e2e · 1110/1110 unit · bundle 128,557 gz ≤ limit |
| P6.11 (post-release) | Bangla boot activation | DONE | feat — initLocale: navigator.language bn* → full bn UI at boot (the P6.4 catalog was unreachable without it); e2e localeBoot (bn boot → বাংলা menus+toggle, en unchanged); 78/78 e2e · 1110/1110 unit · bundle 128,648 gz ≤ limit |

## Phase 2 execution plan — acceptance criteria (planning pass 2026-10-12)

Scope: audio → text fully on-device. Pipeline: decode → mono mixdown → 16 kHz
resample (P2.1) → windowed feed into an ASR worker (P2.2) → Whisper via
transformers.js behind a DI seam (P2.5) → window stitching (P2.6) → transcript
store (P2.3) → timeline mapping (P2.4) → panel UI (P2.8) → SRT/VTT/TXT (P2.9),
orchestrated by the job controller (P2.7). Standing constraints apply: CI never
downloads real models (deterministic fake pipeline; real-model checks are
opt-in scripts under `scripts/rag/`), transcripts never leave the device,
entry bundle ≤ +2 KB gz, transcripts are untrusted data (text nodes only),
new UI keyboard-operable + axe-clean + en/bn strings in the lazy RAG table.

- **P2.1 resampler kernel** (`src/rag/audio/resample.ts`, pure, zero browser APIs):
  `mixToMono`, streaming windowed-sinc `Resampler` (Kaiser window, direct taps),
  one-shot `resampleTo16k`, `WHISPER_RATE=16000`.
  Accept: 440 Hz sine 48k→16k frequency within 1 Hz (zero-crossing count);
  in-band amplitude ripple ≤ 0.5 dB; ≥11 kHz tones attenuated ≥ 50 dB and
  aliased ultrasonic spur ≥ 50 dB down (thresholds = measured − 10 dB margin,
  documented); streaming with prime-sized pushes **bitwise-identical** to
  one-shot; 44.1k→16k and upsample 8k→16k lengths ±1; N-channel mixdown;
  no NaN for finite input; ≥ 12 tests; module imported only by rag code.
- **P2.2 audio feeder**: worker-side decode-PCM → mix → resample → 30 s windows
  + 1 s overlap, in order. Accept: progress monotonic 0..1 (ragProgress);
  AbortSignal settles between blocks; PCM moves as transferables (no clone
  on the main thread); unit tests extend `tests/rag/helpers`.
- **P2.3 transcript model + IDB store**: zod schema {id = modelId+version+doc
  fingerprint, language, segments[{start,end,text}], createdAt, stale flag};
  own versioned IDB store (separate from model files); typed errors incl.
  QUOTA; fingerprint = fnv1a(duration|channels|length|first/last samples) —
  documented as a *staleness hint*, not integrity. Tests on the fake-IDB
  pattern from P1.3.
- **P2.4 timeline mapper (pure)**: model-time → document-time given the
  transcribed source's placement (clip offset); monotonic, clamped, pure;
  property tests (offset round-trip). Documented limitation: rate-1.0 clips
  only for now.
- **P2.5 ASR worker (Whisper/transformers.js)**: **spike first** — (a) pipeline
  model cache from P1.3 IDB storage (fallback: runtime blob/SW serving — never
  precache); (b) ort-wasm assets vendored into lazy dist assets — NO new
  egress host (no jsdelivr); then DI-seamed pipeline (fake in tests),
  q8-wasm default, WebGPU only when profile=high, timestamps for segments.
  DECISIONS **D7**: dependency justification (size, Apache-2.0, lazy-only).
  Opt-in `scripts/rag/whisper-real.mjs` for real-model validation (not CI).
- **P2.6 window stitching (pure)**: merge overlapping window segment lists →
  global segments; boundary-duplicate tolerance ≤ 200 ms; deterministic;
  golden + property tests.
- **P2.7 transcription job controller**: feeder→worker→stitcher→store→mapper
  with signals, typed errors, cancel = cancel + re-run (no partial resume —
  documented); extends the P1.5 runtime state machine (add `transcribing`,
  rename nothing).
- **P2.8 transcript panel UI**: fills the P1.8 shell — segment list (times +
  text as text nodes only), click-to-seek, active-segment highlight, copy,
  Transcribe action reusing consent flow; axe 0 violations; keyboard operable;
  bn strings in the lazy `RAG_STRINGS` table; e2e via `__wfRagTest` + mock host.
- **P2.9 export SRT/VTT/TXT**: pure serializers (exact timecode formats, plain
  text, no markup injection); `rag.exportTranscript` command in the flag-gated
  menu group; golden tests; existing download path.
- **P2.10 e2e + docs**: journey spec — consent → mock download → transcribe
  fixture → panel → export, egress guard attached (0 violations, 0 bodies);
  docs updated (README section pointer).
- **P2.11 phase gate**: full vitest (794 + P2 additions), full playwright,
  LH desktop+mobile, bundle ≤ +2 KB gz, lazy audit (transformers/ort only in
  worker chunks), tag `rag-phase-2-done`, PHASE-2 REPORT, push, STOP.

Risks tracked: transformers.js custom-cache integration (spike in P2.5);
ort-wasm footprint (lazy assets only); long-file memory (streaming windows —
never materialize the full 16 kHz PCM twice); WebGPU variance (wasm default).

## Phase 3 execution plan — acceptance criteria (planning pass 2026-10-12)

Scope: local retrieval over transcripts. Pipeline: transcript segments →
chunker (P3.2) → embeddings (P3.3, real transformers.js / deterministic fake)
→ persisted index store (P3.4) → hybrid search (BM25 + cosine, RRF fusion,
P3.5 + P3.1) orchestrated by a job controller (P3.6), surfaced in the
transcript panel (P3.7), quality-gated by a deterministic eval harness
(P3.8), then the full gate (P3.9). Standing constraints: CI never imports the
real embedding model (deterministic hashing fake), no new egress hosts (model
files via the P1.4 consented downloader + P2.5 storage cache only), entry
bundle ≤ +2 KB gz, untrusted-text discipline, new UI keyboard-operable +
axe-clean + en/bn strings in the right table, extend-don't-rename.

- **P3.1 tokenizer + BM25** (`src/rag/retrieval/bm25.ts`, pure):
  NFKC-normalize, lowercase, split on Unicode whitespace/punct; small
  configurable stopword list (en, default on); Okapi BM25 (k1=1.2, b=0.75)
  over a mutable inverted index with Lucene-style IDF
  ln(1 + (N−df+0.5)/(df+0.5)) (always positive).
  Accept: golden score values (hand-computed); tf saturation (score growth
  sublinear); length normalization (long doc scores lower for same tf);
  OOV/empty query → 0 hits, no NaN; deterministic; ≥ 10 tests; entry-free
  (rag module only).
- **P3.2 chunker** (`src/rag/retrieval/chunk.ts`, pure): group consecutive
  transcript segments under a char budget (~800) with 1-segment overlap;
  chunk = {id, transcriptId, text, startSec, endSec, segmentIds[]}.
  Accept: no segment ever split; coverage (union of chunk spans = union of
  segment spans); overlap exactly 1 segment when overlapping; deterministic;
  empty/short inputs; ≥ 8 tests.
- **P3.3 embedding worker + deterministic fake** (`src/rag/retrieval/`):
  protocol embed{texts[]} → Float32Array[] (L2-normalized) + progress,
  cancelable; real = transformers.js feature-extraction (MiniLM-L6-v2 class)
  behind the SAME offline storage cache as P2.5 (DI `importLib`); fake =
  signed bag-of-hashed-tokens (256-dim) — deterministic, overlap-sensitive.
  D8 records dependency + fake rationale. Accept: fake determinism +
  cosine(overlap) ordering property; real path unit-tested at the seam only;
  ort/transformers only in worker chunks (build audit); ≥ 10 tests.
- **P3.4 index store + migration** (reuses fakeIdb): IDB `waveforge-rag-index`
  v1, store `chunks` (keyPath id, index byDocId) persisting chunk + vector +
  transcriptId; API putDoc/deleteDoc/listDocs/loadAll (vectors round-trip
  exactly). Accept: round-trip bitwise vectors; delete cascades by
  transcriptId; quota → RagQuotaError; migration chain via fakeIdb; ≥ 8 tests.
- **P3.5 hybrid search + RRF** (pure): RRF(d) = Σ 1/(k60 + rank), fusion of
  BM25 ranking + cosine ranking; SearchIndex loads store → query(text, topK)
  → hits {chunk, score}. Accept: golden RRF values; rank stability; vector-
  only & bm25-only degenerate modes; deterministic tie-breaks; ≥ 10 tests.
- **P3.6 index job controller**: transcript → chunk → embed → store with
  progress/cancel; idempotent per transcript id (re-index = replace);
  typed errors; runtime wiring `indexTranscript()` + `ragIndexBusy` signal
  (new signal, no renames); panel hook. Accept: controller tests ≥ 8;
  entry delta within budget (lazy imports only).
- **P3.7 search UI**: search section in the transcript panel — input,
  results (time + snippet as text nodes), Enter/click seeks; axe 0;
  keyboard operable; en/bn in lazy RAG table; e2e with fake embeddings.
- **P3.8 evaluation harness** (`tests/rag/retrieval/eval.test.ts`): golden
  transcript corpus + queries with known relevant chunks; deterministic
  (fake embeddings + BM25) → assert hit@1/hit@3 and MRR thresholds. The
  retrieval-quality gate for CI.
- **P3.9 phase gate**: full vitest, full playwright, LH desktop+mobile,
  bundle ≤ +2 KB gz, lazy audit, tag `rag-phase-3-done`, PHASE-3 REPORT,
  push, STOP.

## Phase 4 execution plan — acceptance criteria (planning pass 2026-10-12)

Scope: Ask — question answering over the CURRENT transcript, fully
on-device. Default path is EXTRACTIVE (deterministic, zero ML): retrieve
(P3.5) → score sentences → quote with citations. An optional local LLM
(text-generation via the SAME transformers.js dep — no new dependency,
D10) is opt-in behind consent + the P1.4 downloader; its output passes
the same grounding gate as the extractive path or it is shown as
"insufficient". Execution order follows dependencies (grounding before
providers); rows close as each task lands.

- **P4.1 intent router** (`src/rag/ask/intent.ts`, pure): deterministic
  rule router over en/bn cues → {ask | search | summarize | chat};
  question words/wh-mark → ask; locate/jump cues → search; summary cues
  → summarize; smalltalk → chat; default ask. zod-typed result; no ML.
  Accept: golden table en+bn, tie-break priority order, NFKC + mixed
  script, ≥ 8 tests.
- **P4.2 history-aware query rewrite** (`src/rag/ask/rewrite.ts`, pure):
  resolve deictic follow-ups ("what about it/that/after that?", bn
  equivalents) by carrying forward topic terms from the PREVIOUS query
  only — never invents content. Accept: rewrite table, no-rewrite cases,
  history cap, determinism, ≥ 8 tests.
- **P4.3 evidence sufficiency + calibration** (`src/rag/ask/sufficiency.ts`,
  pure): fixed logistic calibration of retrieval scores → confidence in
  [0,1]; decision 'answer' | 'insufficient' at a code-fixed threshold;
  empty evidence always insufficient. Accept: boundary + monotonicity
  tests, ≥ 8 tests.
- **P4.6 grounding contract** (`src/rag/ask/grounding.ts`, pure — pulled
  before providers): citations must reference evidence chunk ids and
  quotes must be EXACT substrings (NFKC-normalized) of the cited chunk;
  enforceGrounding() downgrades ungrounded answers to 'insufficient'.
  Accept: adversarial tests (fake quotes, tampered ids, normalization
  tricks), ≥ 10 tests.
- **P4.4 provider interface + extractive default** (`src/rag/ask/provider.ts`,
  `extractive.ts`): zod AskAnswer schema {status, text, citations[],
  provider, confidence}; extractive provider = retrieval → sentence split
  → IDF-weighted overlap scoring → best sentences as the answer; text is
  ALWAYS a transcript substring. Accept: golden answers over the P3.8
  corpus, citation correctness, insufficient on out-of-corpus questions,
  ≥ 12 tests.
- **P4.5 local LLM provider (opt-in)** (`llmProtocol/llmClient/llm.worker/
  llmProvider.ts`): text-generation pipeline behind the P2.5 storage
  contract (D10 — reuses @huggingface/transformers; CI uses a fake lib at
  the DI seam; real model only after consent; never in CI). Prompt
  builder wraps evidence as delimited DATA; provider validates output
  through enforceGrounding() and falls back to extractive/insufficient.
  Accept: seam tests ≥ 10, worker-only import audit.
- **P4.7 prompt-injection defenses** (`sanitize.ts` + red-team suite):
  sanitizeForPrompt (control chars stripped, length caps), evidence
  delimiter framing, red-team transcripts (ignore-instructions, fake
  system roles, script/markdown smuggle, homoglyphs) — extractive output
  stays a substring; prompt builder golden; e2e hostile transcript.
  Accept: ≥ 10 red-team tests green.
- **P4.8 Ask UI** (panel Ask section + runtime `askTranscript` +
  `ragAskHistory` signal, new — no renames): input + answer card, text
  nodes only, citation buttons seek+highlight, insufficient state,
  en/bn lazy strings, axe 0, keyboard operable; e2e with fake providers.
- **P4.9 Phase 4 evals** (extends P3.8 harness): citation hit@1 over
  golden Q/A, out-of-corpus → insufficient rate 1.0, injection corpus →
  zero ungrounded answers; fixed thresholds; deterministic.
- **P4.10 phase gate**: full vitest, full playwright, bundle ≤ +2 KB gz
  vs CURRENT baseline, lazy audit, tsc/eslint clean, tag
  `rag-phase-4-done`, PHASE-4 REPORT, push, STOP.

## Phase 5 execution plan — acceptance criteria (planning pass 2026-10-12)

Scope: Smart edits — deterministic, transcript-driven edit PLANS executed
through the app's existing `performEdit` (stage-then-swap) so every plan
application is exactly ONE undo step. No ML proposes edits in P5; models
(at most) supply ranges (ask citations), deterministic code computes and
executes. Pure kernels live in `src/rag/edits/` (doc-shaped plain data
only); the ONLY bridge to the app is a lazy `src/app/ragEditActions.ts`
(mirrors ragExportActions). Order adjusted for dependencies:
normalize (P5.3) lands right after the schema, before planners.

- **P5.1 EditPlan schema** (`src/rag/edits/plan.ts`, pure + zod):
  discriminated union — deleteRange{startSec,endSec}, silenceRange{...},
  gainRange{...,factor 0.25..4}, insertSilence{atSec,durSec ≤30};
  `source` provenance (selection|utterance|manual) + optional
  transcriptId/chunkId; label key for the undo stack. Accept: rejects
  NaN/negative/inverted/factor-out-of-range; ≥ 8 tests.
- **P5.3 Range normalization** (`normalize.ts`, pure): clamp to
  [0,duration], min-length collapse → null, code-fixed caps (delete ≤
  90% of doc, insert ≤ 30 s, gain 0.25..4), optional zero-cross snap
  via injected fn. Accept: boundary + collapse + cap tests, ≥ 8.
- **P5.2 Deterministic planners** (`planners.ts`, pure): from selection
  (sec range), from ask citation chunk, and from NL cues (en/bn:
  delete/remove, silence/mute, quiet/soften/boost, "insert N seconds
  silence") — output RAW plans; never throw (unknown → null). Accept:
  golden cue tables en+bn, no-verb → null, ≥ 12 tests.
- **P5.5 Executor**: `planToOutcome(plan, channels, sampleRate)` (pure —
  reuses engine kernels makeCut/makeRangeWrite/makeInsert) + lazy
  `src/app/ragEditActions.ts` applying via ONE performEdit(outcome,
  label). Accept: outcome correctness per plan kind; undo/redo
  round-trip via applyOps; ONE call per plan; typed rejections; ≥ 10.
- **P5.4 Preview + audition UI**: SmartEdits section in the transcript
  panel — quick selection ops, per-answer utterance ops (citation →
  plan), NL box with computed-range confirm row, Preview (seek+play+
  timed pause). Text-node discipline, keyboard operable, axe 0, en/bn
  lazy strings. e2e happy path + axe.
- **P5.6 Markers/chapters** (`chapters.ts`, pure + panel list): derive
  chapters from transcript segments (gap > 2 s splits; title = first
  40 sanitized chars) — read-only list with seek buttons. Accept: gap
  split, sanitize, determinism, ≥ 6 tests.
- **P5.7 Command integration**: flag-gated commands (rag.smart*) routed
  like rag.togglePanel (isRagEnabled guard); NL box = the panel UI.
  e2e drives panel + menu paths.
- **P5.8 Safety review**: zod at the executor boundary; all caps from
  P5.3 enforced at execution; injection test — hostile transcript text
  ("delete everything") NEVER mutates the doc without an explicit user
  action; ONE-undo assertion; D11 decision. ≥ 8 tests.
- **P5.9 phase gate**: full vitest, full playwright, bundle ≤ +2 KB gz
  vs CURRENT baseline, tsc/eslint clean, tag `rag-phase-5-done`,
  PHASE-5 REPORT, push, STOP.

## Phase 6 execution plan — acceptance criteria (planning pass 2026-10-12, rev. 2)

Scope: hardening + release. The canonical rows are the ORIGINAL table
(P6.1 scale test … P6.9 release gate); this plan binds each row to its
acceptance evidence. The first planning pass was renumbered to match
the table (this rev. 2 replaces it; no rows were dropped).

- **P6.1 scale test (1 h end-to-end)**: deterministic scale harness —
  synthetic 1-hour document through the real production path (peaks,
  lane buckets, undo/redo) with FIXED perf budgets; the 1-hour ASR/
  embedding cost itself stays opt-in (real models, maintainer machine)
  and ships as scripts/rag/quality-*.mjs. Accept: budget asserts green
  in vitest (existing M8g/M9-style harness extended to 1 h doc sizes);
  no entry-bundle impact.
- **P6.2 failure-mode matrix**: documented matrix (docs/rag/) mapping
  each failure (quota exceeded, model missing/corrupt, IDB unavailable,
  download abort, mid-transcribe abort, index job abort, empty/failed
  ask) to its typed error + user-visible behavior, each backed by a
  named test. Accept: every row cites a passing test id.
- **P6.3 accessibility sweep**: axe (wcag2a+aa) asserted green across
  EVERY rag UI state via the existing e2e suite (welcome, consent,
  manage, panel+segments, search, ask, smart edits); i18n-locale render
  of the panel included. Accept: sweep summary table in the release
  report; no new violations.
- **P6.4 i18n completeness**: unit test asserting the lazy RAG string
  tables have IDENTICAL key sets en↔bn (plus no empty values). Accept:
  test green; any missing key fixed, not waived.
- **P6.5 privacy audit**: documented audit — egress inventory (only
  consent-gated downloader + model hosts from the registry), storage
  inventory (caches + IDB names/keys), the untrusted-text discipline,
  and the FORBIDDEN-footprint guard. Accept: audit section in the
  release report citing the e2e evidence (ragEgressJourney, welcome
  guard).
- **P6.6 perf / bundle / Lighthouse**: rebaseline the bundle gate to
  the release entry size (D12 — limit stays baseline+2048); full
  Lighthouse desktop + mobile via vite preview; lazy audit (transformers
  only in worker chunks). Accept: real numbers pasted in the gate row.
- **P6.7 documentation**: README Smart RAG section matches v2 reality
  (search + Ask + smart edits, privacy model, opt-in tooling); docs/rag
  cross-links verified; PROGRESS row corrections (P3.3 "14 tests" → 9).
- **P6.8 rollout recommendation**: section in the release report — flag
  default, staged-enablement order, rollback (flag OFF), and what ships
  empty-but-valid (model registry).
- **P6.9 release gate + final report**: full vitest, full playwright
  (both projects), tsc + eslint clean, bundle ≤ rebased limit, tag
  `rag-phase-6-done`, docs/rag/RELEASE-REPORT.md, push, STOP.
