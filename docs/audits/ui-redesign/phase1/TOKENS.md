# Design tokens spec — Phase 1 (UX-1.2)

Base: `src/app/styles/tokens.css` @ `22b6aba` (131 custom props, light+dark themes already
re-mapped). Clean-slate applies to ARRANGEMENT — the design system is extended, not
discarded. v2 consumes the SAME custom-property vocabulary behind the flag; no new deps,
no CDN fonts (bn fallback stack verified in Phase 2).

## 1. Inherited unchanged (roles)
- Surfaces/ink: `--bg-0..4`, `--fg-0..3`, `--panel`, `--panel-raised`, `--line`, `--canvas-bg`.
- Accent system: `--ac`, `--ac-2`, `--ac-soft`, `--ac-glow`, `--ac-ink`, `--accent`,
  `--accent-dim`, `--accent-line`.
- Semantic: `--rec`, `--rec-glow`, `--solo`, `--solo-glow`, `--warn`, `--ok`, `--danger`,
  `--playhead`.
- Borders/radii: `--bd`, `--bd-s`, `--bd-h`, `--r`, `--r-sm`(as --r-* set), `--r-md`, `--r-lg`.
- Type: `--ff`, `--ff-mono` (+ bn fallback appended in Phase 2 — no values changed here).
- Canvas graph: `--cv-*` set (lane, wave, ruler, playhead, selection, clip, automation, beat)
  — Phase 4 consumes these for the redraw; values may be re-tuned then with screenshots.

## 2. New tokens (additive; values finalized at Phase-2 implementation with screenshots)
| token | role | policy |
|---|---|---|
| `--target-min` | WCAG 2.5.8 floor | 24px; used by a Phase-5 DOM audit test (no reliance on spacing exception) |
| `--target-touch` | touch hit area | 40px (hit-area padding; visual glyph stays 16–20) |
| `--focus-width` / `--focus-offset` | visible focus | 2px / 2px; ring color `var(--ac)` in both themes, ≥3:1 against adjacent surface; verified in light+dark screenshots |
| `--band-h` | command band height (Z2/Z3) | 44px desktop (fits 40px touch); compact breakpoint keeps 40px |
| `--ruler-h` | Z4 height | 28px |
| `--z-menu` … `--z-overlay` | z ladder for Z1–Z9 | menu 30 · command 32 · ruler 30 · overlay 60–80; no magic numbers in components |
| `--tooltip-bg/-fg/-r/-shadow` | tooltip surface | open on focus+hover, Esc-dismissible (INTERACTIONS.md §4) |
| `--tr-fast` | micro-motion | ≤120ms, `--ease`; `@media (prefers-reduced-motion: reduce)` → 0ms globally |

## 3. Rules (normative for review)
- No fixed px widths on labels/buttons that carry i18n text; bands size to content with
  overflow policy (INTERACTIONS.md §6). bn +40% length must not clip (Phase-5 test).
- One registry of shortcuts drives tooltips AND help dialog — no hand-maintained lists.
- Spacing uses `--s1..s4` only inside bands (no ad-hoc px except hairlines/1px alignment).
- Both themes must pass: focus-visible ≥3:1, text ≥4.5:1 (existing palette already does —
  LH A100 baseline; re-verified per phase with screenshots).
- Tokens are the ONLY styling contract new components may use; no component-local colors.
