# PHASE 2 REPORT — Smart RAG Transcription

**Branch:** `feat/smart-rag` · **Tag:** `rag-phase-2-done` · **Date:** 2026-10-12

Phase 2 delivers the full on-device transcription pipeline: decoded audio →
mono mixdown → 16 kHz windowed feed → Whisper ASR (transformers.js, offline
by construction) → window stitching → versioned transcript store → timeline
mapping → live panel → SRT/VTT/TXT export. Audio and transcripts never leave
the device; the pipeline cannot fetch (structural, not policy).

## Delivered

| Task | What shipped | Commit |
| --- | --- | --- |
| P2.1 | Pure windowed-sinc resampler (Kaiser β=8, 64 taps), streaming + one-shot bitwise-identical; mono mixdown | `7227c75` |
| P2.2 | Audio feeder: 30 s windows + 1 s overlap over typed RPC; zero-copy transferables both directions (RPC_TRANSFER) | `08c4796` |
| P2.3 | Transcript model (zod) + versioned IDB store with v1→v2 migration; fnv1a staleness hint (documented as hint, not integrity) | `e022c13` |
| P2.4 | Timeline mapper: monotone, clamped, rate-1.0 (documented; `TimelinePlacement` = extension point) | `9802694` |
| P2.5 | ASR worker: transformers.js 4.3.1 behind DI seam; storage-backed custom cache; `allowRemoteModels=false` ⇒ offline by contract; ort wasm vendored; **D7** | `81038b8` |
| P2.6 | Window stitcher: boundary dedupe (≤200 ms, text-compatible), untrusted-input sanitation | `1751aba` |
| P2.7 | Job controller: typed errors, idempotency, cancel = cancel + re-run; runtime wiring (`transcribing` state added); fake-ASR e2e seam; chunk proof | `a0b95ac` |
| P2.8 | Live transcript panel: transcribe CTA (consent reuse), segment list (text nodes only), click-to-seek + active highlight, copy | `52d47b1` |
| P2.9 | SRT/VTT/TXT serializers (exact interchange formats) + flag-gated commands + anchor download | `ba6fea6` |
| P2.10 | Full-journey egress proof (guard attached) + README Smart RAG section | `0b85d32` |
| P2.11 | Phase gate (below) + tag | this commit |

## Gate evidence (all commands really run this session)

```
npx vitest run                              → 103 files, 896/896 passed
npx tsc --noEmit                            → clean
npx eslint src tests --max-warnings 0       → 0 errors
npx playwright test --project=chromium-fake-media
                                            → 67 passed (2.2m), 0 flaky
npx playwright test --project=chromium-preview
                                            → 1 passed (offline SW proof)
npm run build                               → exit 0
node scripts/check-bundle-size.mjs          → entry 122,346 gz · baseline 120,554
                                              delta +1,792 (tolerance +2,048 → PASS)
lighthouse --preset=desktop                 → 100 / 100 / 100 / 100
lighthouse (mobile)                         → 98 / 100 / 100 / 100
```

Lazy audit: `onnxruntime`/`transformers` references exist **only** in
`dist/assets/asr.worker-*.js`; the entry bundle contains **zero** model-host
strings; `dist/rag-assets/ort/` carries the vendored runtime and is excluded
from the SW precache (`globIgnores`).

## Privacy invariants — enforced, not promised

- **The ASR pipeline cannot reach the network**: `allowRemoteModels=false` +
  a custom cache backed by P1.3 model storage; a missing file is a typed
  `MODEL_NOT_INSTALLED` error, never a fetch. `customCache.put` is a no-op.
- **Egress journey proof**: consent → mock download → transcribe → export
  yields `violations() == []`, `bodiesWithContentSize() == 0`, and outbound
  requests exactly `['https://models.example/x.onnx']` (allow-listed host,
  explicit consent). No new egress host entered the CSP allow-list.
- **Transcripts are untrusted data**: rendered as text nodes only
  (e2e-asserted), export sanitizes times and leaves text verbatim.
- **Flag OFF ⇒ identical app** (P1.8 e2e still green); models/runtimes never
  in SW precache; main bundle +1,792 B gz ≤ +2 KB budget.

## Decisions this phase (docs/rag/DECISIONS.md)

- **D7** `@huggingface/transformers@^4.3.1` (Apache-2.0): lazy worker-only,
  install-weight control via npm overrides (onnxruntime-node 288 MB CUDA +
  sharp stubbed; browser export map unaffected), ort wasm vendored (no CDN),
  CI never imports the real library (fake ASR seam; real-model validation is
  opt-in, P6).
- Carried from P1: byte-budget pre-flight omitted (QUOTA is typed; partials
  version-scoped).

## Test-count trajectory

794 (end P1) → 810 (P2.1) → 828 (P2.2) → 847 (P2.3) → 877 (P2.5/2.6) →
887 (P2.7) → **896** (P2.9). e2e: 64 (end P1) → **67** fake-media + 1
preview-offline. Flake fixed structurally: seam specs now wait for the
flag-gated runtime import instead of racing the welcome dialog.

## Carried forward to Phase 3 (retrieval)

- Transcript store API (P2.3) is the retrieval index's data source.
- `window.__wfRagTest` gains fake-mode hooks per phase (pattern established).
- bn catalog partial (RAG keys in the lazy table); full bn remains P6.4.
- Real-Whisper validation script (opt-in, never CI) still owed in P6.
- **PAT reminder:** revoke the push token — Phase 2 is fully pushed.

**STOP — awaiting `PROCEED TO PHASE 3`.**
