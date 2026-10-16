# AUDIT — ui-redesign, Phase 0 (recon / inventory / baseline)

Program: clean-slate redesign of the WaveForge editor frame (UI/UX only)
Branch: `ui/clean-slate-layout` (created from main `22b6aba`)
Date: 2026-10-16 · Protocol: master prompt §10 (A–I per task; two-confirmation stop)

**Capability check (§10.0):** DONE. Can do: repo access, shell, Playwright (chromium) incl.
fake-media recording, Lighthouse via `vite preview`, network fetches + live-site screenshots.
Cannot do (NOT RUN): OS-level screen-reader audit (no NVDA/VoiceOver in sandbox) — axe-core
+ manual ARIA verification substitute; real mobile/touch devices — responsive emulation only.
These limits apply to every phase of this program.

**Assumptions relied on (per prompt):** A-1 arrangement/styling free, capabilities re-homed
not removed · A-2 no removal without literal `APPROVE REMOVAL` · A-3 engine/DSP/workers/
document/undo/persistence/export out of scope · A-4 audio graph Tier A in scope, Tier B only
on `APPROVE TIER B` · A-5 legacy UI removed only after `APPROVE REMOVE LEGACY UI`.

---

## UX-0.1 Recon — VERIFIED

Full recon of main `22b6aba` recorded in session notes and reflected in
`CAPABILITY_INVENTORY.md`. Highlights:

- `src/app/components/`: TransportBar (328 L; testids transport-play/pause/stop/seek-back/
  seek-fwd, record-toggle, monitor-toggle, punch-button, clip-led, count-in), MenuBar (156 L,
  no APG keyboard), ToolBar (46 L), ViewBars (95 L), SelectionBar (42 L), StatusBar (36 L),
  TrackLanes (183 L), CanvasPane (93 L), Dialogs.tsx mount + 14 *Dialog* components, icons.tsx.
- State/logic: `state.ts` (295), `commands.ts` (242; **74 ids**), `menus.ts` (6 menus, verified
  full item structure), `keyboard.ts` (Space/arrows/Home/End/l/+−/0/q/~), `shortcuts.ts`
  (resolveShortcut: plain r/p/m; Ctrl z/y/x/c/v/a/o/d/s; plain s/x/a/del/backspace; Shift
  z/y/x/c/v/a/n/s), `runtime.ts` (252; PeakClient :51, setDocument :74, setSelection :219).
- Engine (OUT of scope per A-3): `src/engine/` AudioDocument, AudioEditor, AudioEngine,
  WaveRenderer, analysisReport, automation, bpm, clipAssets, clipPlayback, clips, editOps,
  history.
- Styles: tokens.css (181), app.css (1996), base.css (43). i18n: en.ts (476) + bn.
- CI: typecheck / lint / test:coverage / build + e2e job; Playwright projects
  chromium-fake-media + chromium-preview.
- **main has no `scripts/check-bundle.mjs`** (that was control-bar tooling on another branch) —
  bundle measured via `gzip -c dist/assets/index-*.js | wc -c`.

## UX-0.2 Baseline gates on untouched main `22b6aba` — VERIFIED

| Gate | Command | Result |
|---|---|---|
| typecheck | `tsc --noEmit` | 0 errors |
| lint | `eslint .` | 0 errors |
| unit | `vitest run` | **86 files / 720 tests PASS** (~169 s) |
| e2e | `playwright test` (CHROME_PATH + pw-libs, `--workers=1`) | **59 passed / 0 flaky** (~2 min) |
| build | `tsc && vite build` | PASS; `index-ajTvOWzM.js` **120,084 B gz / 388,669 B raw** |
| Lighthouse desktop | preview :4179, LH | **P100 / A100 / BP100 / S91** |
| Lighthouse mobile | preview :4179, LH | **P99 / A100 / BP100 / S91** |

All six gates green → baseline accepted as the comparison anchor for Phases 1–6.

## UX-0.3 Probe + measurement harness — VERIFIED

- `phase0-probe.mjs`: 6 states (no-audio, loaded-stopped, playing, recording, selection,
  multitrack) × 6 widths (1440/1280/1024/768/390/320) × 2 themes = 72 screenshots in
  `docs/screenshots/ui-redesign/phase0/`; metrics in `baseline/probe-metrics.json`.
  States produced for real (welcome-dialog Load-sample fixture per UX-D2; recording via
  fake-media; bn locale + themes via localStorage). Spot-verified by viewing
  `playing-1280-light.png` (transport cluster + playhead + dB strip) and
  `multitrack-1440-dark.png` (SELECTION/BEAT GRID/RECORD/MASTER sections, clip lanes, toasts).
