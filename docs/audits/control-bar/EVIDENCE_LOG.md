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

### E-CB-004 result (appended on completion)
- **Idle full run** (`npx playwright test --workers=1`, no CSP_ENFORCE): **84 passed · 1 flaky · 4 failed** (4.0 m active; process waited out a loaded machine).
  - `csp.spec.ts` — expected-fail by spec precondition: enforcing CSP requires `CSP_ENFORCE=1` (prod build); spec self-reports "no enforcing CSP served — run this spec with CSP_ENFORCE=1" (documented D-A10).
  - `effects AM-03/04 Gain −6 dB` (prompt default "0" vs "-6"), `effects AM-11 Seamless Loop` (status "18.53 s" vs "18.55 s" — 20 ms timing expectation), `markers rename toast` (toast not seen in 15 s) — timing-shaped failures on a machine still shedding prior load.
  - `effects Stretch ×1.25` — flaky (passed on retry).
- **Targeted idle re-run of the 5 affected specs** (`CSP_ENFORCE=1 npx playwright test csp.spec.ts effects.spec.ts markers.spec.ts --workers=1`): **14 passed · 3 flaky (all retry-green: Stretch, Gain, Seamless) · 0 failed (1.2 m)**.
- **Baseline verdict:** every e2e spec passes at `3691995` within the standard retry budget with the documented CSP precondition; pattern identical to the release-cycle green run (84+3 retry-green, rc=0) on byte-identical application code (Phase 0 changed no `src/`). No CB-attributable failures. Machine-retry sensitivity of the 3 timing specs is pre-existing and is tracked as backlog item CB-P3 (tighten status/toast assertions), not a Phase 0 gap.

## E-CB-006 — CB-0.4 Lighthouse re-run on local preview (supersedes the earlier NOT-RUN note)
- **Date:** 2026-10-15 · **Commit:** `b3b9371` docs-only (app code = `3691995`) · **Target:** `vite preview` of the local build (entry `index-5UAA3P5m.js` = production hash) · **Tool:** Lighthouse 12.x, chromium-1243.
- **Results:** desktop **P100 / A100 / BP100 / S91** · mobile **P97 / A100 / BP100 / S91**.
- **SEO 91 explained:** the only failing audit is `robots-txt` — `vite preview` serves no `robots.txt` (404), while Vercel production serves the repo's valid one (prod LH: desktop 100/100/100/100, mobile 99/100/100/100). Environment artifact, not a build regression; perf/accessibility/best-practices all 100.
- **Comparison:** identical build hash to production; a11y 100/100 confirms the baseline is WCAG-clean by automated audit — the accessibility gaps this project addresses (H-03/H-04/H-06) are ones axe/LH do not catch.

### CB-D2 correction (DECISIONS): the LH row recorded earlier today as "preview re-run NOT RUN" was superseded within Phase 0 — the re-run above was executed after the idle machine freed up.

## E-CB-007 — CB-0.4 supplemental: playback jitter + arm-moment layout shift (closes the two NOT-RUN cells)
- **Date:** 2026-10-15 · **Commit:** base app `3691995` (measured on dev server) · **Method:** `jitter-method.mjs` (committed; re-runnable) · **Data:** `baseline/jitter.json`.
- **A. Clock jitter during playback** (play → 5 s rAF sampling, 301 frames/config, 1280 & 390 dark):
  - `.time-cursor` width **constant 89.578 px** (distinct values 1/301; p2p 0). `.time-sep`/`.time-total` x: p2p 0, 0 moves >0.05 px. `.transport-time` width p2p 0.
  - Cause: `.transport-time` uses `--font-mono` (tokens.css:82) + fixed `m:ss.mmm` 8-char format ⇒ constant glyph count × mono advance. `font-variant-numeric: normal`.
  - **Verdict:** visual jitter = 0 px ⇒ H-07's jitter component REFUTED by measurement; `tabular-nums` stays a v2 design requirement (master prompt) but is hardening, not defect fix. (Step changes remain possible at minute rollovers ≥10:00 — 8→9 chars; noted, not a jitter oscillation.)
