# FX chains + presets — market & product analysis

**Date:** 2026-09-25 · **Feeds:** `docs/fxchains-plan.md` (C-series) · Follows the
E7b ship (AI Voice Clarity). Same discipline as `effects-nr-v3-plan.md` §1:
market first, then theory/product, then a gated build.

## 1. Market (2026-09)

- **iZotope RX — Module Chain** (the category benchmark for repair suites):
  chains are first-class, named, saveable objects; presets are shareable
  files; "Vocal Cleaning Module Chain" is marketed as THE entry point.
  Pros model workflows as chains, not as repeated per-module visits.
- **Audacity — Macros**: a chain recorded as a macro, importable as a plain
  text file, applied to the current selection in one click. The third-party
  preset economy literally ships "16 one-click voice styles" as macro files
  (Music Radio Creative et al.) — proof that one-click multi-effect recipes
  are what non-experts actually buy.
- **Adobe Audition — Favorites**: one-click recorded operation stacks for
  voice workflows (podcast clean-up).
- **Web DAWs (BandLab, Soundtrap, Soundation)**: per-effect presets at best
  (patch saves); no cross-effect chains. **the reference editor: neither** — a plain
  per-effect dialog is the ceiling.
- WaveForge today: 23-registry deep (kernels + graphs), A6/A7 per-param
  automation envelopes, three NR engines incl. E7b `fx.rnvoice` — but every
  multi-effect workflow still requires repeated dialog trips and re-tuning.

## 2. Product take

The gap and the opportunity agree: **serial chains + recipe presets** are the
natural "beyond the reference editor" layer, and our registry makes them cheap:

- Voice rescue (the flagship): `fx.rnvoice → fx.deesser → fx.compressor` —
  the E7b engine becomes the head of a one-click workflow, which is how the
  "natural voice, no quality loss" promise compounds.
- Chains collapse rituals (master glue: comp → limiter; creative: chorus →
  delay; loudness prep) and are shareable JSON — the Audacity-macro precedent,
  license-clean and backend-free (pure client-side, drafts-style storage).

## 3. UX decisions (v1)

1. **Serial only** — no parallel splits/sidechain (matches every reference
   implementation's core; routing graphs stay out of scope).
2. **One FX Rack dialog**: ordered entries (add / remove / reorder / bypass),
   each entry's params edited inline with the existing param-row contract.
3. **Apply = one history entry** (the whole chain is a single undo step —
   same rule as a bounce).
4. **Built-in recipes + user presets**: a small curated library (Voice rescue
   first), per-effect quick presets in the existing EffectDialog, user
   presets saved locally (IndexedDB, drafts precedent), import/export JSON.
5. A7 envelopes stay single-effect for v1; per-entry curves are the documented
   seam (params already flow through `EffectRunContext.paramCurves`).
