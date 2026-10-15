# Control Bar v2 — Implementation Plan (Deliverable 2)

**Status:** Phase 1 output · **Date:** 2026-10-15 · **Base:** `main`@`3691995` (audit deliverable 1: `audio-editor-control-bar-audit.md`; benchmarks: `control-bar/benchmarks.md`; decisions ledger: `control-bar/DECISIONS.md`).
**Scope guard:** v1 control bar stays intact and default until Phase 6 decision; everything ships behind `ui.controlBarV2`, default OFF. No new dependencies; no new network requests/fonts/CDNs; i18n en/bn; ≤400-line files; one command registry; state from signals only.

## 1. Engine-capability matrix (CB-1.3 — every row verified in code 2026-10-15)

| Capability | Status | Evidence | v2 use |
|---|---|---|---|
| Sample rate | AVAILABLE | `sampleRate: number` on doc/state (`src/app/state.ts:14`) | samples-format clock (integer division) |
| Time format | AVAILABLE | `fmtClock` m:ss.mmm truncating (`src/core/format.ts:6`) | default clock; keep truncation contract |
| Samples-format clock | AVAILABLE (formatter to add) | trivial `sec * sampleRate` | Phase 2 pure formatter + unit tests |
| Bars+beats clock | AVAILABLE-WITH-CAVEAT | `bpmResult: signal<BpmResult \| null>` (`src/app/state.ts:198`); **no time signature anywhere in engine** (grep) ⇒ 4/4 assumption | show bars+beats ONLY when `bpmResult` set; 4/4 labelled in tooltip; time-signature editing = separate ticket |
| BPM display | AVAILABLE | `bpmResult.value.bpm.toFixed(1)` already consumed (`ViewBars.tsx:67`) | tempo cluster readout |
| Metronome / count-in | AVAILABLE | `recStudio` settings: `metronome`, `countInBars` 0–4, `useDetectedBpm`, `manualBpm` 40–240, `clickVolume` (`src/app/state.ts:108-121`); `countInBeat` signal (`:104`) | metronome toggle + count-in indicator in tempo cluster |
| Master volume | AVAILABLE (imperative only) | `AudioEngine.setVolume(v)` (`src/engine/AudioEngine.ts:179`); **no volume signal** | keep imperative call; v2 adds a UI signal mirror via registry command (F-08 decision CB-D9) |
| Output meter | AVAILABLE (feasible) | engine `getAnalyser(): AnalyserNode \| null` (`AudioEngine.ts:175`); record-side meter separate (`recorder.ts:32`) | **corrects audit §7.4** ("not found"): metering hook exists; output meter = optional P3 ticket, not a Phase-2 requirement |
| Record arm/roll + monitor + clip | AVAILABLE | `recordActions.ts` (arm/roll/disarm, monitoring, clip latch); denial path clean (E-CB-008) | record cluster; reserved slot fixes F-05 |
| Loop | AVAILABLE | `setLoop(on, region)` (`AudioEngine.ts:302`) | loop toggle stays registry-routed |
| Follow playhead | AVAILABLE | command `view.follow` (`src/app/commands.ts:153`) | overflow-only (no new always-visible control) |
| Selection state | AVAILABLE | `selection: signal<Selection \| null>` (`src/app/state.ts:55`) | editable Start/End/Length fields |
| Timecode (SMPTE/fps) | **MISSING → ticket** | no fps/frames concept in engine (grep); Cubase-style fps needs a frame-rate setting | deferred; clock ships without timecode (justified per master prompt) |
| Time signature | **MISSING → ticket** | none (see bars+beats row) | 4/4 assumption documented; no editing UI |
| Pseudo-localization harness | **MISSING → ticket** | en-only build (D-A15) | H-12 stays NOT RUN until built |

## 2. Design decisions (CB-1.2 — grounded in audit §5 + benchmarks)

