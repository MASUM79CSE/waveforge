# Interaction spec — Phase 1 (UX-1.5)

Normative behaviors for v2, implemented Phases 2–5. Sources: master prompt §9
(non-negotiables), CLEAN_ROOM_LOG rows 2–3 (APG toolbar, WCAG 2.5.8), cb2 benchmark lessons
S2–S5 (formats only — no expression copied).

## 1. Selection / position fields (prescribed parser)

Four display formats, one active at a time (switcher in the time-selection band; position
readout follows the same format):

| mode | shape | example input | parse rule |
|---|---|---|---|
| S (seconds) | `83.456` | `83.456` | decimal seconds; ≥0 |
| MS (default, today's `fmtClock`) | `1:23.456` | `1:23.456` | `m:ss.mmm` — min:sec.milli |
| HMS | `h:mm:ss.mmm` | `1:02:03.456` | `h:mm:ss.mmm` — two colons |
| SMP (samples) | `123456` | `4096` | integer sample index at document rate |

Parse rules (all modes):
- Freestyle typing accepted; parse on **Enter**. Enter commits, **Escape reverts** to the
  last committed value and exits edit mode (focus stays on the field).
- Bare decimals (`83.456`) are valid in every TIME mode (interpreted as seconds of that
  mode's unit scheme: S → s; MS/HMS → seconds too, colons optional). In SMP only integers.
- Invalid text (e.g. `garbage`, `1:99` in HMS mode is VALID (99 s ≥ 60 allowed? NO —
  minute fields clamp/validate: minutes 0–59 in HMS mode, seconds 0–59 in HMS/MS with
  carry-free validation; `1:99` in MS = invalid) → `aria-invalid=true`, red field token,
  tooltip-ish inline message (i18n), Enter does NOT commit, value stays editable.
- Ranges: committed values clamp to `[0, docDuration]`; End ≥ Start enforced — committing
  End < Start swaps or rejects (reject + message; no silent swap).
- Duration field is derived: editing it moves End (Start fixed); display `—` when no
  selection.
- Commit path: `selection.set` (registry addendum) → same state signal the canvas drag
  writes → one code path, re-homing-testable.
- Empty field + Enter = clear that edge (equivalent to edit.deselect when all empty).
- Optional (Phase 5 if time allows): ↑/↓ nudge smallest unit when field not being typed in.

Fields are OUTSIDE any `role=toolbar` (arrow keys type/navigate text); each field is one
tab stop with visible label (Start / End / Duration, en/bn).

## 2. Menu bar keyboard (APG menubar pattern — fixes F-2)
- ←/→ move among the 6 top-level menus; Enter/Space/↓ opens focused menu; ↑/↓ move items;
  Home/End first/last item; typeahead by label; Esc closes (focus returns to menubar
  button); Tab leaves the menu system closing any open menu; `aria-expanded` on triggers;
  group headers are non-focusable separators; disabled items focusable + `aria-disabled`.

## 3. Toolbars (APG toolbar — restates IA.md §2, normative)
- One tab stop per toolbar; ←/→ rove (wrap allowed); ↓/↑ reserved for controls that need
  them — such controls are excluded by construction (sliders/fields live in non-toolbar
  groups per IA.md); toggle buttons `aria-pressed`; disabled focusable + `aria-disabled`.
- Focus visible in both themes (TOKENS.md focus token), never `outline: none` without
  replacement.

## 4. Tooltips (§9 contract)
- Content: `Name (Shortcut)` — only real, working shortcuts (F-1 rule: never advertise a
  phantom). No shortcut → name only.
- Open on hover AND keyboard focus; dismiss on blur/leave AND **Escape**; i18n'd; never the
  only way to learn a shortcut (help.shortcuts dialog lists all, generated from the ONE
  registry — no hand-maintained duplicate).

## 5. Canvas accessibility (§9 — canvas never the only way)
- Visually-hidden summary region (aria-live=off, updated on document/selection change):
  track count, per-track name/duration, current selection in active format, cursor position.
- Keyboard: existing global keys keep working (Space, ←/→, Home/End, +/-/0, l); `selection.set`
  enables exact keyboard selection via fields; zoom via toolbar/menu.
- Pointer interactions unchanged (seek click, drag selection) — Tier A overlays (Phase 4)
  never remove them.

## 6. Targets, touch, responsive
- Every pointer target ≥24×24 CSS px (WCAG 2.5.8; spacing exception NOT relied on); touch
  hit area ≥40×40 via padding (visual glyph may stay 16–20). Toast close buttons: 28×28
  visual, 40 touch (fixes F-4).
- Breakpoints (behavioral, tested): ≥1280 all groups visible · 1024 per-group overflow
  (⋯) in fixed priority transport > selection > edit > tools > meters · 768 single command
  band + grouped overflow · ≤480 stacked bands, meters collapse into Z8, drawers overlay.
- No horizontal scroll of the frame itself at any width ≥320.

## 7. i18n
- Every v2 string in en + bn; labels must not clip at bn length +40%: fields/bands use
  min-content with overflow-into-popover policy, never `white-space: nowrap` + fixed px
  widths. Locale switch re-flows without reload (existing mechanism).
