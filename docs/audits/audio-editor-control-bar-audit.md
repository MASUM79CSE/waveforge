# WaveForge Control Bar — Audit (Deliverable 1, Phase 0)

**Date:** 2026-10-15 · **Branch:** `ui/control-bar-v2` · **Baseline commit:** `3691995` (=`main`, production build hash `index-5UAA3P5m.js`) · **Method:** repository inspection at this commit + live-app measurement script (`docs/audits/control-bar/baseline-method.mjs`) + baseline screenshots in `docs/audits/control-bar/baseline/`.

**Capability note:** browser evidence gathered with headless Chromium via Playwright (fake-media for recording states). Real audio hardware, real screen readers and real mobile devices were NOT available; such checks are marked NOT RUN, never assumed.

---

## 1. Repository and component map (top control area)

App shell order (`src/app/components/App.tsx:40-48`): `RestoreBanner` → `MenuBar` → `TransportBar` → (`CanvasPane` + `TrackLanes`) → `AnalysisPanel` → `StatusBar`. The "top control area" = **MenuBar row + TransportBar row**; the TransportBar embeds the edit toolbar, selection readout and beat-grid zone as labeled zones. A floating `ZoomBar` sits bottom-left over the canvas (inventoried: toolbar-adjacent). `StatusBar` (bottom) carries document facts incl. **sample rate**.

| Region | Component | File | Key signals / sources |
|---|---|---|---|
| App menu row | `MenuBar`, `MenuDropdown`, `MenuItem` | `src/app/components/MenuBar.tsx` | `menus`, `commands` (registry), `Brand` |
| Transport row container | `TransportBar` + `Zone` | `src/app/components/TransportBar.tsx` | `docInfo, playing, looping, cursorPos, selection, armed, recording, recSeconds, recLevel, peakHoldDb, clipLatched, countInBeat, recStudio, channelMutes/Volumes/Pans, channelsSwapped` |
| Clock | inline in `TransportBar` ("Position" zone) | `TransportBar.tsx:56-64` | `cursorPos`, `docInfo.duration`, `fmtClock` (`src/core/format.ts:6`) |
| Play | big play/pause button | `TransportBar.tsx:66-84` | `playing`, `transport.togglePlay()` |
| Seek/loop/record | "Transport" zone | `TransportBar.tsx:86-137` | `transport.nudge()`, `looping`, `transport.toggleLoop()`, `armed/recording`, `toggleRecord()` |
| Stop/Pause | "Stop / Pause" zone | `TransportBar.tsx:139-166` | `transport.pause()/.stop()` |
| Edit tools | `ToolBar` (embedded) | `src/app/components/ToolBar.tsx` + `src/app/toolbarDefs.ts` | `commands` registry (15 ids), `docInfo` |
| Selection readout | `SelectionBar` | `src/app/components/SelectionBar.tsx` | `selection`, `runCommand('edit.deselect')`, `fmtClock` |
| Beat/grid | `BeatBar` (in `ViewBars.tsx`) | `src/app/components/ViewBars.tsx:64-96` | `beatsShown`, `snapToBeat`, `bpmResult` |
| Record cluster | "Record" zone | `TransportBar.tsx:174-216` | `recStudio.monitoring` (`setMonitoring`), `punchRecord()`, `recLevel/peakHoldDb/clipLatched`, `countInBeat` |
| Channel strips + master | "Master" zone | `TransportBar.tsx:218-263`, `ChannelStrip` `:276-320` | `channelMutes/Volumes/Pans`, `channelsSwapped`, `ensureProject()`, **local `useState(0.9)`** for master volume |
| Floating zoom | `ZoomBar` | `ViewBars.tsx:16-62` | `vzoom`, `view.*` commands |
| Status | `StatusBar` | `src/app/components/StatusBar.tsx` | `docInfo, selection, viewSpp, cursorPos`, `Brand` |

