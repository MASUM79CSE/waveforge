# Design-Parity Plan — "AudioMass skin, WaveForge bones, then advance" (v1.0)

**Sequel to:** `design-analysis-audiomass.md` · **Baseline:** `a1157f8`
**Sequence (ECC):** analysis ✅ → this plan → gated build, one D-phase at a
time; every phase ends green (unit+coverage, e2e, build, lint) and commits
in conventional style before the next opens.

## Ground rules (all phases)

- Tokens are the only place colors/radii/motion live (`tokens.css`); the
  WaveForge token **names** stay stable so components don't churn.
- Canvas painters read colors from a shared module sourced from the token
  values (no magic hex in components beyond `waveDraw`/`doctor` theming).
- Behavior changes ship with RED-first tests; pure restyles ship with
  screenshot evidence + the standing gates.
- Files ≤400 lines; new components follow the Modal a11y pattern (focus
  trap, labels).

## D1 — Token system convergence (restyle, no behavior)

- Map `tokens.css` onto the AudioMass ladder: bg-0..4, fg-0..3 (fg body
  kept ≥4.5:1 — documented deviation), accent `#5af2ff` + `-soft/-glow/
  -ink/-2`, `--rec #ff3355`, `--solo #28c8f0`, `--warn`, `--ok #6ecc87`,
  `--playhead #ff8c35`, border trio (incl. accent hover), radii 2/4/8,
  spacing `--s1..s4`, motion `--tr 160ms cubic-bezier(.2,.7,.3,1)`,
  glow + inset-hi shadows. Panel groups adopt the 46px gradient anatomy.
- Update `app.css` consumers to the spacing/motion tokens where they
  hard-code values (menus, buttons, toasts, dialogs).
- **Gates:** build, lint, unit, e2e (all standing), contrast script ≥4.5:1
  for `--text/-dim/-faint` on their real backgrounds, before/after
  screenshots (`docs/design/`).
- **Commit:** `feat(d1): audiomass design-token convergence`.

## D2 — Icon toolbar (behavioral, TDD)

- `src/app/components/icons.tsx` — inline SVG path library (16–18 icons:
  cut, copy, paste, insert-silence, trim, gain, fade-in, fade-out,
  normalize, reverse, invert, remove-silence, zoom-in, zoom-out,
  zoom-reset, record, mute).
- `src/app/toolbarDefs.ts` — ordered groups; each def: `id, icon, command,
  labelKey, disabledWithoutDoc`. Every `command` MUST exist in the command
  registry (unit test enforces; registry is the single source of truth).
- `ToolBar.tsx` — renders groups with separators, `title` tooltip with
  shortcut hint (from `kbdHints`), `aria-label`, disabled state wired to
  `docInfo`, active state where applicable; `runCommand(id)` on click.
- Insert between MenuBar and Transport in `App.tsx`; toolbar CSS with the
  D1 group anatomy + hover glow.
- **Tests (RED first):** unit — defs→commands resolve, icons non-empty,
  order stable; e2e — click Cut icon → toast "Cut"; click Undo icon after
  an edit → restored. 
- **Commit:** `feat(d2): icon toolbar wired to the command registry`.

## D3 — Selection readout group (behavioral, TDD)

- Dedicated 46px group in the control row: `Start / End / Duration`
  (mono, s + sample-frame exact) + **Clear** button (`edit.deselect`, Q)
  — display values from the existing `selection` signal.
- **Tests:** unit — formatting from signal states (none/selected);
  e2e — drag a selection → readout non-empty → Clear empties it.
- **Commit:** `feat(d3): selection readout group with clear (Q)`.

## D4 — Canvas skin + dB scale (restyle + small painter work)

- `waveDraw.ts` THEME → AudioMass canvas palette: wave `#9dff6a`
  (disabled/muted variant), center line, selection accent-soft + accent
  borders, playhead `#ff8c35`, ruler labels `#d9d955` on black strip,
  lane bg from bg-0, peak separators (`#365457` family) at zoomed-in spp.
- Bottom **dB amplitude axis** (canvas-drawn, -Inf..0, matching the
  reference screenshot) + L/R channel labels on the left rail, with a
  View-menu toggle (default on), AudioMass "Timeline ✔"-style.
- **Tests:** existing anchors prove geometry unchanged; add View-toggle
  e2e (state persists via viewState signals).
- **Commit:** `feat(d4): canvas skin + dB scale column`.

## D5 — Zoom bar + beat/snap row (behavioral, TDD)

- Bottom-left zoom group: horiz +/− (+=zoom factor already in renderer),
  reset (0), **vertical ±** — new `vzoom` view-state lane-height scale
  (pure module + unit tests, clamped 0.5×..3×, renderer consumes).
- Control-row **BEAT/SNAP group**: toggle beat markers (renderer already
  has `setBeats`), snap-to-beat toggle (engine `snapEdgeToBeat` at edit
  edges), BPM readout from the analyser, time-signature select (4/4, 3/4).
- **Tests:** unit — vzoom math + snap toggle wiring; e2e — click zoom-in
  → status `×N` changes; beat toggle → canvas class/state flips.
- **Commit:** `feat(d5): zoom bar, vertical zoom, beat/snap row`.

## D6 — Dialog/overlay restyle + shortcuts overlay (restyle + small behavior)

- Welcome modal → AudioMass anatomy (logo, tips incl. Shift-key note, OK),
  progress modal polish (percent + cancel), toasts/menus with motion
  tokens; full-window drag-n-drop overlay.
- **Help → Keyboard Shortcuts** overlay: generated from `shortcuts.ts` +
  legacy shift-letters table (AudioMass-parity discoverability; also an
  a11y win).
- **Commit:** `feat(d6): dialog/overlay restyle + shortcuts overlay`.

## D7 — Hardening & release of the skin

- Full gates; Lighthouse re-run (≥95/95/100/100 must hold with new colors);
  screenshot set refreshed; task_list + tech_doc synced; docs commit.
- **Backlog (post-D7, "more advanced"):** per-channel pan + strips (G13,
  needs engine pan node), custom rich tooltips (G12), light-theme token
  variant, user-selectable accent.

## Risk register

| Risk | Mitigation |
|---|---|
| Teal→cyan re-skin breaks brand recognition | brand.ts/logo unchanged; accent used for state, not identity |
| Contrast regression from AM's dim grays | AA rule enforced by script in D1 gates |
| Canvas color change hides selection for color-blind users | borders + glow, not fill alone; contrast-checked pair (#9dff6a on #07080a) |
| Toolbar duplicates menu commands → drift | defs reference the registry; unit test fails on unknown id |
| Vertical zoom touches renderer geometry | pure `viewState` math first, anchors, then painter |

**Order is fixed:** D1 (tokens) → D2 (toolbar) → D3 (readout) → D4 → D5 →
D6 → D7. Each phase independently shippable; stop-anytime leaves a
consistent skin.
