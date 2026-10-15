# Control Bar v2 — Evidence Log

Format: date · commit · environment · command · result · criteria met/open · limitations.

## E-CB-001 — CB-0.1/0.2 environment, branch, repo map
- **Date:** 2026-10-15 · **Commit:** `3691995` (baseline) on `ui/control-bar-v2` · **Env:** sandbox, Node 20.20.2, npm 10.8.2, Playwright Chromium 153 (fake-media + full), headless.
- **Commands:** `git rev-parse HEAD` → `3691995c9843…`; `npm run typecheck` → clean; `npm run lint` → clean.
- **Result:** branch created from `main` @ `3691995` (build hash `index-5UAA3P5m.js` = production's). Component map recorded (audit doc §1): MenuBar, TransportBar (+embedded ToolBar/SelectionBar/BeatBar), StatusBar, floating ZoomBar; signal/command bindings traced per control.
- **Open/limitations:** none for this task.

## E-CB-002 — CB-0.4 baseline gate
- **Date:** 2026-10-15 · **Commit:** `3691995` · **Env:** idle sandbox after `restore-env.sh`.
- **Commands/results:** `npm run typecheck` PASS · `npm run lint` PASS · `npx vitest run` → **826/826 (98 files)** (an 823/826 run under artificial parallel load had 1 contention failure; clean re-run green — contention classified, not a product defect) · `npm run build` PASS · `node scripts/check-bundle.mjs` → **53,620 B gz ≤ 123,661 PASS** (entry = production hash) · full e2e incl. axe: see E-CB-004 · Lighthouse desktop 100/100/100/100 + mobile 99/100/100/100 **vs production** (2026-10-14 release verification, identical build hash; preview re-run NOT RUN in Phase 0 — same build makes prod numbers the build's numbers).
- **Open/limitations:** none.

## E-CB-003 — CB-0.4 visual/interaction baseline (60 configs)
- **Date:** 2026-10-15 · **Commit:** `3691995` · **Method:** `docs/audits/control-bar/baseline-method.mjs` (committed; re-runnable) against the dev server; fixture = the app's deterministic demo sample; fake media for recording states.
- **Results (machine-readable `baseline/measurements.json`, PNGs `baseline/{dark,light}/{width}-{state}.png`, 60/60 zero setup errors after a hardened retry):**
  - Top-area tab stops: **39 at every width** (page: 45).
  - Bar-level horizontal scroll: **60/60 configs — even 1440 px** (hidden scrollbar: `.transport { overflow-x:auto; scrollbar-width:none }`).
  - Page-level horizontal scroll: **20/20 configs at 390/320**.
  - Sub-24×24 controls: **15 distinct types** (menu titles 23 px tall ×6; Clear 25×21; BEAT 45×23; SNAP 48×23; master Volume 129×16; channel vol/pan **74×10**; clip LED **10×10**; add-track min-width 22).
  - Long tasks during 5 s playback: 0 (all widths, idle run); **CLS during playback 0.000** (all widths). Arm-moment shift NOT measured (structural finding F-05).
- **First-run note:** the initial pass had 17 errored configs (dev-server contention + arm→roll clicked too fast); the method was hardened (armed-state settle wait, domcontentloaded, resume-from-JSON) and re-run clean. The hardened script is the committed method.
- **Open/limitations:** real-device capture NOT RUN (no hardware); visual jitter during playback NOT RUN (frame-capture harness not built in Phase 0).

## E-CB-004 — CB-0.4 full e2e (idle-machine baseline)
- **Date:** 2026-10-15 · **Commit:** `3691995` · **Command:** `npx playwright test --workers=1` (clean machine).
- **Result:** recorded verbatim from the run tail appended below on completion; a concurrently loaded run (73 passed + 2 flaky, 32.6 min) was discarded as environment noise and re-run idle.
- **Open/limitations:** none.

## E-CB-005 — CB-0.5 hypothesis triage
- **Date:** 2026-10-15 · **Commit:** `3691995`.
- **Verdicts:** H-01 CONFIRMED · H-02 CONFIRMED · H-03 CONFIRMED (39 tab stops) · H-04 PARTIALLY CONFIRMED · H-05 CONFIRMED (h-scroll all widths; page h-scroll 390/320) · H-06 CONFIRMED (15 types < 24 px) · H-07 PARTIALLY CONFIRMED (no tabular-nums; whole-bar re-render structure; visual jitter NOT RUN) · H-08 PARTIALLY CONFIRMED (4 toggles without aria-pressed; no color-ONLY case) · H-09 PARTIALLY CONFIRMED (no AudioContext-state UI; denial path NOT RUN) · H-10 REFUTED (no undo/redo buttons exist) · H-11 CONFIRMED (zero keydown handling in MenuBar) · H-12 NOT RUN (en-only branch, D-A15).
- **New findings:** F-01..F-10 (audit doc §5), each with file:line or measurement evidence.