- **Findings from probe metrics (`baseline/probe-metrics.json`):**
  - smallest target **23×17 px** (toast-close) → below WCAG 2.5.8 (finding F-4);
  - **39 tab stops** (baseline a11y counter for the §9 APG collapse);
  - playback window (5 s): 0 long tasks, CLS 0, 351 frames, median 16.7 ms / P95 16.8 ms.
- `redraw-probe.mjs` (waveform redraw cost, 5 s playback, 1280×800 light):
  **605 rAF; canvas calls fillRect 764,362 / beginPath 302 / clearRect 0 / drawImage 0;
  long-animation-frames 1 (worst 53 ms, blocking 3 ms)** → `baseline/redraw-metrics.json`.
  Same probe re-runs in Phase 6 for before/after (WaveRenderer fillRect-per-column approach is
  the optimization target for Phase 4's mip-map waveform).
- Probe bug fixed this phase: welcome-dismiss click consumed the dialog before the
  Load-sample click → now no-audio is shot on a first page load, then `page.reload()`
  restores the welcome for the loaded-state sequence (verified by full-matrix run).

## UX-0.4 Capability inventory — VERIFIED

`CAPABILITY_INVENTORY.md` (committed in this phase): 74 registry ids with menu membership,
keyboard surfaces, and gap findings F-1…F-5 (phantom `view.center` Tab shortcut; MenuBar no
APG keys; 40+ ids without keyboard paths; 23×17 toast target; 39 tab stops). Also: 30 static
testids + 7 dynamic patterns; 15 dialog components; non-registry capabilities (welcome flow,
track headers, canvas interactions, i18n/themes, banners, beat grid, record-arm flow).

## UX-0.5 Benchmarks / clean-room observation — VERIFIED (with explicit NOT RUN rows)

All fetches logged with takeaways in `CLEAN_ROOM_LOG.md` rows 1–9:
- APG toolbar pattern (full), WCAG 2.5.8 understanding doc (chunk 1) — normative contracts.
- Audacity manual `toolbars_overview.html` (full), new `audacityteam.org/manual/toolbar/`
  (full, Sept 2026 manual), `project-toolbar/` (via live search snippet) — dock/group taxonomy.
- Wavacity live app observed via headless Chromium (screenshot kept outside repo) — IA concepts.
- NOT RUN rows kept honest: alphamanual Project_Window (401), old manual project_window (404,
  superseded), BandLab (carried NOT RUN from cb2 program S6).
- No benchmark source code, icons, or strings copied; no third-party assets committed.

## UX-0.6 Phase report + stop — THIS DOCUMENT

Exit proof: `git diff --stat main..HEAD` contains ONLY `docs/audits/ui-redesign/**`,
`docs/screenshots/ui-redesign/phase0/**` — **zero production file changes** (src/, e2e/,
package.json untouched). `phase0-probe.mjs` / `redraw-probe.mjs` live under docs/ and are
lint-clean (`eslint docs/audits/ui-redesign/*.mjs` → 0 problems).

## Evidence log (claims → artifacts)

| Claim | Artifact |
|---|---|
| Gates on base | this doc §UX-0.2; numbers recorded in EVIDENCE_LOG.md entries UX-0.2-a…f |
| 72 state screenshots | `docs/screenshots/ui-redesign/phase0/*.png` |
| Probe metrics | `docs/audits/ui-redesign/baseline/probe-metrics.json` |
| Redraw cost | `docs/audits/ui-redesign/baseline/redraw-metrics.json` |
| 74 ids + menus + testids | `docs/audits/ui-redesign/CAPABILITY_INVENTORY.md` |
| Clean-room fetches | `docs/audits/ui-redesign/CLEAN_ROOM_LOG.md` rows 1–9 |
| Decisions | `docs/audits/ui-redesign/DECISIONS.md` UX-D1…D3 |
| Commit SHAs | EVIDENCE_LOG.md (filled at commit time) |

## H sweep (gap & error pass) — result

- Acceptance evidence: every UX-0.x task above has an artifact; no `??` placeholders remain.
- Adversarial pass: probe re-run until state matrix fully green; PNG count 72 = 6×6×2 exact.
- Sibling search: probe scripts linted (eslint lints docs/ — fixed no-console + unused var);
  no other stray files added (wavacity screenshot intentionally outside repo).
- Full suites vs baseline: this IS the baseline phase (numbers above are the anchor).
- Consistency: PROGRESS.md statuses set to match reality (all six tasks VERIFIED with
  artifacts); DECISIONS.md has D1–D3.
- **Open gaps: none.** NOT RUN items (screen reader, real devices, BandLab S6) are declared
  capability limits, not gaps in executed work.

## Status

Phase 0 COMPLETE pending PCA. **Stopping per two-confirmation rule: awaiting own PCA PASS +
user's literal `PROCEED TO PHASE 1`.** Phase 1 will produce the IA + design spec with three
layout options (A classic / B unified two-row / C hybrid dockable) and STOP for option +
tier approval.
