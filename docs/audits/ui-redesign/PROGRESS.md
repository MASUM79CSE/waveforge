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

Phase-1 exit: own PCA + user approval of (a) layout option, (b) Tier B decision, then literal
`PROCEED TO PHASE 2`.