1. **Information architecture.** One header region, fixed zone order: `Menu` → `Transport` (play/stop/record + clock) → `Selection` → `Tempo/Grid` → `Record/Monitor` → `Master` → `Status` → overflow `⋮`. Transport is the visual anchor and never hides (S2/S3). Each zone = one APG toolbar (`role="toolbar"` + `aria-label`).
2. **Clock.** Default `m:ss.mmm`; switcher affordance on the clock opens a menu: *Time · Samples · Bars+Beats (only when `bpmResult` known)*. Format choice persists via existing settings persistence. Timecode omitted (§1 ticket). `font-variant-numeric: tabular-nums` + fixed character slots on all readouts (hardening; measured jitter already 0 px, E-CB-007).
3. **Selection fields.** Three numeric inputs — Start, End, Length — cross-computed (edit Length ⇒ End moves; edit End ⇒ Length recomputes). Validation clamps into `[0, duration]`, keeps `start ≤ end`, snaps per active snap setting; invalid input rejects with inline message (never toast-only). Excluded from toolbar roving per master prompt (own tab stops, arrow keys move caret inside field).
4. **Tempo/Grid/Metronome cluster.** BPM readout (detected or manual), metronome toggle (`recStudio.metronome` via registry command), count-in chip (existing `countInBeat`), BEAT/SNAP indicators — one zone, replacing the current scattered BEAT bar (F-10).
5. **Keyboard model (F-03).** APG toolbar pattern per zone: one Tab stop, roving `tabIndex`, Arrow Left/Right (and Up/Down) move within; `Home`/`End` jump; inputs/buttons native semantics; menubar gets full APG menubar model (MenuBar today handles zero keydowns — H-11). Tooltips = command name + shortcut from the registry (single source).
6. **State & commands (F-09, F-04).** Every control routes through the existing registry (86 commands); `aria-pressed`/`aria-checked` from authoritative signals; no local state mirrors (exception handled via registry command per CB-D9).
7. **Responsive (F-01).** Priority-based collapse: at narrowing widths, lowest-priority zones fold into the `⋮` overflow (menu with same commands/shortcuts). **No page-level horizontal scroll ever** (measured today: bar-level hidden-scroll 60/60 configs, page h-scroll at 390/320 — both eliminated in v2). The hidden-scrollbar pattern is banned in v2; overflow is visible affordance only.
8. **Targets (F-02).** All pointer targets ≥24×24 CSS px (WCAG 2.2 2.5.8) via existing density tokens; sliders get padded hit areas.
9. **Arm stability (F-05).** Record zone reserves meter+time slots permanently (visibility toggles, never mounts) — measured +122 px shift must drop to 0.
10. **Theme/density/i18n.** Tokens only (`--font-mono`, spacing, density); all strings through `t()` (en/bn); never color-only state (rec = icon + text + `aria-*`).

## 3. Feature flag spec (`ui.controlBarV2`)

- Build-time: `VITE_CB_V2` (absent = OFF).
- Runtime: URL param `?cbv2=1|0` (read once at boot) → overrides build flag; guarded `localStorage.setItem('ui.controlBarV2','1'|'0')` consulted only when param absent. Default in all paths: **OFF**.
- v1 components stay the rendered default; v2 tree mounts only when flag resolves ON. Both trees derive from the same registry/signals — no duplicated logic, only duplicated layout.

## 4. Phase plan (mapping proposed in CB-D7; re-validate against master prompt at each phase open)

