# UI Redesign (clean-slate editor frame) — Progress Ledger

**Branch:** `ui/clean-slate-layout` · **Base:** `main` @ `22b6aba` · **Phase-0 commit:** `3cbca9f` · **Flag (future):** `ui.cleanSlateLayout` (default OFF)
**Protocol:** per-task cycle A–I · micro-gates · phase full gates · PCA · two-confirmation stop rule.

| Task | Description | Status | Commit | Evidence |
|---|---|---|---|---|
| UX-0.1 | Capability check, env, branch, persistent files | VERIFIED | `3cbca9f` | branch @ `22b6aba`; Node v20.20.2/npm 10.8.2; capability statement in audit.md §0; assumptions A-1..A-5 stated |
| UX-0.2 | Baseline full gates on untouched main (incl. build+bundle+LH) | VERIFIED | `3cbca9f` | audit.md §UX-0.2; EVIDENCE_LOG UX-0.2 (86f/720t, e2e 59, 120,084 B gz, LH D P100 / M P99) |
| UX-0.3 | Probe harness: 6×6×2 state matrix + measurements + redraw cost | VERIFIED | `3cbca9f` | 72 PNGs `docs/screenshots/ui-redesign/phase0/`; `baseline/probe-metrics.json`; `baseline/redraw-metrics.json`; `baseline/method.md` |
| UX-0.3 fix | Welcome-dialog state-order bug (dismiss consumed Load-sample) | VERIFIED | `3cbca9f` | no-audio shot on first load → `page.reload()` → loaded sequence; full matrix green |
| UX-0.4 | Capability inventory (74 ids, menus, testids, dialogs, findings F-1..F-5) | VERIFIED | `3cbca9f` | `CAPABILITY_INVENTORY.md` |
| UX-0.5 | Clean-room benchmark study (real fetches/live observation only) | VERIFIED | `3cbca9f` | `CLEAN_ROOM_LOG.md` rows 1–9 incl. declared NOT RUN rows (alphamanual 401, BandLab S6) |
| UX-0.6 | audit.md deliverable + honest statuses + stop | VERIFIED | `3cbca9f` | `audit.md` |

Phases: **0 complete (PCA PASSED, gate `PROCEED TO PHASE 1` received 2026-10-16)** · **1 in progress** · 2..6 pending.

## Phase 1 — IA + design spec (docs only; exit proof = zero production diffs)

| Task | Description | Status | Commit | Evidence |
|---|---|---|---|---|
| UX-1.1 | IA: Z1–Z9 zone shell + registry addendum | VERIFIED | `4243617` | `phase1/IA.md` |
| UX-1.2 | Toolbar model (5 groups, APG contract, visibility manager, Reset) + tokens spec | VERIFIED | `4243617` | `phase1/IA.md` §2, `phase1/TOKENS.md` |
| UX-1.3 | Re-homing map — all 74 ids + non-registry capabilities + addendum ids | VERIFIED | `4243617` | `phase1/IA.md` §3–4 (Phase-3 automated test walks this map) |
| UX-1.4 | Three layout options A/B/C + wireframes + tradeoffs + recommendation | VERIFIED | `4243617` | `phase1/LAYOUT-OPTIONS.md`, `phase1/wireframes.html` — **WAITING for user option approval** |
| UX-1.5 | Interaction spec (selection-field parser S/MS/HMS/SMP, menu+toolbar keyboard, tooltips, canvas a11y, targets/responsive, i18n) | VERIFIED | `4243617` | `phase1/INTERACTIONS.md` |
| UX-1.6 | Tier B request decision (UX-D5: request RMS, ticket spectrogram) | VERIFIED | `4243617` | DECISIONS UX-D5 — **WAITING for `APPROVE TIER B: RMS` / decline** |

Phase-1 exit: **PASSED** — user approved Option B (UX-D6) + `PROCEED TO PHASE 2` received
2026-10-16. Tier B: "Do as your Best" is NOT the literal token → RMS NOT approved (ticketed
with spectrogram; a literal `APPROVE TIER B: RMS` before Phase 4 revives it).

## Phase 2 — foundations behind the flag (`ui.cleanSlateLayout`, default OFF)

