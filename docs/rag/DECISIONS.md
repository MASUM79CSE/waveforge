# WaveForge Smart RAG — Decision Log (ADR-lite)

One entry per decision: date, decision, alternatives, consequence.

## Orientation (P0.1)

Conventions and integration points verified against the real code:

- **Command registry**: `src/app/commands.ts` (registry + drift unit tests:
  menus/shortcuts/toolbar parity must stay in sync — `tests/unit/app/`).
- **Single edit gateway**: `src/engine/editOps.ts` + `AudioEditor`
  (`src/engine/AudioEditor.ts`); every user action = one history entry
  (EDL, byte-budgeted 250 MB — `src/engine/history.ts`).
- **Workers**: `src/workers/{mp3Export,analysis,peaks}`; conventions =
  transferable buffers, cancelable jobs, progress messages. Worker RPC
  conventions to mirror live in `src/workers/*.worker.ts` + `src/io/`.
- **Persistence**: `src/storage/` (`db.ts` opens IndexedDB `waveforge`;
  `draftRepository.ts` = WFD3 payloads; `presetStore.ts` FX presets).
  DB version constant lives in `src/storage/db.ts` — additive migrations.
- **i18n**: `src/i18n/en.ts` (single flat dict + `t()`); Bangla to be added
  as a sibling `bn.ts` per master prompt §8.
- **Dialogs/keyboard**: `src/app/components/Dialogs.tsx` + `Modal`;
  Escape chain + focus trap in `src/app/keyboard.ts` (fixed dialog order).
- **Transport/seek**: `src/app/actions.ts` (`transport`), engine clock in
  `src/engine/AudioEngine.ts`; selection state in `src/app/state.ts`.