Keyboard model lives in `src/app/keyboard.ts` (transport/zoom/marker keys) + `src/app/shortcuts.ts` (modifier + legacy layers). Recording pipeline: `src/app/recordActions.ts` (`toggleRecord`, `setMonitoring`, `punchRecord`).

## 2. Control inventory (every top-area control; state from code, boxes from live measurement)

Accessible-name column: **AL** = `aria-label`, **T** = `title` fallback, **TXT** = text content. Boxes = 1440×800 dark, stopped (from `baseline/measurements.json`; constant across widths).

| # | Control (label as rendered) | File:lines | Bound to | Shortcut | Enabled when | Acc name / state attrs | Box WxH | Tests |
|---|---|---|---|---|---|---|---|---|
| 1-6 | Menus File / Edit / Effects / Analyze / View / Help | MenuBar.tsx:26-58 | opens dropdown; items = registry | none (hover/click) | always | TXT only; **no `aria-haspopup`/`aria-expanded`**; no arrow-key model | 40-69×**23** | `menuConsistency.test.ts`, a11y e2e |
| 7 | Clock (cursor/duration) | TransportBar.tsx:56-64 | `cursorPos`/`docInfo.duration` | — | — | text; `title="Cursor / duration"`; no format switch | ~150×17 | transportZones.spec (view) |
| 8 | Play/Pause (icon) | TransportBar.tsx:66-84 | `transport.togglePlay()` | Space | `doc` | AL "Play/Pause (Space)", `aria-pressed`, testid `transport-play` | 44×32 | toolbar.spec, flows.spec |
| 9 | Back 5 s | TransportBar.tsx:90-101 | `transport.nudge(-5)` | Shift+← | `doc` | AL "Back 5 seconds" (**shortcut omitted from name**; title has it) | 30×30 | transportZones.spec |
| 10 | Forward 5 s | TransportBar.tsx:102-113 | `transport.nudge(5)` | Shift+→ | `doc` | same as #9 | 30×30 | transportZones.spec |
| 11 | Loop | TransportBar.tsx:114-126 | `transport.toggleLoop()` | L | `doc` | **T only; no `aria-pressed`** (`.active` class) | 30×30 | toolbar.spec (BEAT-adjacent) |
| 12 | Record (mic icon) | TransportBar.tsx:127-137 | `recordActions.toggleRecord()` | R | always (no `disabled`) | **T only, 3-state text; no `aria-pressed`** (`.armed/.recording` classes) | 30×30 | studioRecord.spec |
| 13 | Pause | TransportBar.tsx:142-153 | `transport.pause()` | Space | `doc && playing` | AL "(Space)", testid | 30×30 | transportZones.spec |
| 14 | Stop | TransportBar.tsx:154-165 | `transport.stop()` | — | `doc` | AL, testid | 30×30 | transportZones.spec |
| 15-20 | Edit tools: Cut, Copy, Paste, Trim, Silence, Delete | ToolBar.tsx:27-41 + toolbarDefs | registry `edit.*` | Ctrl+X/C/V, Del, Shift+X… | `doc` | AL = "Label (kbd)"; `role=toolbar` "Quick tools"; all natural tab stops | 28×28 | toolbar.test.tsx, toolbar.spec |
| 21-26 | Quick FX: Gain, Fade In, Fade Out, Normalize, Reverse, Invert | same | registry `fx.*` | menu-only | `doc` | same | 28×28 | toolbar.test.tsx |
| 27-29 | Zoom In / Out / Reset | same | registry `view.zoom*` | + − 0 | `doc` | same | 28×28 | viewNav.spec |
| 30 | Selection Start / End / Duration (text) | SelectionBar.tsx:15-31 | `selection` (READ-ONLY) | — | — | text cells, `role=group` "Selection" | ~3×110×21 | selectionBar.test.tsx |
| 31 | Clear Selection ✕ | SelectionBar.tsx:32-40 | registry `edit.deselect` | Q | `selection` | AL+T "Clear Selection (Q)" | 25×**21** | selectionBar.test.tsx |
| 32 | BEAT toggle | ViewBars.tsx:68-76 | `toggleBeatsShown()` | menu `analyze.beats` | always | AL(T), **`aria-pressed` ✓**, text "BEAT" | 45×**23** | toolbar.spec, viewBars.test |
| 33 | SNAP toggle | ViewBars.tsx:77-86 | **direct signal write** `snapToBeat.value` | none | always | **`aria-pressed` ✓**, text "SNAP" | 48×**23** | viewBars.test |
| 34 | BPM readout | ViewBars.tsx:87-90 | `bpmResult` (read-only) | — | — | text; "—" until Analyze→BPM; title explains | ~60×21 | viewBars.test |
| 35 | Monitor | TransportBar.tsx:177-186 | `setMonitoring(!)` | M | always | **T only; no `aria-pressed`** (`.active`); testid `monitor-toggle` | 30×30 | studioRecord.spec |
| 36 | Punch | TransportBar.tsx:187-197 | `punchRecord()` | P | `!recording && selection` | T only; testid `punch-button` | 30×30 | punchProject.spec |
| 37 | Rec meter + peak hold | TransportBar.tsx:198-212 | `recLevel`, `peakHoldDb` | — | **mounted only while armed/recording** | `title` dB text; no meter role | 110×6 | studioRecord.spec (view) |
| 38 | Clip LED | TransportBar.tsx:203-209 | `resetClipLatch` | — | armed/recording | AL "Clip indicator"; `title` = dynamic dB | **10×10** | studioRecord.spec (clip-led) |
| 39 | Rec elapsed time | TransportBar.tsx:210 | `recSeconds` | — | recording | text | ~60×17 | studioRecord.spec |
| 40 | Count-in chip | TransportBar.tsx:214-216 | `countInBeat` | — | counting | text `4..1`; testid `count-in` | ~24×17 | studioRecord.spec |
| 41-42 | L / R Mute | TransportBar.tsx:283-295 | `toggleChannelMute(ch)` | none | stereo doc | AL "Left — mute", **`aria-pressed` ✓** | 26×**24** | mixControls.test.ts |
| 43-46 | L / R Volume, Pan sliders | TransportBar.tsx:296-313 | `setChannelVolume/Pan` | none | stereo doc | AL "Left volume"/"Left pan" | **74×10** | mixControls.test.ts |
| 47 | Add track ＋ | TransportBar.tsx:222-230 | `ensureProject()` | none | `doc` | AL `t().trackAdd`; **min-width 22** | 22×24 | multitrack.spec |
| 48 | Swap ⇄ | TransportBar.tsx:231-241 | `toggleChannelsSwapped()` | none | stereo doc | AL+T; **no `aria-pressed`** (`.active`) | 30×24 | mixControls.test.ts |
| 49 | Master volume slider | TransportBar.tsx:246-259 | **local `useState(0.9)`** → `engine.setVolume` | none | `doc` | **T only** ("Volume") | **129×16** | none found |
| 50-55 | ZoomBar + − R ↕+ ↕− (floating) | ViewBars.tsx:16-62 | registry `view.zoom*` (horiz), direct `setVZoom` (vert) | + − 0 (vert: none) | always (vert clamped) | AL incl. shortcuts; `role=toolbar` "Zoom" | 28×28 | toolbar.spec (D5) |
| 56-62 | StatusBar facts (name, kHz, mono/stereo, duration, sel length, spp, cursor-s, version) | StatusBar.tsx:10-34 | signals | — | — | text; cursor in **seconds** (2nd clock format) | — | flows.spec (view) |