| Task | Description | Status | Commit | Evidence |
|---|---|---|---|---|
| UX-2.1 | Flag: URL `ui2` override (URL wins) + guarded localStorage, default OFF, cached per load | VERIFIED | `1f8b27c` | `src/app/frame2/flag.ts` + 10 unit tests + 6 e2e |
| UX-2.2 | APG roving core + RovingToolbar wrapper (one tab stop, arrows/Home/End, disabled-focusable) | VERIFIED | `1f8b27c` | `src/app/frame2/roving.ts` + `Toolbar.tsx` + 10 unit tests |
| UX-2.3 | Toolbar-group visibility manager core (5 groups, Reset clears storage) | VERIFIED | `1f8b27c` | `src/app/frame2/visibility.ts` + 6 unit tests (signal+View surface = Phase 3) |
| UX-2.4 | Overflow primitive (priority plan core + ⋯ popup with Esc/click-outside/arrow menu) | VERIFIED | `1f8b27c` | `src/app/frame2/overflow.ts` + `Overflow.tsx` + 4 unit tests |
| UX-2.5 | Z-shell Frame2 (Option B zones Z1–Z9, legacy bars mounted verbatim; capability parity flag-ON) | VERIFIED | `1f8b27c` | `src/app/frame2/Frame2.tsx` + `frame2.css` + App switch; live screenshot verified (waveform 1280×660) |
| UX-2.6 | Full gate: flag OFF identical legacy; flag ON parity; LH; bundle | VERIFIED | `1f8b27c` | unit **90 f / 750 t** PASS · e2e **65 passed** (59 legacy + 6 frame2, both projects) · build PASS · bundle **120,361 B gz (+277 vs baseline)** · LH D **P100/A100/BP100/S91** · M **P99/A100/BP100/S91** = baseline parity |

Phases: **0..5 PASSED · 6 COMPLETE (PCA PASSED) — PROGRAM BUILD COMPLETE.**
Deliverables: `INDEPENDENT-REVIEW.md`, `PROGRAM-SUMMARY.md`, `docs/ui2/clean-slate-layout.md`.
**Awaiting user decisions:** merge of the opt-in preview · (later) default flip ·
(later, token-gated) `APPROVE REMOVE LEGACY UI` · optional `APPROVE TIER B: RMS`.

## Post-program ticket closure — F-2 menubar APG keyboard (shared fix)

| Task | Description | Status | Commit | Evidence |
|---|---|---|---|---|
| F-2 | Shared `MenuBar`: role=menubar + roving titles (1 tab stop/frame: legacy 45→40, frame2 32→27); ←/→/Home/End switch titles (open menu switches too — APG hover equivalent), ↓/↑ open first/last, in-menu ↑↓ Home/End cycle + typeahead, Enter/Space activate → focus returns to menubar, Escape closes+restores, Tab closes; `app/menubarNav.ts` pure model (8 unit tests); 55 e2e selectors migrated button→menuitem; axe-clean with a menu open | VERIFIED | (f2 commit) | menubarNav.test.ts · frame2-a11y menubar e2e |

Gates after F-2: unit **97 f / 800 t** · e2e **78 passed (2.8m)** · tsc 0 · eslint 0 ·
bundle **130,389 gz / 420,869 raw** · LH D **P100/A100/BP100/S91** · M **P98**/A100/BP100/S91.

## Phase 6 — test net, measured perf, independent review, docs, rollout

| Task | Description | Status | Commit | Evidence |
|---|---|---|---|---|
| UX-6.1 | Deliberate-break experiment — 5 mutations vs the net | VERIFIED | `18e4e8c` | INDEPENDENT-REVIEW §4: M1 flag (2 fail) · M2 APG skip (1) · M3 single-surface (correct pass) · M3b full-surface (2, names id) · M4 dB anchors (2); all reverted, suites green |
| UX-6.2 | Measured perf vs Phase 0 (flag OFF parity + flag ON wins) | VERIFIED | `18e4e8c` | PROGRAM-SUMMARY table: bundle 120,084→129,619 gz · LH D identical · M 99→98 · fills 764k→823 flag ON · tab stops 45→32 · targets ≥24 |
| UX-6.3 | Independent diff review (guilty-until-proven per shared file) | VERIFIED | `18e4e8c` | INDEPENDENT-REVIEW.md: 16 shared-file verdicts, honesty §2 (F-4/F-6/F-7 are the ONLY flag-OFF deltas, all e2e-asserted), sweeps clean, R-1/R-2 notes |
| UX-6.4 | Docs: user-facing feature doc + program summary | VERIFIED | `18e4e8c` | `docs/ui2/clean-slate-layout.md` + `PROGRAM-SUMMARY.md` |
| UX-6.5 | Rollout recommendation (opt-in → flip → retire) | VERIFIED | `18e4e8c` | PROGRAM-SUMMARY §Rollout: ship preview as-is; flip after beta window; removal only on `APPROVE REMOVE LEGACY UI` |

