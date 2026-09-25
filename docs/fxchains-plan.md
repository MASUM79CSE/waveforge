# C-series — FX chains + presets (build plan)

**Date:** 2026-09-25 · **Extends:** `docs/fxchains-analysis.md` (market + UX
decisions) · Registry: ADR 005 · Apply/history rules: bounce precedent ·
Envelopes: A6/A7 (`spec.curve` contract).

> **STATUS: SHIPPED (2026-09-25).** C1 `4d3d18e` · C2+C3 `d94727a` · C4
> `e90f016` · C5 per-entry envelopes `f455033` (the documented seam:
> entry-indexed runners + ChainCurves; ∿ in the rack). Gates at ship: 683/683 unit (80 files), 41/41 e2e, lint 0,
> tsc clean, build OK; Lighthouse **98/100/100/100**
> (`docs/perf/lighthouse-c2.json`). 12 C1/C2 model gates + 5 preset/store
> unit gates + 40th/41st e2e. Ship notes: tails SUM across stages (v1
> deviation as planned in C2); mid-chain length changes flow through; the
> rack preview renders offline (no live-graph path for chains); Voice
> rescue auto-loads the RNNoise model on apply.

## C1 — chain model (pure, this phase)

`src/fx/chain.ts` — UI-free, no app imports:

- `ChainEntry { effectId: string; params: Params; bypass: boolean }`,
  `Chain = ChainEntry[]`.
- Zod boundary schema (`parseChain(raw: unknown): Chain | string`) — external
  JSON is untrusted (ECC rule): unknown effect id → error message; wrong param
  types → error; numeric params clamped through the registry's
  `validateParams` (spec ranges are the single source of truth).
- `foldChain(channels, sampleRate, chain, run, ctx)` — sequential fold with an
  injected stage runner `(effectId, channels, sampleRate, params, ctx)`;
  `bypass` entries skipped; all-bypassed/empty → the input arrays returned
  bit-exact; length-changing stages (fx.rate, fx.stretch) flow through — the
  next stage receives the previous stage's output as-is.
- `exportChain(chain)` / `parseChain` round-trip: stable, minimal JSON shape.

### C1 gates (§8 style)

1. parse: valid JSON round-trips to the typed Chain.
2. parse: unknown effect id rejected with a message naming the id.
3. parse: out-of-range param clamped to the def's spec range.
4. parse: non-numeric value for a number param rejected; bools coerce per
   registry rules.
5. fold: composition order == manual application (two registered test kernels
   `fxTest.a` (×2), `fxTest.b` (+0.1) — non-commutative pair proves order).
6. fold: bypass entry skipped bit-exactly (stage never runs).
7. fold: all entries bypassed → input arrays returned unchanged.
8. fold: length-changing stage output feeds the next stage whole.
9. export→parse→fold is a fixed point (same output as the authored chain).

## C2 — FX Rack UI + apply

- `src/app/fxChainActions.ts`: build the stage runner from
  `renderEffectOffline` (graph stages) + `def.process` (kernel stages);
  region channels in → folded channels out; **one history entry** for the
  whole chain (bounce owns ALL refcount mutation — standing rule).
  Graph stages need an AudioBuffer source — reuse the applyEffect buffer
  plumbing; per-stage tails append only after the LAST stage (v1: tail = last
  stage's `tailSeconds`; documented deviation for mid-chain tails, which the
  offline fold naturally re-absorbs).
- `src/app/components/FxRackDialog.tsx`: ordered rows (↑/↓/remove/bypass),
  add via registry-name select, params inline via the shared `ParamRow`;
  Apply/Cancel; reuses Modal. Menu "FX Rack…" (`fx.rack` command) next to the
  NR family; i18n + css.
- Preview: whole-chain A/B via the offline fold → play the rendered buffer
  (v1; the per-effect WebAudio preview path stays for single effects).

## C3 — presets

- `src/fx/presets.ts`: curated built-ins — **Voice rescue**
  (`fx.rnvoice` mix 1 → `fx.deesser` defaults → `fx.compressor` podcast
  settings), **Podcast polish**, **Master glue** (`fx.compressor` →
  `fx.limiter`), **Warm air** (`fx.chorus` subtle → `fx.reverb2` short),
  each with one-line i18n'd descriptions.
- EffectDialog quick-presets: a preset select per effect (sets params; the
  A7 envelope draft is untouched).
- User presets: small idb store (idb 8.0.3 pin, drafts precedent), save from
  the Rack (named), import/export chain JSON files (Audacity-macro precedent,
  pure client-side).

## C4 — e2e + close

- 40th e2e: FX Rack → add two effects, reorder, bypass one, apply → toast;
  Ctrl+Z restores the pre-chain waveform; Ctrl+Y re-applies; console-clean.
- 41st e2e: Voice rescue recipe applies from the preset entry; undo.
- Full gates + Lighthouse re-run (≥95/95/100/100) + doc stamps.

## Non-goals (this series)

Parallel/sidechain routing; ~~per-entry automation curves~~ (SHIPPED as C5,
`f455033`); MIDI/external control; chain-level wet/dry macro; preset cloud
sync (backend-free v1).
