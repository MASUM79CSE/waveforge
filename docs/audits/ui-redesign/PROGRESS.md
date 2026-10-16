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

Phases: 0 PASSED · 1 PASSED · **2 complete pending PCA** · 3..6 pending
(two-confirmation stop; awaiting own PCA then literal `PROCEED TO PHASE 3`).
