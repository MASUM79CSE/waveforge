# PROGRAM SUMMARY — ui-redesign (clean-slate editor frame)

Branch `ui/clean-slate-layout` · base main `22b6aba` · flag `ui.cleanSlateLayout` **default OFF**.
Phases 0–6 all executed under the two-confirmation rule; every phase PCA-PASSED with zero open gaps at close.

## Delivered (flag ON — a complete, honest frame)

- **Z-shell (Option B, UX-D6):** menu bar · primary row (transport toolbar + position + selection fields) · secondary row (edit · tools/view · time-snapping · meters + ⚙ + ⋯) · graph · status. Zones Z1–Z9 per `phase1/IA.md`.
- **Toolbars:** 5 purpose-named groups, APG roving keyboard (one tab stop each; menubar roving after F-2 closure: 45→**27** real tab stops flag ON, 45→40 legacy), tooltips = registry label + only-real shortcuts, per-group visibility via the ONE registry (`view.toolbars.*`) + `view.layoutReset`, priority overflow (deterministic closed-loop planner, UX-D10).
- **Re-homing:** all 74 registry ids + addendum reachable in v2 — unit reachability gate + e2e execution walk (**100 executed / 102 entries, failed: []**), same commands, executed once.
- **Tier-A audio graph:** nice-interval ruler + new minor ticks; linear+dB vertical scale with the analytic anchors (1.0→0 dB, 0.5→−6.02, 0.1→−20, floor→center) shared by the DOM panel AND the painter (`core/dbScale.ts`, UX-D11); mip-map batched lanes (one Path2D fill/lane); separate overlay playhead (waveform repaints only on view paging).
- **States/a11y/i18n/responsive:** editable 4-format selection fields (Enter/Escape/aria-invalid; the keyboard path into the graph); canvas a11y summary; axe zero violations (loaded/welcome/390px); ≥24×24 targets (40 touch); bn catalog + the never-wired `setLocale` now wired; ≤480 wrap without page x-scroll; reduced-motion honored.

## Measured vs Phase 0 baseline (verbatim numbers)

| Metric | baseline `22b6aba` | final (flag OFF) | final (flag ON) |
|---|---|---|---|
| typecheck / lint | 0 / 0 | 0 / 0 | 0 / 0 |
| unit tests | 86 f / 720 t | **96 f / 792 t** | same |
| e2e | 59 passed | **77 passed** | same suites incl. frame2 |
| bundle (gz) | 120,084 | **130,389** (+10,305, +8.6% incl. post-program F-2) | same bytes |
| Lighthouse desktop | P100/A100/BP100/S91 | **identical** | (not the flag-OFF promise) |
| Lighthouse mobile | P99/A100/BP100/S91 | **P98**/A100/BP100/S91 | same |
| canvas fills / 5 s play | 764,362 | unchanged (re-measured 766,893) | **823 (−99.89%)** |
| real tab stops (legacy frame) | 45 | 40 (menubar roving) | — |
| real tab stops (loaded) | 45 | 45 | **32** |
| smallest target | 23×17 (F-4) | **≥24×24** (fixed both frames) | ≥24 (40 touch) |
| long tasks during play | 0 | 0 | 0 (1 LoAF 67 ms) |

## Test net (UX-6.1)

Deliberate-break experiment: 5 mutations — flag default, APG skip, single-surface loss
(passed *correctly*, capability still menu-reachable), full-surface loss (caught, named id),
dB anchor drift (caught) — every real regression caught, all reverted, suites green.
Methodology + verdicts in `INDEPENDENT-REVIEW.md` (independent diff review: no open defects).

## Findings ledger (all closed or ticketed)

F-1 phantom `view.center` Tab shortcut — fixed in v2 registry truth (menu-only until a real
binding is approved) · F-2 menubar APG — menubar keyboard deferred (see tickets) · F-3
keyboard-path gaps — documented, unchanged · F-4 CLOSED · F-5 tab stops — 45→27 flag ON, 45→40 legacy · F-6 CLOSED (catalog + wiring) · F-7 CLOSED (both frames) ·
**F-2 CLOSED post-program** (menubar APG keyboard, shared component — see UX-D13; bundle now 130,389 gz).

## Rollout recommendation (decision requested)

1. **Ship as opt-in preview now** (this is the current state): flag default OFF, `?ui2=1`
   opt-in. Risk to existing users: zero (LH/e2e/legacy parity proven). This step needs no
   further approval beyond merging the branch.
2. **Flip default ON** only after: (a) a beta window with the flag announced in-app or in
   release notes, (b) no P0/P1 issues from real usage, (c) mobile perf re-checked. Flip =
   one-line change + default-ON e2e matrix (already written). Rollback story: `?ui2=0` or
   removing the localStorage key — no deploy needed for per-user escape.
3. **Retire the legacy frame** (`APPROVE REMOVE LEGACY UI`, A-5): recommend ONLY after the
   default flip has settled ≥1 release cycle. Removal would also recover most of the
   +9.5 KB bundle (mobile P98 → likely P99+).

**Awaiting:** merge decision for the opt-in preview; later, the flip and removal tokens.
Not requesting Tier B now: RMS/spectrogram remain ticketed (the literal approval token
`APPROVE TIER B: RMS` still stands available).

## Post-program closure (F-2 ticket)

Menubar APG keyboard shipped as a SHARED `MenuBar` fix (UX-D13): role=menubar,
roving titles, arrows switch/open menus (APG hover-switch equivalent), in-menu
Up/Down/Home/End + typeahead, Enter/Space activates and returns focus to the
menubar, Escape closes + restores title focus, axe-clean with a menu open.
Full e2e re-run: **78 passed (2.8m)** incl. a new menubar-keyboard e2e; LH
unchanged (D P100/A100/BP100/S91, M P98); bundle 130,389 gz (+770 for the
menubar work).

## Carry-over tickets

- RMS overlay (Tier B, approved-token-gated) · spectrogram (engine FFT scope).
- `view.center` real keyboard binding (needs a binding decision).
- Mobile Lighthouse P98→P99 recovery rides on legacy retirement.