Phase-6 gates (final): unit **96 f / 792 t** · e2e **77** · tsc/eslint 0 ·
build PASS · bundle **129,619 gz / 418,329 raw** · LH D **P100/A100/BP100/S91** · M **P98**.

## Phase 5 — states, a11y, i18n, responsive + touch

| Task | Description | Status | Commit | Evidence |
|---|---|---|---|---|
| UX-5.1 | Selection fields (editable): 4 formats (m:ss.mmm default, s.mmm, h:mm:ss.mmm, samples@rate) via `core/timeParse.ts` (12 unit tests); Enter commits / Escape reverts (focus stays); `garbage`/`1:99`/negatives never commit (aria-invalid + role=status message); End<Start rejected; clamped to doc; commits funnel through the SAME path the canvas drag writes; keyboard selection PROVEN (e2e + screenshot: committed 0–3.5 s renders in the graph) | VERIFIED | `d817d9b` | frame2-a11y.spec.ts |
| UX-5.2 | i18n/F-6: **setLocale was NEVER wired** (deeper than the catalog gap) → wired in bootstrap from the documented `waveforge.locale`; bn partial catalog (85+ core strings, honest merge-with-English fallback); bn e2e: ফাইল/সম্পাদনা/… menus + টুলবার names + fields render Bengali, zero clipped menu titles, no x-overflow | VERIFIED | `d817d9b` | bn e2e + screenshot (viewed) |
| UX-5.3 | Canvas a11y: visually-hidden `role=status` summary (document, selection in active format, cursor when stopped) — canvas never the only way; fields are the keyboard select/seek/zoom equivalents (+ existing global keys) | VERIFIED | `d817d9b` | summary e2e assertions |
| UX-5.4 | F-4 CLOSED: toast close ≥24×24 (shared CSS, both frames) + e2e bbox assert ≥23.5 · F-7 CLOSED: Escape stack completion (draftSave/drafts/metadata join the closer chain) — e2e asserts BOTH frames · tooltips now Escape-dismissible (§9) · reduced-motion global kill switch | VERIFIED | `d817d9b` | frame2-a11y.spec.ts |
| UX-5.5 | Responsive/touch: ≤480 bands wrap (folding gated off), sections max-width, selgroup wraps, menubar scrolls internally (page NEVER x-scrolls — scrollWidth asserted 400/400), pointer:coarse ≥40px hit areas; axe clean on welcome dialog + main + 390px viewport | VERIFIED | `d817d9b` | frame2-a11y.spec.ts (7/7) |

Phase-5 gates: unit **96 f / 792 t** PASS · tsc 0 · eslint 0 · e2e **77 passed** ·
build PASS · bundle **129,619 B gz / 418,329 raw** (+9,535 gz cumulative) ·
LH desktop **P100/A100/BP100/S91** (= baseline) · mobile **P98**/A100/BP100/S91.

## Phase 4 — track panel + Tier-A audio graph (flag ON only)