- **Waveform overlay API**: `src/engine/WaveRenderer.ts` + `waveDraw.ts`
  (selection rect, beat grid, automation overlays — extend, don't fork).
- **Zod at boundaries** (`src/fx/chain.ts`, export formats); **pure kernels
  RED-first** with analytic anchors (`tests/unit/fx*` style).
- **A11y**: axe-core zero-violations e2e gate (`tests/e2e/a11y.spec.ts`).
- **Build**: Vite 8; PWA precache via `vite.config.ts` globPatterns — model
  files must NEVER match the precache glob.
- **Node**: v20.20.2 in this environment (`engines.node >=20`).

## D1 — Feature flag `rag` (P0.8, 2026-09-26)

- **Decision**: `isRagEnabled()` = env `VITE_RAG=1` OR `?rag=1` OR
  `localStorage['wf.rag']='1'`; all storage/URL access try/catch-guarded;
  injected accessors for testability. Default OFF.
- **Alternatives**: build-time-only flag (no runtime toggle — worse DX);
  always-on lazy module (no dark ship — rejected).
- **Consequence**: zero behavior change when OFF; dark-launch possible;
  P1.8 UI gates every RAG surface on it.

## D2 — Baseline bundle budget (P0.7, 2026-09-26; amended at P0.8)

- **Decision**: main-entry gzip baseline = 120,554 bytes, measured with
  the SAME compressor as the guard (node zlib gzipSync — the CLI `gzip`
  reads ~470 B smaller, which caused a false +470 delta). Entry content
  hash is unchanged after the flag (`index-ajTvOWzM.js`), proving the
  flag-OFF build is byte-identical to baseline. Tolerance 2048 B;
  enforced by `scripts/check-bundle-size.mjs` + CI.
- **Consequence**: every phase must keep the entry chunk within baseline+2 KB.

## D3 — CI already runs e2e (P0.4/A7 context, 2026-09-26)

- **Decision**: A7 is partially pre-addressed — commit `f662e19` added an
  e2e job (Playwright install → build → suite → artifact). P0.6 adds only
  the bundle-size check; Lighthouse stays a per-change local gate
  (documented) to keep CI time reasonable.
- **Consequence**: CI = typecheck, lint, unit+coverage, build, bundle check,
  e2e.

## D4 — i18n Bangla strategy (P1.5, 2026-09-26)

- **Decision**: `bn.ts` ships as a PARTIAL catalog merged over `en`
  (`{ ...en, ...bn }` in `src/i18n/index.ts`); RAG keys are translated
  now; the full catalog lands in P6.4.
- **Consequence**: no key can ever render empty; typing widened via
  `CatalogLoose`.

## D5 — COOP/COEP shipped; model-host allow-list (P1.6, 2026-09-26)

- **Decision**: ship `COOP: same-origin` + `COEP: credentialless`
  (verified: crossOriginIsolated=true, 59/59+consent e2e under the
  headers, SW registers, LH perf 97 / a11y 100 / BP 100 — mobile 99).
  CSP stays Report-Only with `connect-src` extended by the model hosts:
  huggingface.co + cd-lfs (transformers.js defaults, pinned in P2.5/P3.3)
  and models.example (local/e2e mock host).
- **Alternatives**: stay non-isolated (single-threaded inference —
  3–8× slower ASR, rejected); COEP require-corp (breaks same-origin
  subresources without CORP headers — credentialless is the right
  profile for a zero-cross-origin app).
- **Side fix**: added `public/robots.txt` — LH SEO regressed to 91
  under the experiment because the SPA rewrite served HTML for
  /robots.txt (pre-existing on prod too). Now 100 everywhere.

## D6 — Entry-bundle diet: lazy RAG strings + armed import() (P1.9)

After P1.5-P1.8 the bundle gate failed: entry +3,734 B gz (limit +2,048
over the 120,554 B phase-0 baseline). Two fixes, measured:

1. **RAG copy lives in the lazy chunk, not the shared catalogs.** All 17
   rag* strings moved from `src/i18n/{en,bn}.ts` into a local
   `RAG_STRINGS` table in `RagDialogs.tsx` (`rt(key)`, `locale()` getter
   added to `src/i18n/index.ts`). The entry keeps only the 3 literals the
   flag-gated menu/command chrome needs. Rationale: the RAG UI is fully
   lazy, so the entry must never pay for its copy. en-fallback semantics
   preserved; full bn catalog remains P6.4.
2. **No preact lazy/Suspense in the entry.** RagDialogHost was their only
   consumer; replaced by an armed `import('./RagDialogs').then(setComp)`.
   Same armed-host behaviour, none of the implementation cost.

Result: **+674 B gz** (entry 121,228 vs 120,554 baseline; tolerance
+2,048). Verified: `runtime.ts` remains a separate lazy chunk; entry
contains no model-host strings. No public API renamed (`t()` untouched;
`locale()` is additive).

## D8 — Embeddings: same transformers.js runtime, MiniLM-class model, deterministic fake for CI (P3.3)

**No new dependency.** The embedding worker reuses `@huggingface/transformers`
(D7) with the `feature-extraction` pipeline (model class: MiniLM-L6-v2, e.g.
`Xenova/all-MiniLM-L6-v2`, 384-dim, q8, mean pooling + normalize). It rides
the identical offline contract as the ASR worker: P1.3 storage-backed custom
cache, `allowRemoteModels=false`, vendored ort wasm — a missing model is
`MODEL_NOT_INSTALLED`, never a fetch. Model files enter storage only through
the P1.4 consented downloader; registry entries ship via the seam/registry
like ASR models.

**Deterministic fake for CI:** `embedFake.ts` (signed bag-of-hashed-tokens,
256-dim, L2-normalized) — same `EmbedClient` contract, no ML, fully
deterministic. It is overlap-sensitive (more shared tokens ⇒ higher cosine),
which makes retrieval-ordering tests and the P3.8 eval harness meaningful in
CI. It is NOT semantic; real-model retrieval quality is validated opt-in
(P6), never in CI.

**Worker isolation:** `embed.worker.ts` is the only chunk pulling
transformers for embeddings; the entry bundle is untouched (gate-checked in
P3.9). Result vectors ride the RPC transfer list (zero-copy).

## D9 — panel search upgrades to real-embedding semantic mode (P6.12)

Originally (P3.7) the panel searched lexical-only: no calibrated floor
existed, and the fake embedder's hash noise made vector ranking
nonsense-prone. With the real MiniLM calibrated (P6.12, below), the
panel now calls `searchTranscript(query, { topK: 5, semantic: true })`.

Semantics of the flag (`src/rag/runtime.ts`):
- **Real-model rows** (`modelId !== 'fake-embed'`): pure vector ranking,
  scores below `SEMANTIC_FLOOR = 0.15` filtered before top-K — the
  engine can now return "no meaningful matches" for off-topic queries.
- **Fake-embedder rows** (tests/fakes, no consent yet): falls back to
  hybrid (RRF) exactly as before — the floor is meaningless for hash
  embeddings, and panel behaviour in fake-media runs is unchanged
  (asserted by the ragSearch e2e).

The option is per-call; the default (`semantic` unset) keeps every
existing caller on hybrid. Calibration (2026-10-12, real MiniLM q8,
P3.8 golden corpus): gold-chunk cosine 0.208–0.454 vs out-of-corpus
best cosine −0.006–0.093 — floor 0.15 sits mid-gap with margin on both
sides; in-corpus separation is handled by ranking, not the floor.
Reproduce via `npx vite-node scripts/rag/quality-embed.mjs` (logs the
per-query score distributions used to pick the floor).

## D10 — local LLM reuses @huggingface/transformers (no new dependency)

The opt-in Ask LLM runs `text-generation` via the ALREADY-SHIPPED
@huggingface/transformers (same worker pattern as D8 embeddings, same
P2.5 storage custom cache, same vendored ORT, q4 dtype) instead of
adding @mlc-ai/web-llm (≈ heavy dep, separate runtime, new egress
surface). Zero new dependencies, one offline contract, CI uses the
deterministic fake LLM client; real-model quality checks stay opt-in
scripts (P6). Ungrounded generations fall back to the extractive
provider, so the grounding guarantee never depends on the model.

## D11 — Smart edits are deterministic plans through performEdit (P5)

No ML proposes edits in P5. Models (at most) supply RANGES (ask
citations); deterministic planners + normalize + caps compute the plan;
planToOutcome maps it onto the engine's edit kernels; the lazy bridge
(src/app/ragEditActions) commits via ONE performEdit call = exactly ONE
undo step with a human-readable label. Hard caps: delete ≤ 90% of doc,
insert ≤ 30 s, gain 0.25–4, min range 0.02 s; zod parse at the executor
boundary; nothing auto-applies — transcript text (however hostile) can
never mutate the document without an explicit user action on a visible
confirm row / button (e2e-pinned). Plans are plain serializable data —
no audio, no functions.

## D12 — bundle gate rebaselined at the release entry size (P6)

The Smart RAG v2 series lands with the entry at 128,447 B gz. Two
components, accounted separately:
1. **RAG code: +2,039 B gz** over v1 (120,554) across five phases —
   within the +2,048/phase rule at every gate (P5 needed a 20 B
   kernel-chunking fix to stay honest). All RAG runtime stays lazy
   (kernels/providers/workers never in the entry; P6 lazy audit).
2. **Full Bangla catalog: +5,854 B gz** (P6.4) — the release ships a
   complete second human language; it merges at boot for bn users by
   design (sync `t()` access). This is a deliberate one-time product
   addition, NOT RAG growth, and it is paid ONCE.
The baseline file moves to the release entry size so the next series
keeps the same rule: +2 KB gz per phase. A stale v1 baseline would
either block correct code or invite drift.
