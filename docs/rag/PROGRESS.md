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
