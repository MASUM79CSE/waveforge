# X-series — accessibility & interaction audit (analysis)

**Date:** 2026-09-25 · **Method:** axe-core 4.13.0 (MPL-2.0, devDep) run in the
real app via Playwright against the shipped build — `wcag2a` + `wcag2aa` rule
sets, whole-document scope. LH a11y has been 100 since D-series; this audit
is deliberately STRICTER (full axe, interactive states with dialogs open).

## Findings (evidence, probe run 2026-09-25)

| Scope | Rule | Impact | Finding |
| --- | --- | --- | --- |
| EffectDialog + Rack (`ParamRow`) | `label` | critical | The numeric co-input (`.fx-num`) has no accessible name — the row `<label for>` points only at the range slider |
| EffectDialog | `select-name` | critical | Quick-preset `<select>` unnamed |
| Rack | `select-name` | critical | Presets select + Add select unnamed |
| Rack | (best-practice) | — | ↑/↓/✕ row buttons have accessible names (arrow glyphs) but meaningless ones for screen readers |
| Main editor page (sample loaded) | — | — | **Zero violations** |
| Welcome dialog | — | — | **Zero violations** |
| Modal base | — | — | Already correct: `role="dialog"` + `aria-modal` + initial focus + Tab trap + focus restore (pre-existing) |

## Report

The C-series dialogs shipped with real WCAG A/AA failures — all of the same
class (control naming), all introduced by the new UI, none pre-existing.
Nothing structural: no traps, no focus loss, no contrast failures, no
landmark issues anywhere else in the app.

## Plan (docs/quality-plan.md)

Fix every finding at the component level (labels travel with `ParamRow`,
so one fix covers every effect dialog), add aria-labels with i18n keys for
the rack controls, and promote the audit into a permanent suite gate:
**43rd e2e = axe zero-violation across main page + welcome + a live effect
dialog + a populated rack** (fails the suite if any future dialog work
regresses naming).