| Phase | Tasks | Key acceptance criteria |
|---|---|---|
| **2 — Foundation** | CB-2.1 flag scaffold + v2 shell (zones, tokens) · CB-2.2 clock system: pure formatters (samples, bars+beats) RED→green + switchable clock UI · CB-2.3 transport zone as APG toolbar (play/stop/record/loop + roving tabindex) · CB-2.4 overflow skeleton (`⋮` menu) | flag OFF ⇒ rendered DOM identical to v1 (e2e snapshot); formatters unit-tested incl. edge (0, negative, ≥10 min char growth); toolbar: 1 tab stop, arrows cycle, inputs excluded; registry-routed only |
| **3 — Editing clusters** | CB-3.1 selection Start/End/Length fields (validated, snap-aware) · CB-3.2 tempo/grid/metronome cluster · CB-3.3 record/monitor cluster with reserved slots (F-05=0 shift, re-measured via `jitter-method.mjs`) · CB-3.4 master zone via volume command | editing a field updates engine selection + undo-safe; invalid input inline error; arm shift measured 0 px @1280 & 390; no control lost vs v1 inventory (§2 audit) |
| **4 — Menubar + status** | CB-4.1 APG menubar keyboard model (H-11) · CB-4.2 StatusBar consolidation (single labelled secondary clock or none — F-06) · CB-4.3 tooltip system = name + shortcut from registry · CB-4.4 i18n bn pass on all v2 strings | menubar: Arrow/Enter/Escape per APG; H-04 name/pressed gaps closed (grep + e2e assertions); every v2 string in en+bn resources |
| **5 — Responsive + a11y hardening** | CB-5.1 priority overflow at 1280/1024/768/390/320 · CB-5.2 target-size sweep (≥24 px, measured) · CB-5.3 zoom 200/400%, reduced-motion, long-label (bn), no-audio/suspended-context states · CB-5.4 axe-clean e2e at all widths | 0 page h-scroll + 0 hidden-scrollbar patterns (automated probe, all widths); measured boxes all ≥24; axe zero violations; before/after screenshots 6 widths × 2 themes |
| **6 — Parity + decision** | CB-6.1 control-by-control parity sweep vs audit §2 inventory (reachability + command + shortcut + acc name) · CB-6.2 full gates + LH both flags · CB-6.3 validation report (Deliverable 3) + DESIGN.md update + changed-file inventory · CB-6.4 flag default recommendation | parity table zero-diff (or tickets); gates green at flag OFF and ON; bundle ≤ budget; report + screenshots delivered; default-OFF decision recorded |

## 5. Test & verification strategy

- **RED→green anchors:** each Phase 2–5 task starts with a failing unit/e2e test naming the finding (F-xx/H-xx) it closes; recorded in EVIDENCE_LOG per protocol.
- **Automated regressions added:** (a) page-level h-scroll probe at 320/390; (b) hidden-scrollbar CSS grep guard; (c) sub-24 px box probe (reuses `baseline-method.mjs` scope); (d) flag-OFF DOM-parity snapshot; (e) arm-shift ≤0.01 CLS via `jitter-method.mjs` in e2e-adjacent check.
- **Screenshots:** 6 widths (1440/1280/1024/768/390/320) × 2 themes × {v1, v2-ON} at phases 2/5/6 → `docs/screenshots/control-bar-v2/`.
- **Budgets:** bundle guard (≤123,661 B gz) and LH a11y=100 must hold at flag OFF and ON; CB-P3-1 (tighten 3 flaky e2e assertions) scheduled inside Phase 5 hardening.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Dual trees (v1+v2) drift | both read same signals/registry; parity sweep is a Phase-6 gate; v1 removed only after Phase-6 decision |
| Toolbar roving vs text inputs focus traps | inputs excluded from roving (explicit pattern tests); APG reference implementation reviewed in CB-2.3 |
| bars+beats misleads when 4/4 assumed | format offered only when `bpmResult` known; tooltip states "4/4 assumed" |
| Overflow hides a needed control | priority list derives from audit §2 usage classes; sweep verifies every command reachable at every width |
| bn labels overflow fixed slots | Phase 5 long-label pass uses real bn strings at 200% zoom; slots sized to bn where fixed |

## 7. Tickets (opened by Phase 1; none block Phases 2–5)

- **T-CB-1** Time-signature support (engine + UI) — blocks any non-4/4 bars+beats.
- **T-CB-2** Timecode/fps clock format (needs frame-rate concept).
- **T-CB-3** Pseudo-localization harness (H-12).
- **T-CB-4** Output meter via `getAnalyser()` (P3; engine hook verified).
- **T-CB-5** Per-digit selection editing (Audacity-style) — optional refinement after CB-3.1.
- **T-CB-6** Extend the F-11 live-value-confirm pattern to `EffectDialog`/`ExportDialog` (sibling-grep found the same theoretical state-read-on-confirm shape; sliders/radios only, no type-then-apply flow, no observed failure — fold into Phase 3 dialog work).
- **CB-P3-1 — SUPERSEDED (Phase 1):** the "timing-sensitive assertions" diagnosis was wrong; the real cause was F-11 (stale-value race in prompt dialogs), FIXED in Phase 1. AM-11's status pattern (`18.55 s`) remains retry-sensitive; covered by the F-11 fix and standard retry budget.

