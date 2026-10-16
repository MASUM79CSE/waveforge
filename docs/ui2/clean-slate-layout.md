# The clean-slate editor frame (`ui.cleanSlateLayout`)

Status: **opt-in preview, default OFF.** Enable it per-load with `?ui2=1` in
the URL, or persist it with `localStorage.setItem('ui.cleanSlateLayout',
'1')` in the browser console. Force it off for one load with `?ui2=0` (the
URL always wins). Nothing moves unless you ask: with the flag off, WaveForge
is exactly the app you had.

## What changes with the flag ON

- **Two command rows (Option B).** Row 1: transport toolbar, position, and
  editable selection fields. Row 2: edit · tools/view · time & snapping ·
  meters/mixer, a ⚙ toolbars button, and a ⋯ overflow menu. The whole
  waveform gets ~44 px more height than the classic layout.
- **Toolbars behave like one control each (APG).** Tab lands once per
  toolbar; ←/→ (and ↑/↓, Home/End) move between its buttons; disabled
  buttons are skipped but stay findable (focusable, `aria-disabled`).
- **Editable selection fields.** Type `83.456`, `1:23.456`, `1:02:03.456`,
  or whole samples (`44100`) — pick the format in the dropdown. **Enter
  commits, Escape reverts**, invalid input never commits (the field is
  marked and a message explains). Editing End below Start is rejected, not
  silently swapped. What you commit is exactly what the waveform selects.
- **A dB-true vertical scale.** The left panel labels 0 / −6 / −20 / −60 dB
  using the same analytic curve that draws the waveform (0 dB at the lane
  edge, −60 dB at the center line) — the picture and the numbers can't
  disagree.
- **A lighter playhead.** The cursor rides on a separate overlay layer;
  during playback the waveform only repaints when the view pages. Measured
  on the demo clip: canvas fill calls during a 5 s play drop from ~765,000
  to ~800.
- **Minor ruler ticks** between the labeled majors.
- **Bengali (bn)** — the documented `waveforge.locale=bn` setting now
  actually switches the core chrome (this fix applies with the flag off
  too).

## Also fixed for everyone (flag off included)

- Toast close buttons meet the 24×24 px minimum target size.
- The Save Draft / Drafts / Metadata dialogs close with Escape.
- Tooltips are Escape-dismissible.
- The menu bar is fully keyboard-operable (arrows switch/open menus,
  in-menu arrow navigation + typeahead, Escape restores focus) and counts
  as ONE tab stop instead of six.

## Keyboard quick reference (new parts)

| Keys | Where | Action |
|---|---|---|
| Tab / Shift+Tab | command rows | enter/leave a toolbar (one stop each) |
| ← → Home End | menu bar | move between menus (one tab stop; wraps) |
| ↓ / ↑ / Enter | menu bar | open the menu (first/last item focused) |
| ↑ ↓ Home End | open menu | move between items (typeahead: press a letter) |
| Enter / Escape | open menu | run the item / close and refocus the menu |
| ← → ↑ ↓ Home End | inside a toolbar | move between buttons (wraps; skips disabled) |
| Enter / Escape | selection fields | commit / revert |
| ⚙ → checkboxes | row 2 | show/hide toolbars; "Reset layout" restores defaults |

## Accessibility

The flag-ON frame is axe-clean (WCAG 2.0/2.1 AA rules) in the loaded,
welcome, and 390 px-narrow states; every pointer target is ≥24×24 CSS px
(≥40 px on coarse pointers); a visually-hidden live region describes the
document/selection for assistive tech; `prefers-reduced-motion` disables
micro-animations. The canvas is never the only way: selection, seeking, and
zoom all have keyboard/field equivalents.
