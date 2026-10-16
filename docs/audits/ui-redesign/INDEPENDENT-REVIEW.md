# Independent review — ui-redesign program (Phase 6, UX-6.x)

Reviewer stance: fresh-eyes pass over the full program diff (`main..HEAD`,
140 files), with explicit adversarial criteria. Not the author-of-the-phase
mindset: every shared-file edit treated as guilty until proven flag-neutral.

## 1. Scope of production changes (non-test, non-docs)

Additive modules (flag-ON only by construction — never imported by legacy):
`src/app/frame2/*` (12 files), `src/core/{timeParse,wavePath,dbScale}.ts`,
`src/i18n/bn.ts`. Tests: `tests/unit/frame2*` (6 files), `timeParse`,
`tests/e2e/frame2*` (4 files).

**Shared production files touched (the risk surface) — verdicts:**

| File | Change | Flag-OFF behavior | Verdict |
|---|---|---|---|
| `src/app/components/App.tsx` | early-return `<Frame2/>` when flag ON | branch never taken; legacy JSX byte-identical | OK |
| `src/app/styles/tokens.css` | +8 custom props (z/target/focus) | consumed only by frame2 selectors | OK |
| `src/app/main.tsx` | `setLocale(waveforge.locale)` at bootstrap | **intentional shared fix (F-6)** — see §2 | OK (documented) |
| `src/app/keyboard.ts` | Escape stack + draftSave/drafts/metadata | **intentional shared fix (F-7)** — see §2 | OK (documented) |
| `src/app/components/Toasts.tsx` | +aria-label on close | additive attr; legacy a11y improvement (F-4) | OK |
| `src/app/styles/app.css` | +`.toast-close` min 24×24 | shared fix (F-4), both frames | OK |
| `src/app/tooltips.ts` | +Escape dismissal listener | §9 contract, both frames | OK |
| `src/app/commands.ts` | +8 addendum ids (frame2 visibility) | unreferenced by legacy UI; `runCommand` paths only fire from frame2 surfaces | OK |
| `src/app/menus.ts` | +`menuEntries()` helper | read-only helper; menu defs untouched | OK |
| `src/app/components/TransportBar.tsx` | `ChannelStrip` exported | no behavior change | OK |
| `src/engine/waveDraw.ts` | +3 ctx options, all default-undefined | `overlayPlayhead/batchedLanes/minorTicks/dbScale` falsy → legacy paint path identical (re-measured: 766,893 fillRect ≈ baseline) | OK |
| `src/engine/WaveRenderer.ts` | +4 default-false fields; `followCursor` now returns boolean | call sites ignore the return in legacy paths | OK |
| `src/app/runtime.ts` | cursor loop honors `overlayPlayhead` | flag OFF → `overlayPlayhead=false` → `requestDraw()` every tick, byte-identical legacy behavior | OK |
| `src/core/zoom.ts` | +`minorTickStep/minorTicks` | additive pure functions | OK |
| `src/i18n/index.ts` | bn partial catalog merge | en default unchanged; bn previously fell back to en anyway | OK |
| `src/i18n/en.ts` | +12 keys (frame2 surfaces) | additive | OK |

## 2. Honesty declaration — where flag-OFF differs from baseline

Three **app-level defect fixes** apply to BOTH frames by design (each was a
registered finding with repro on legacy):

1. **F-4** toast close target 23×17 → ≥24×24 (WCAG 2.5.8).
2. **F-7** SaveDraft/Drafts/Metadata dialogs now Escape-closable (legacy
   ignored Escape on them — verified identical pre-fix on legacy).
3. **F-6** `waveforge.locale` was documented but never read; bn locale now
   activates (bn previously silently fell back to English).

Everything else flag-OFF is behaviorally identical: legacy e2e suite (59
tests) green unmodified (one g13 scope amendment documented in UX-D9),
Lighthouse identical (D P100/A100/BP100/S91), legacy redraw cost unchanged.

## 3. Grep sweeps (final tree)

- `console.log|debugger|MUTATION|f2dbg` in `src/`: only pre-existing hits
  (vendored rnnoise bundle, core logger, legacy test profiling logs). No
  program leftovers. ✓
- Probe scripts lint-clean; no stray files at repo root. ✓
- All new source files ≤400 lines (largest: `Graph.tsx` ~230). ✓

## 4. Deliberate-break experiment (test-net proof, UX-6.1)

| Mutation | Invariant attacked | Caught by |
|---|---|---|
| M1 flag defaults ON | flag-OFF isolation | frame2Flag unit (2 fail) |
| M2 roving stops skipping disabled | APG keyboard contract | frame2Roving unit (1 fail) |
| M3 `view.zoomIn` loses toolbar surface only | re-homing placement | passes **correctly** — menu still covers the capability (net guards capability reachability, not per-surface placement) |
| M3b `view.zoomIn` loses ALL v2 surfaces | nothing-lost guarantee | frame2Reach unit (2 fail, names the id) |
| M4 dB anchor drift (floor×2) | scale truth (panel+painter share the mapping) | frame2Scale unit (2 fail) |

All reverted; full suites re-run green (96 f / 792 t unit, 77 e2e).

## 5. Findings raised by this review

- **R-1 (minor):** the ad-hoc tab-stop probe initially mis-counted
  (counted `tabindex=-1` buttons). Corrected methodology: legacy **45** real
  tab stops → frame2 **32** (three roving toolbars = 3 stops; +11 from new
  capabilities: selection fields, overflow menus, gear, metronome).
- **R-2 (info):** mobile Lighthouse P99→P98 (+9.5 KB bundle) — accepted with
  numbers; revisit if the flag ships default-ON (tree-shaking legacy frame
  would recover most of it, but that is a post-removal step needing A-5
  approval).

**Review verdict: no open defects. The flag boundary is clean; shared-file
edits are three documented, e2e-asserted defect fixes.**
