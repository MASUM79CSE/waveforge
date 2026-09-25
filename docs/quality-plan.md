# X-series — quality/hardening build plan

**Date:** 2026-09-25 · **Extends:** `docs/quality-analysis.md` (axe audit) ·
Modal base unchanged (already correct).

## X1 — control naming fixes (all findings)

- `ParamRow` (shared): the numeric co-input gets `aria-label={label}` — one
  fix covers EffectDialog, Stretch/Pitch, NrPrint, Pgeq8, Reverb2 … every
  dialog built on the row.
- EffectDialog quick-preset select → `aria-label={t().fxPreset}`.
- Rack: presets select → `rackPresets`, add select → `rackAdd`, preset-name
  input → `rackPresetName`, row buttons → `rackMoveUp` / `rackMoveDown` /
  `rackRemove` (new i18n keys; visible glyphs unchanged).
- No behavior/visual changes — naming only.

## X2 — the permanent gate (43rd e2e)

`tests/e2e/a11y.spec.ts`: axe-core (wcag2a + wcag2aa) over the REAL app:
1. main editor page after sample load,
2. welcome dialog open,
3. Compressor effect dialog open (ParamRow + quick-preset paths),
4. FX Rack with a Tremolo entry added and expanded (rack rows, envelope
   editor canvas, bypass controls live).

**Gate: zero violations of any impact** in every scenario (we are at zero
after X1 — keep it that way). devDep pin: axe-core 4.13.0 (MPL-2.0 — dev-
only, not shipped; THIRD_PARTY_NOTICES unaffected).

## X3 — close

Full suite + lint + tsc + build; Lighthouse re-run (a11y must hold 100);
doc stamps (task_list dated X-series entry).

## Non-goals

Keyboard envelope-canvas editing (pointer + ARIA label today; arrow-key
point editing is a future enhancement, noted in the plan seam); visual
redesign; shortcuts changes (single source untouched this series).