| Task | Description | Status | Commit | Evidence |
|---|---|---|---|---|
| UX-4.1 | Nice-interval ruler (existing 1-2-5 `niceTickFor`) + NEW minor ticks (major/5, absolute-time aligned, major-excluded — `core/zoom.ts` `minorTickStep/minorTicks`, 5 unit tests) | VERIFIED | `19e1fdd` | tests/unit/frame2Ticks.test.ts; screenshot |
| UX-4.2 | Vertical scale linear+dB with the analytic anchors 1.0→0 dB, 0.5→−6.02, 0.1→−20, floor −60→CENTER (`core/dbScale.ts` pure core; DOM panel labels AND the waveform painter consume the SAME mapping — picture tells the truth); panel Z5/Z6 in the frame2 grid | VERIFIED | `19e1fdd` | tests/unit/frame2Scale.test.ts (5); screenshot: labels aligned to geometry |
| UX-4.3 | Peaks-mip waveform: existing PeakClient pyramid reused; NEW batched painter — one Path2D fill per lane via `core/wavePath.ts` `lanePathPoints` (4 unit tests) behind `renderer.batchedLanes`; raw-lane path untouched | VERIFIED | `19e1fdd` | tests/unit/frame2WavePath.test.ts |
| UX-4.4 | Separate overlay layer owning the playhead (`Graph.tsx` overlay canvas; renderer `overlayPlayhead` skips main-frame playhead; runtime cursor loop repaints the waveform ONLY when follow-paging moves the view; legacy path default-off unchanged) | VERIFIED | `19e1fdd` | redraw metrics below; playhead screenshot during playback |
| UX-4.5 | Track panel (per-lane tags L/R, dB anchor labels, lane borders) + interactions preserved (click-seek/drag-select/wheel zoom on the unchanged renderer bindings) + e2e frame2 suites still green incl. selection drag & axe | VERIFIED | `19e1fdd` | 70 e2e passed |

**Redraw cost, 5 s playback @1280×800 (probe `redraw-probe.mjs --url …?ui2=1` vs legacy):**
- legacy (flag OFF, re-verified this phase): rAF 607 · fillRect **766,893** · beginPath 303 · clearRect 0 · 1 LoAF 58 ms (baseline 605/764,362/302/0 — unchanged).
- **frame2 (flag ON): rAF 610 · fillRect 823 (−99.89%) · beginPath 0 (Path2D) · clearRect 301 (overlay) · 1 LoAF 67 ms (blocking 17 ms).**
Artifacts: `baseline/redraw-metrics.json` (legacy) + `baseline/redraw-metrics-frame2.json` (frame2).

## Phase 3 — toolbar re-homing + automated re-homing test

| Task | Description | Status | Commit | Evidence |
|---|---|---|---|---|
| UX-3.1 | 5 group definitions (transport 10 / edit 10 / tools 7 / timenap 3 / meters 2+extras); registry-dispatch via data-cmd; legacy testids + SVG artwork preserved | VERIFIED | `74fe32b` | `src/app/frame2/groups.ts` + `Groups.tsx`; 11 unit tests |
| UX-3.2 | Visibility commands in the ONE registry (`view.toolbars.*` ×5, `view.layoutReset`, `help.toolbars`) + signal store + Toolbars popover (checkbox menu, arrows/Esc, persistence, Reset clears storage) | VERIFIED | `74fe32b` | `visibilityStore.ts`, `ToolbarsPopover.tsx`, commands.ts addendum, en.ts keys |
| UX-3.3 | Option B bands live in Frame2: Z2 primary (transport+position+selection+⋯), Z3 secondary (edit/tools/timenap/meters + ⚙ + ⋯); RovingToolbar per APG; overflow folds whole sections by priority (idempotent closed-loop plan); Tooltips = registry label+real kbd only | VERIFIED | `74fe32b` | Frame2.tsx rebuild; `useOverflow.ts` (oscillation bug found+fixed); interact e2e (roving/overflow/semantics) 3/3 |
| UX-3.4 | Re-homing test: UNIT reachability — every registry id ∈ menu ∪ band controls ∪ popover ∪ {automation.toggle=lane surface}; E2E EXECUTION walk — every capability executed once through its v2 surface, same command | VERIFIED | `74fe32b` | `frame2Reach.test.ts` 5/5; `frame2-rehoming.spec.ts`: **100 executed / 102 entries, failed: []** (skips documented: OS file picker headless; punch disabled at band-walk state — command already executed via menu); + axe flag-ON clean |
| F-2 fix | MenuBar keyboard was Phase-4 scope, but the walk surfaced a REAL frame2 blocker: sticky bands (z 32) covered menu dropdowns → `.f2-menubar` z raised above bands (flag-ON only CSS) | VERIFIED | `74fe32b` | dbg evidence + menu walk now fully executable; flag-OFF untouched |

Phase-3 gates: unit **92 f / 766 t** PASS · tsc 0 · eslint 0 · e2e **70 passed** (all projects) ·
build PASS · bundle **125,238 B gz / 405,538 raw** (+4,877 gz vs baseline; toolbar system) ·
LH desktop **P100/A100/BP100/S91** (= baseline) · mobile **P98**/A100/BP100/S91 (−1 perf, +4.9 KB).