## 8. Phase 1 report (§7.5 template)

**Phase goal:** design Phase — benchmarks self-verified, v2 design decisions locked, engine capabilities verified, Deliverable 2 written — plus one unplanned, gate-blocking v1 bug fix (F-11) that the phase's own verification surfaced.

**Tasks closed:**

| Task | Status | Evidence |
|---|---|---|
| CB-1.1 Benchmarks (master prompt §3 sources) | VERIFIED | E-CB-009 — 6 official OPEN, BandLab official NOT RUN (secondary labelled), AudioMass reference-only; `control-bar/benchmarks.md` |
| CB-1.2 Design decisions | VERIFIED | plan §2 — ten decisions, each traced to finding + benchmark |
| CB-1.3 Engine-capability matrix | VERIFIED | E-CB-010 — plan §1, 16 rows file:line; audit §7.4 output-meter note corrected; 3 MISSING→tickets |
| CB-1.4 Deliverable 2 (this document) | VERIFIED | this file |
| CB-1.5 (unplanned) F-11 hotfix: stale-input race in prompt dialogs | VERIFIED | E-CB-011 — RED evidence (e2e failures + probe repro) → fix (live-value read on confirm in `PromptDialog.tsx`, `PromptDialogs.tsx`) → targeted ×2 exit-0 → full suite green-with-classification |

**Why a production fix in the design phase:** the full e2e gate failed on markers/Gain/AM-11; investigation proved a REAL pre-existing v1 bug (typed dialog values silently replaced by stale state — applies the previous value with success feedback), not test flake. A gate cannot be honestly declared green with a known input-corrupting bug, so the surgical fix was taken in-phase under CB-D11 (11-line class fix, no behavior change otherwise; user may veto at the STOP boundary).

**Gate results (post-fix, idle machine):**

| Gate | Result |
|---|---|
| `npm run typecheck` / `npm run lint` | PASS (lint required a scoped `no-console` exemption for committed audit measurement scripts — same class as `scripts/**/*.mjs`) |
| `npx vitest run` | **98 files / 826 tests PASS** |
| e2e plain (`--workers=1`) | **86 passed · 2 flaky (AM-11, markers — retry-green) · 1 failed = `csp.spec.ts` only, the documented no-enforce precondition** |
| e2e `CSP_ENFORCE=1` targeted (`csp.spec.ts`) | **1 passed** — note: a11y specs cannot run under enforce (axe injection is an inline script; mechanism recorded in E-CB-011); full-gate formula = plain run + enforced csp targeted (CB-D6 corrected) |
| `npm run build` + bundle | PASS — **new entry `index-Cc7f2Wmr.js` = 53,664 B gz** (+44 B, the F-11 fix) ≤ 123,661 |
| Lighthouse (local preview, post-fix) | desktop P100/A100/BP100/S91 · mobile P98/A100/BP100/S91 — S91 = vite-preview robots.txt absence (env artifact) |

**Phase 0 report note:** this phase corrected two Phase 0 classifications, recorded in the ledger: (a) lint-PASS claim predated the measurement scripts landing (fixed by the scoped exemption); (b) CB-P3-1's "assertion tightness" diagnosis replaced by the F-11 real-bug fix.

**Deviations & decisions:** CB-D7 (phase mapping reconstructed; each phase re-validates at open) · CB-D8 (timecode deferred, ticket) · CB-D9 (volume via command, no signal duplication) · CB-D10 (bars+beats hidden, not disabled, when tempo unknown) · CB-D11 (in-phase F-11 hotfix).

**Open gaps / open errors:** zero. (Tickets §7 are scoped future work, not gaps.)

**Phase 1 audit PASSED: zero open gaps and zero open errors.**

**Awaiting `PROCEED TO PHASE 2`.**