- **B. Arm-moment layout shift** (PerformanceObserver across arm→roll + zone geometry T0/T1/T2):
  - **1280 dark:** Record zone width +**122 px** on arm (meter block mounts); Master zone displaced +**122 px** to the right — inside the hidden-overflow region (no layout-shift entry; F-01's invisible-scroll makes it invisible at default scroll). T1→T2 (roll, rec-time mount): all deltas 0.
  - **390 dark:** all visible transport content jumps **−22 px** on arm (overflow container auto-scrolls toward the armed control; Record zone +122, Master +100 relative). T1→T2: 0.
  - Arm/roll toasts add small shifts: no-input CLS sum **0.012 @1280 / 0.064 @390** (largest single 0.050, toast-close).
  - **Verdict:** F-05 CONFIRMED and quantified; visible impact is width-dependent (hidden @1280 default view, visible jump @390). P2 backlog item "F-05 reserved meter slot" stands, now evidence-backed.
- **Honesty notes:** count-in chip transient (if enabled in settings) was not separately staged — defaults measured; jitter probed at 2 of 6 widths (worst-case candidates: smallest + desktop), mono font argument covers the rest.

## E-CB-008 — CB-0.4 supplemental: microphone-permission-DENIED behavior (closes H-09's NOT-RUN cell)
- **Date:** 2026-10-15 · **Commit:** base app `3691995` · **Method:** `permission-denied-probe.mjs` (committed) — headless Chromium auto-denies the getUserMedia prompt when `--use-fake-ui-for-media-stream` is absent (fake device kept, so permission is the only variable); ground truth captured in-page: `navigator.mediaDevices.getUserMedia` → **`NotAllowedError: Permission denied`**. **Data:** `baseline/permission-denied.json`.
- **Observed (1280 dark):**
  - Arm click → error toast **"Microphone permission was denied"** (`toastError(t().recNoPermission)`, `recordActions.ts:144-145`); console `arming failed {detail: NotAllowedError}`.
  - Button stays **un-armed**: `title="Record"`, no `aria-pressed`, `armed` class absent; meter block and rec-time never mount; Record zone width unchanged (**155 px before = after**).
  - Recovery: second click → identical clean denial (no stuck arming state, toasts deduped to 2 total).
- **Gaps recorded for v2 (feed P2 backlog):** feedback is a transient toast only — no persistent inline hint that recording is blocked; errors announce in the `role="status" aria-live="polite"` toast region (Toasts.tsx:6) rather than an assertive channel; no `aria-pressed`/state semantics to reflect anyway (H-04 family).
- **Honesty notes:** `NotAllowedError` via headless auto-deny is the same DOM exception a real user's "Block" produces; a real OS-level blocked-site state and Safari's per-session prompt were NOT available (marked NOT RUN, not assumed).

## E-CB-009 — CB-1.1 benchmark study (master prompt §3 sources)
- **Date:** 2026-10-15 · **Method:** each source opened and read for control-bar patterns; facts paraphrased with URL citations; nothing copied into the product; AudioMass reference-only. **Record:** `benchmarks.md` (committed).
- **Status:** S1 Logic Pro (Apple Support, LCD display modes via pop-up on the LCD) OPEN · S2 Ableton Reference Manual 12 (9 control-bar sections, numeric position/loop fields, Space/Shift+Space) OPEN · S3 REAPER official userguide PDF (transport context menu → time display format; selection start/finish/duration on bar) OPEN · S4 Audacity manual (Selection Toolbar 4 modes, digit-level editing keys, snap-to-format) OPEN · S5 Cubase steinberg.help (formats Bars+Beats/Seconds/fps/Samples/beat-count-only; secondary display) OPEN · S6 BandLab official **NOT RUN** (help not reachable; secondary sources labelled, no decision rests on them) · S7 AudioMass about OPEN (reference-only).
- **Convergent patterns → decisions:** format switcher lives on the clock; industry format set = time/samples/bars+beats/timecode; numeric selection start/end/length on the bar; explicit keyboard model; fixed grouped zones with transport anchor; metronome+tempo+count-in cluster. Full table in benchmarks.md.

## E-CB-010 — CB-1.3 engine-capability matrix (audit §7.4 re-verified in code)
- **Date:** 2026-10-15 · **Method:** direct code reads (file:line in plan §1), no runtime assumptions.
- **Results:** sampleRate (state.ts:14) · fmtClock truncation contract (format.ts:6) · bpmResult signal (state.ts:198) · recStudio metronome/count-in/manualBpm settings (state.ts:108-121) · countInBeat (state.ts:104) · setVolume imperative (AudioEngine.ts:179) · **getAnalyser() EXISTS (AudioEngine.ts:175) — corrects audit §7.4 "output meter NOT found"** · setLoop (AudioEngine.ts:302) · view.follow command (commands.ts:153) · selection signal (state.ts:55).
- **MISSING → tickets:** time signature (none in engine ⇒ bars+beats assumes 4/4) · timecode/fps (no frame concept) · pseudo-localization harness. All recorded as T-CB-1/2/3 in the plan; no placeholder UI will be built for them.

## E-CB-011 — CB-1.5 (unplanned): F-11 stale-input race in prompt dialogs — investigation + fix
- **Date:** 2026-10-15 · **Discovered:** Phase 1 full-gate e2e (markers/Gain/AM-11 failures). **Base:** `3691995` code (bug pre-existing; NOT introduced by CB work).
- **Evidence chain (RED):** (1) plain e2e runs failed markers rename with toast showing the OLD name while the input held the new one; (2) `control-bar/prompt-probe.mjs` (committed) reproduced: dialog input value reverted `bridge`→`chorus` within a 120 ms settle window (single dialog, single input) — a render landing between fill/keystroke and the input event resets the controlled input to stale state, and confirm read stale state; (3) AM-11's consistent `18.53 s` vs `18.55 s` decoded as fade=10 ms (fill `0` lost) — same class via `SeamlessLoopDialog`.
- **Mechanism:** controlled inputs whose confirm handlers read captured state; any interposed render (e.g., toast auto-dismiss timer) silently discards programmatic/rapid input. Applies to user fast-typing/autofill too.
- **Fix:** confirm handlers read the LIVE input value (refs) in `PromptDialog.tsx` (both dialogs) and `PromptDialogs.tsx` (SeamlessLoop fade/repeat). No other behavior change.
- **Verification (GREEN):** probe 4/4 + 4/4 across two scripts (0 failures post-fix, was ~2/10); targeted markers+effects ×2 → exit 0 (0 failed; 3 then 1 flaky retry-green); full plain e2e **86 passed / 2 flaky (retry-green) / only csp expected-red**; enforced csp targeted **1 passed**; unit 98 files/826 PASS; build ✓; bundle **53,664 B gz (entry `index-Cc7f2Wmr.js`)** ≤ budget; LH desktop P100/A100/BP100/S91, mobile P98/A100/BP100/S91 (S91 = preview robots.txt artifact).
- **Notes:** a11y specs cannot execute under `CSP_ENFORCE=1` (axe injected as inline script → blocked by the enforcing header); the full-gate formula is therefore plain-run + enforced-csp-targeted (CB-D6 corrected). AM-11 assertion stays retry-sensitive (ticket note updated).
- **Honesty notes:** no deterministic in-vitro unit RED was possible (no component-render harness exists); the committed probe script is the repro instrument. Phase 0's lint-PASS claim had predated the measurement scripts landing — corrected via scoped eslint exemption (same class as `scripts/**/*.mjs`).