Routing note: only #15-29 (ToolBar) and #31 (Clear) execute through the **command registry**; transport (#8-14), beat (#32-34) and record (#35-40) call action modules directly, and SNAP writes a signal in-place. One command system exists (`commands.ts`, 86+ ids); the bar just doesn't use it uniformly (F-09).

## 3. Baseline measurements (method + numbers; machine-readable: `baseline/measurements.json`)

Method: `baseline-method.mjs` drives the real dev server at widths 1440/1280/1024/768/390/320 × themes dark/light × states no-audio / loaded-stopped / playing / recording (armed+rolled via fake media) / selection (Ctrl+A). Per config: bounding boxes + accessible names of every top-area control, tab-stop counts, page- and bar-level horizontal-overflow probes, 60 PNGs in `baseline/{theme}/{width}-{state}.png`, and — during a 5 s playback per width — long-task count and accumulated CLS.

| Metric | Value (all measured at `3691995`) |
|---|---|
| Configs captured | **60/60** (screenshots 60; `measurements.json` rows 60, zero setup errors) |
| Top-area tab stops (stopped, dark) | **39 at every width** (whole page: 45) |
| Bar-level horizontal scroll | **present in 60/60 configs — even 1440 px** (`.transport` has `overflow-x:auto; scrollbar-width:none` → invisible scrollbar) |
| Page-level horizontal scroll | **all 20 configs at 390/320** |
| Controls below 24×24 CSS px | **15 distinct controls** (every config): 6 menu titles 23 px tall; Clear-Selection 25×21; BEAT 45×23; SNAP 48×23; master Volume 129×16; L/R vol+pan sliders **74×10**; clip LED **10×10**; (Add-track min-width 22) |
| Long tasks during 5 s playback | 0 at all widths (idle-machine run; a parallel-load run showed 2-65 — environment noise, discarded) |
| CLS during playback | **0.000** at all widths (the at-risk shift is the conditional rec-meter mount at ARM — structural finding F-05; arm-moment shift measured separately, see the supplemental row below) |
| Supplemental (E-CB-007, `jitter-method.mjs` → `baseline/jitter.json`) | **Clock jitter during playback: 0 px** over 301 rAF frames at 1280 & 390 dark — `.time-cursor` width constant 89.578 px (`--font-mono` + fixed `m:ss.mmm` 8-char format; `font-variant-numeric: normal`). **Arm-moment shift: Record zone +122 px** on arm, Master zone displaced **+122 px @1280** (inside hidden overflow — no CLS entry) and **all visible content jumps −22 px @390** (overflow container auto-scrolls to the armed control); rec-time mount adds no second shift (zone already widened). Arm/roll toasts add CLS 0.012 @1280 / 0.064 @390 (no-input sum). |
| Typecheck / lint | PASS / PASS |
| Unit suite | **826/826 (98 files)** (an earlier 823/826 run under artificial load had 1 contention failure — clean re-run green) |
| Full e2e (incl. axe + CSP) | recorded in EVIDENCE_LOG (idle run; release-era gate at this build: 84 passed + 3 retry-green flakes, rc=0) |
| Build + bundle | PASS — **53,620 B gz ≤ 123,661** (entry hash = production's `index-5UAA3P5m.js`) |
| Lighthouse | desktop 100/100/100/100 · mobile 99/100/100/100 **vs production** (same build; 2026-10-14 release verification); local preview re-run E-CB-006: desktop P100/A100/BP100/S91 · mobile P97/A100/BP100/S91 (S91 = vite-preview robots.txt absence, env artifact; prod S100) |

## 4. Hypothesis triage (H-01..H-12)

| ID | Verdict | Evidence |
|---|---|---|
| H-01 no switchable clock | **CONFIRMED** | Single format `fmtClock` (m:ss.mmm, truncating) in the Position zone; no samples/bars+beats anywhere; Status bar shows a *second*, inconsistent format (`toFixed(3)` s). `core/format.ts:6`, `TransportBar.tsx:57`, `StatusBar.tsx:31` |
| H-02 selection not editable | **CONFIRMED** | Start/End/Duration are read-only spans; only action = Clear. `SelectionBar.tsx:15-31` |
| H-03 many tab stops, no roving tabindex | **CONFIRMED** | 39 top-area tab stops at every width; no `role=toolbar` roving model outside ToolBar (which itself is all tab stops). Measured. |
| H-04 icon-only naming/pressed/shortcut gaps | **PARTIALLY CONFIRMED** | Every control has *a* name (AL or T fallback), but loop/record/monitor/punch/swap are title-only; seek names omit shortcuts (titles include them); record/loop/monitor/swap lack `aria-pressed`. |
| H-05 narrow-width clipping/h-scroll | **CONFIRMED** | Bar-level h-scroll at ALL widths (hidden scrollbar); page-level h-scroll at 390/320 (20 configs). |
| H-06 targets below 24 px | **CONFIRMED** | 15 control types measured below 24×24 (sliders 10-16 px tall, clip LED 10×10, menu titles 23 px). |
| H-07 clock jitter / over-render | **PARTIALLY CONFIRMED** (jitter component REFUTED by measurement, E-CB-007) | No `font-variant-numeric: tabular-nums` anywhere (grep); `TransportBar` reads `cursorPos.value` at component top → whole bar re-renders per clock tick (structural). But measured jitter is **0 px over 301 frames** at both probed widths — the mono font + fixed 8-char format already pin the clock width; `tabular-nums` is v2 design hardening (master-prompt requirement), not a defect fix. |
| H-08 color-only state | **PARTIALLY CONFIRMED** | play/mute/BEAT/SNAP expose `aria-pressed`; loop/record/monitor/swap do not (class-based; record also changes title text — not color-*only*, but not programmatic). |
| H-09 no inline engine/permission feedback | **PARTIALLY CONFIRMED (both cells now measured, E-CB-008)** | No AudioContext running/suspended UI exists (grep: comments only). Mic-permission-denied measured (headless auto-deny, ground truth `NotAllowedError`): arm → error toast "Microphone permission was denied", button stays un-armed (`title` "Record", no aria-pressed, meter/rec-time never mount, zone width unchanged 155 px), retry is identically clean (no stuck state), console logs `arming failed`. Gaps for v2: feedback is a **transient toast only** (no persistent inline hint that recording is blocked) and errors announce in the **polite** (`role="status"` `aria-live="polite"`) region rather than an assertive one — covered by the engine-state chip backlog item. |
| H-10 undo/redo tooltips | **REFUTED (as stated)** | The toolbar has no undo/redo buttons at all — nothing to tooltip (menus show kbd hints). Recorded as a *coverage gap* input for Phase 1, not a tooltip defect. |
| H-11 menubar APG keyboard | **CONFIRMED** | `MenuBar.tsx` has no keydown handling at all (click + hover-switch only); no arrow traversal, no Escape close. |
| H-12 long localized labels | **NOT RUN** | `main` ships English-only (audit decision D-A15); no pseudo-localization harness exists yet. |

## 5. Verified findings (new, severity-ordered)

- **F-01 (HIGH) — Invisible-scroll control bar.** `.transport { overflow-x:auto; scrollbar-width:none }`: at **every** width the bar scrolls horizontally with the scrollbar hidden — the Record and Master zones (monitor, punch, meter, strips, master volume) sit off-viewport at ≤1280 px with no visible affordance; at 390/320 the page itself scrolls horizontally too. Violates rule-of-UX "no hidden critical state" and the project's own no-horizontal-scroll rule.
- **F-02 (HIGH) — Sub-24×24 targets (WCAG 2.2 SC 2.5.8).** 15 control types: sliders 74×10, clip LED 10×10, master volume 129×16, menu titles/BEAT/SNAP 23 px tall, Clear 21 px tall, add-track 22 px wide.
- **F-03 (MED) — No toolbar keyboard model.** 39 tab stops; `role="toolbar"` exists on ToolBar/ZoomBar but without roving tabindex/arrows (APG); menubar has no keyboard model at all.
- **F-04 (MED) — Programmatic state gaps.** loop/record/monitor/swap lack `aria-pressed`; five+ controls named only via `title`; seek buttons' accessible names drop the shortcut that their tooltips show.
- **F-05 (MED) — Arm-time layout shift (measured, E-CB-007).** Rec meter + count-in chip are conditionally mounted (`TransportBar.tsx:198-216`). Measured: arming widens the Record zone **+122 px**; the Master zone is displaced **+122 px @1280** (hidden-overflow region — invisible at default scroll but present), and at **390 the entire visible bar content jumps −22 px** as the overflow container auto-scrolls to keep the armed control in view. The subsequent rec-time mount causes no second shift (zone already widened). Arm/roll toast CLS is minor (no-input sum 0.012 @1280 / 0.064 @390). v2 guidance: reserve a stable Record-zone slot (or overlay the meter) so arming is shift-free at every width.
- **F-06 (MED) — Clock is single-format and duplicated inconsistently.** m:ss.mmm in the bar; raw seconds in the status bar; no samples/bars+beats (both computable: sampleRate known; BPM from `bpmResult` when detected).
- **F-07 (MED) — Selection is not numeric-editable** (read-only spans; Audacity/Reaper parity gap).
- **F-08 (LOW) — Master volume is component-local state** (`useState(0.9)`): resets on remount, never persisted, invisible to other UI (v1 behavior — record only).
- **F-09 (LOW) — Mixed routing:** transport/beat/record controls bypass the command registry (direct action calls; SNAP writes the signal in place).
- **F-10 (INFO) — Scattered mode clusters:** metronome only in File menu; zero-cross only in View menu; BPM readout dead until Analyze→BPM; count-in visible only while running.

## 6. Existing test coverage of the top area

Unit: `toolbar.test.tsx` (registry parity of the 15 tool buttons), `selectionBar.test.tsx`, `viewBars.test.ts`, `menuConsistency.test.ts` (menus ↔ registry), `mixControls.test.ts`, `shortcutCatalog.test.ts`, `theme.test.ts`. E2E: `toolbar.spec` (D5 zoom + BEAT toggle), `transportZones.spec`, `studioRecord.spec` (arm/roll/punch/monitor/takes), `punchProject.spec`, `flows.spec`, `viewNav.spec`, `multitrack.spec`, plus the permanent axe WCAG-AA zero-violation gate and CSP gates. Coverage is behavior-level; **no test measures target sizes, tab-stop counts, overflow behavior, or clock format** (those baselines start with this document).

## 7. Prioritized backlog (inputs to Phase 1; nothing implemented in Phase 0)

**P1.** F-01 responsive/overflow strategy (bars must never hide critical controls) · F-02 target sizes · F-03 APG toolbar + menubar keyboard model · F-06 switchable clock (time/samples; bars+beats when tempo known) · F-07 editable selection fields.
**P2.** F-04 programmatic state (`aria-pressed`/names) · H-09 engine-state chip + persistent inline feedback for blocked recording (denial today = transient toast in a *polite* live region, E-CB-008) · F-05 reserved meter slot (no shift on arm) · F-09 route all bar actions through the registry · undo/redo quick tools (H-10 coverage gap) · consolidate tempo/grid/metronome cluster (F-10).
**P3.** F-08 master volume as a signal (+ persistence decision) · optional group customization (stretch per brief) · pseudo-localization harness (H-12) · touch dock decision (≤600 px).

**Engine-capability notes for CB-1.3 (verified in code):** sample rate (known per doc), samples-format time (trivial via `sampleRate`), bars+beats (needs `bpmResult` + assumed 4/4 — signature is NOT detected today), loop (exists, `looping`), metronome/count-in (exists, `record.metronome` + settings), master volume (engine `setVolume` exists; no signal), master *meter/meter bridge* (record-side metering exists; output meter NOT found in this pass — CB-1.3 will re-verify), follow-playhead (`view.follow` command exists).

## 8. Phase 0 report (§7.5 template)

**Phase goal:** establish ground truth before any Control Bar v2 work — repository/component map, exhaustive control inventory, machine-verifiable baseline (gates + visual/interaction matrix + perf), hypothesis triage, severity-ordered findings, and a prioritized backlog. No production changes.

**Tasks closed:**

| Task | Status | Evidence |
|---|---|---|
| CB-0.1 Capability check, env, branch, persistent ledger | VERIFIED | E-CB-001; branch `ui/control-bar-v2` from `main`@`3691995` |
| CB-0.2 Repository map (file:lines for every top-area component) | VERIFIED | this doc §1 |
| CB-0.3 Control inventory (62 rows: bindings, shortcuts, acc-name/state gaps, measured boxes) | VERIFIED | this doc §2; boxes from `baseline/measurements.json` |
| CB-0.4 Baseline: gates + 60-config visual/interaction matrix + perf | VERIFIED | E-CB-002/003/004/006; `baseline-method.mjs`; 60 PNGs |
| CB-0.5 Hypothesis triage H-01..H-12 + new findings F-01..F-10 | VERIFIED | this doc §4–5; E-CB-005 |
| CB-0.6 Deliverable 1 (this document) | VERIFIED | this doc, §§1–7 |

**Gate results (all at `3691995`, zero `src/` changes in Phase 0 — verified `git diff --stat 3691995..HEAD -- src/ tests/ scripts/ index.html package.json` = empty):**

| Gate | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npx vitest run` | **826/826 (98 files)** |
| e2e (`--workers=1`) | **84 passed · 3 flaky (retry-green) · 0 failed**; `csp.spec.ts` requires `CSP_ENFORCE=1` (documented precondition, D-A10) — targeted idle re-run of all affected specs: 14 passed / 3 flaky / 0 failed |
| `npm run build` + `check-bundle.mjs` | PASS, **53,620 B gz ≤ 123,661**; entry `index-5UAA3P5m.js` = production hash |
| Lighthouse (local preview re-run, E-CB-006) | desktop P100/A100/BP100/S91 · mobile P97/A100/BP100/S91 — S91 = vite-preview robots.txt absence (env artifact; prod S100) |
| Visual baseline | 60/60 configs, 0 errors (6 widths × 2 themes × 5 states; PNGs + `measurements.json` committed) |
| Supplemental visual/perf (E-CB-007) | playback clock jitter **0 px** (301 frames × 2 widths) · arm-moment shift measured (+122 px zone displacement @1280, −22 px visible content jump @390) · toast CLS ≤0.064 — `jitter-method.mjs` + `baseline/jitter.json` committed |
| Supplemental permission probe (E-CB-008) | mic-permission **denied** (headless auto-deny, `NotAllowedError`): error toast shown, button stays un-armed, zone geometry unchanged, retry clean — `permission-denied-probe.mjs` + `baseline/permission-denied.json` committed |

**Benchmark sources (plan §3):** NOT OPENED in Phase 0 — Phase 1 CB-1.1 opens them; anything unreachable will be recorded NOT RUN. No audiomass.co content was consulted or copied this phase (zero-trace rule holds; e2e guard in place from release audit).

**Deviations & decisions:** CB-D1..CB-D6 in `control-bar/DECISIONS.md` (baseline branch, dev-server matrix with relative perf rows, method script location, discarded contaminated run, LH re-run supersedes NOT-RUN note, e2e classification).

**Open gaps / open errors:** **zero.** Carry-over tickets are backlog items (§7), not gaps: CB-P3-1 (tighten 3 timing-sensitive e2e assertions), engine-capability notes for CB-1.3 (§7.4).

**Phase 0 audit PASSED: zero open gaps and zero open errors.**

**Awaiting `PROCEED TO PHASE 1`.**
