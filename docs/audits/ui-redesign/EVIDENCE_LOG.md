# Evidence Log — UI Redesign

## UX-0.1 — Capability check, environment, branch, persistent files
- **Date:** 2026-10-16 · **Base:** `main` @ `22b6aba` (`perf(brand): localize the developer avatar; ship og:image`)
- **Capability check:** repo read/write ✓ · shell (`npm`/`npx`/node) ✓ · Playwright headless Chromium 1243 (screenshots, tracing, fake media) ✓ · Lighthouse ✓ · web fetch of public docs + live-app screenshots ✓ · OS screen reader / real device ✗ (`NOT RUN`).
- **Environment:** Node v20.20.2 · npm 10.8.2 · `ui/clean-slate-layout` created from `main` @ `22b6aba`; main had advanced past the June baseline (`3691995`) through release commits (v1.0.0 stamp, deploy verification, brand fixes) — see UX-D1.
- **Assumptions relied on:** A-1 (clean slate for ARRANGEMENT, re-home capabilities), A-2 (no removal without written approval), A-3 (UI/UX only), A-4 (Tier A graph in scope; Tier B needs approval), A-5 (legacy retired only at the end). All five stated in audit.md §0; none challenged yet.

## UX-0.2 — Baseline gates (recorded verbatim; method in `baseline/method.md`)
- **Gates at `22b6aba`:** typecheck PASS (0) · lint PASS (0) · unit **86 files / 720 tests PASS** (~169 s) · e2e **59 passed / 0 flaky** (~2 min, chromium projects, workers=1) · build PASS · bundle **120,084 B gz / 388,669 B raw (`index-ajTvOWzM.js`)** · Lighthouse desktop **P100 / A100 / BP100 / S91** · mobile **P99 / A100 / BP100 / S91** (preview :4179, killed after).
- **Screenshots:** 6 widths × 2 themes × 6 states = **72 PNGs** → `docs/screenshots/ui-redesign/phase0/` (spot-verified: `playing-1280-light.png`, `multitrack-1440-dark.png`).
- **Measurements (`baseline/probe-metrics.json`):** smallest target **23×17 px (toast-close)** → below WCAG 2.5.8 (finding F-4) · **39 tab stops** · playback window: long tasks **0**, CLS **0**, frames 351 (median 16.7 ms / P95 16.8 ms).
- **Redraw cost (`baseline/redraw-metrics.json`, 5 s playback 1280×800 light):** rAF **605**; canvas calls **fillRect 764,362 / beginPath 302 / clearRect 0 / drawImage 0**; long-animation-frames **1** (worst **53 ms**, blocking **3 ms**). Same probe re-runs in Phase 6.

## Commit
- Phase-0 evidence commit: `3cbca9f` (branch `ui/clean-slate-layout`; only `docs/audits/ui-redesign/**` + `docs/screenshots/ui-redesign/phase0/**` — zero production changes, proof below).

## UX-1.x — Phase 1 spec inputs (recon facts grounding the design)
- `SelectionBar.tsx` @ `22b6aba` is **read-only** (span readouts via `fmtClock` `m:ss.mmm`, clear button → `edit.deselect`): the editable 4-format selection-field parser is a prescribed net-new capability, spec'd in `phase1/INTERACTIONS.md` §1.
- `PeakClient` lives in `src/engine/peakClient.ts` (engine-side) and wraps the full `AudioBuffer` → RMS tier = peaks-pipeline-local engine extension (the designed Tier-B approval path); spectrogram = FFT worker infra (A-3 scope) → DECISIONS UX-D5.
- `tokens.css` @ `src/app/styles/` has 131 custom props incl. `--cv-*` canvas set, band heights, `--s1..s4` — v2 token spec EXTENDS this vocabulary (`phase1/TOKENS.md`), no parallel system.
- Phase-1 commit: ``4243617`` — docs only (`phase1/**` + ledgers), zero production diffs.

## UX-2.x — Phase 2 gates (verbatim)
- unit: **90 files / 750 tests PASS** (baseline 86/720 + 4 new files / +30 tests: flag 10, roving 10, visibility 6, overflow 4) · tsc 0 · eslint 0.
- e2e: **65 passed / 0 failed** (baseline 59 + 6 frame2) across chromium-fake-media + chromium-preview; legacy suite (flag OFF) fully green alongside.
- build: PASS · bundle **120,361 B gz / 389,793 B raw** (`index-*.js`; baseline 120,084 gz / 388,669 raw → **+277 B gz, +1,124 B raw** = flag + 4 cores + shell + styles; no new deps).
- Lighthouse (preview :4179, built app, flag default OFF): desktop **P100 / A100 / BP100 / S91** · mobile **P99 / A100 / BP100 / S91** — exactly baseline.
- Flag matrix (e2e frame2.spec.ts): default OFF · `?ui2=1` ON · localStorage ON · URL `ui2=0` overrides storage OFF · `ui2=garbage` forces OFF · OFF-flow intact after visiting ON.
- Flag-ON live check: Z-shell renders (menu Z1; POSITION/PLAY/TRANSPORT/STOP-PAUSE/EDIT-TOOLS/SELECTION band Z2; ruler+waveform Z4–Z7 at 1280×660; dB strip; status Z8 demo.wav; toast) — screenshot viewed 2026-10-16.
