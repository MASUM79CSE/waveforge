# IA + toolbar model + re-homing map — Phase 1 (UX-1.1/1.2)

Program: ui-redesign · Branch `ui/clean-slate-layout` · Grounded in `CAPABILITY_INVENTORY.md`
(@ `22b6aba`). Assumptions A-1..A-5 relied on. This file defines the zone shell, the toolbar
model, and the re-homing map that Phase 2/3 implement and the automated re-homing test walks.

## 1. Zone shell (Z1–Z9)

Fixed semantic slots. Layout options (see `LAYOUT-OPTIONS.md`) arrange groups INTO zones;
the zones themselves do not change per option.

| Zone | Content | Notes |
|---|---|---|
| Z1 | Menu bar (6 menus, unchanged structure) | gains APG menubar keyboard (fix F-2) |
| Z2 | Primary command band: transport+record group, position readout, selection fields (parser), snap/beat, meters/master | group set fixed, arrangement per option |
| Z3 | Secondary command band: edit group, tools/view group | same |
| Z4 | Timeline ruler (nice-interval ticks) | Phase 4 |
| Z5 | Track panel column (headers: name, M/S, vol/pan, automation, take/badge) | Phase 4 |
| Z6 | Vertical scale (linear+dB, analytic anchors) | Phase 4 |
| Z7 | Audio graph (waveform + separate overlay layer + playhead + accessible summary) | Phase 4 |
| Z8 | Status bar (file info, rate, channels, duration, zoom, engine state, version) | Phase 2 shell |
| Z9 | Overlay layer: dialogs, toasts (≥24×24 close, F-4 fix), banners, tooltips | |

Z-index ladder: Z9 overlays 60–80 · sticky bands 30–40 · graph 10 · decorative 0.

## 2. Toolbar model

Groups (order = default; per-group visibility manageable, Reset restores):

1. **transport** — play/pause, stop, seek-back, seek-fwd, loop, record-toggle, monitor,
   punch, metronome, count-in indicator (clip-led). 10 controls → `role=toolbar`.
2. **edit** — undo, redo, cut, copy, paste, delete, trim, silence, select-all, deselect.
   10 → `role=toolbar`.
3. **tools/view** — zoom-in, zoom-out, zoom-reset, zoom-center, follow, zero-cross, axis.
   7 → `role=toolbar`.
4. **time-selection-snapping** — snap toggle, beat-grid toggle, BPM control; the SELECTION
   fields (start/end/duration + format switcher) sit in this band but OUTSIDE the
   `toolbar` role (arrow-key text inputs — APG exclusion rule), as a labelled
   `role=group` with its own tab stops.
5. **meters+mixer** — master volume, playback meter strip, monitor level; sliders are
   arrow-needing → own `role=group` outside toolbar roving (same exclusion rule).
   Track-channel mixing lives in Z5 headers (unchanged capability location).

APG contract per group (normative, from CLEAN_ROOM_LOG row 2): one tab stop; ←/→ rove;
Home/End optional (we support both); first Tab lands on first enabled control, next visit
restores last-focused; groups < 3 controls stay plain `role=group`; every toolbar labelled
(`aria-label`); toggle state via `aria-pressed`; popup triggers via `aria-expanded`.
Disabled controls stay focusable with `aria-disabled` (discoverability) — documented choice.

**Visibility manager + Reset layout** (new capability, additions to registry — see §4
addendum): per-group hide/show via menu View › Toolbars; `view.layoutReset` restores default
arrangement/visibility. State under the flag's storage namespace; Reset also clears it.

## 3. Re-homing map — every capability, destination, reach path

Test contract (Phase 3): every row reachable in v2, same command id, executed once.
"menu" = same menu path as today (structure unchanged). Keyboard column: `=` keep today's
binding; `—` intentionally menu-only (unchanged); NEW bindings are additive and listed.

### file / record (11 ids in 10 rows)
| id | v2 destination | reach | kbd |
|---|---|---|---|
| file.open | Z1 File › Import | menu | Ctrl+O = |
| file.url | Z1 File › Import (dialog Z9) | menu | — |
| file.sample | Z1 File › Import + welcome dialog | menu | — |
| file.recordSettings | Z1 File › Record (dialog Z9) | menu | — |
| record.toggle | Z2 transport + Z1 menu | toolbar | r = |
| record.punch | Z2 transport + Z1 menu | toolbar | — (gap documented; no silent binding) |
| record.monitor | Z2 transport + Z1 menu | toolbar | m = |
| record.metronome | Z2 transport + Z1 menu | toolbar | — |
| file.export | Z1 File › Export (dialog Z9) | menu | Ctrl+S = |
| file.draftSave / file.draftOpen | Z1 File › Drafts (dialogs Z9) | menu | = (Ctrl+D / Ctrl+Shift+O region) |

### edit (10)
edit.undo/redo/cut/copy/paste/delete → Z3 edit + Z1 menu; kbd = (Ctrl layer + Shift layer +
plain del/backspace). edit.trim, edit.silence → Z3 edit + menu; —. edit.selectAll → Z3 + menu;
Ctrl+A / a =. edit.deselect → Z3 + menu + selection-field clear; q = (advertise honestly).

### clips (3)
clip.split / clip.duplicate / clip.delete → Z1 menu Edit + Z7 clip context menu (new context
surface, same ids) + existing resolve keys. No toolbar buttons (context-scoped ops).

### effects (31) / analyze (5)
fx.rack + 31 fx → Z1 Effects (10 groups, unchanged) + dialogs Z9. analyze.* → Z1 Analyze +
report/panel surfaces Z9. **Menu-only by design** (32 icons would destroy the command band);
re-homing test drives them via menu. Volume knobs untouched (A-3).

### view (9)
view.zoomIn/out/reset → Z3 tools + menu; +/=, −/_, 0 =. view.center → Z3 tools + menu;
**kbd removed from registry advertising (F-1 phantom `Tab` fix) — menu-only until a real
binding is approved**. view.follow → Z3 tools toggle; l =. view.zerocross, view.axis →
Z3 tools toggles; —. view.theme, view.accent → Z1 View + Z8 quick toggle; —.

### automation / help (4)
automation.toggle → Z5 track header + clip context; —. help.welcome/shortcuts/about/doctor →
Z1 Help (surfaces Z9); —.

### Non-registry capabilities (from inventory §7)
| capability | v2 destination |
|---|---|
| Welcome flow (Load sample) | Z9 dialog, unchanged texts/credits |
| Position readout | Z2 (format linked to selection-field format switcher) |
| Selection readouts → **editable fields** (prescribed new) | Z2 right, parser in INTERACTIONS.md |
| Snap / beat grid / BPM | Z2 time-selection-snapping band |
| Meters / master strip | Z2 right per option (or Z8 on narrow) |
| Track headers, takes, M/S, vol/pan | Z5 unchanged scope |
| Ruler / playhead | Z4 (marker glyph ours) |
| Canvas seek/select/zoom | Z7 + keyboard equivalents (INTERACTIONS.md) |
| Status info + storage | Z8 |
| Banners (update/restore), toasts | Z9 (toast close ≥24×24, F-4 fix) |
| i18n en/bn, themes | unchanged mechanisms; every new string lands in both locales |

## 4. Registry addendum (new ids only — additions are allowed, removals are not)
- `view.layoutReset` — Reset layout (visibility manager).
- `view.toolbars.<group>` — toggle one toolbar group's visibility (5 ids: transport, edit,
  tools, timenap, meters).
- `selection.set` — single entry point for programmatic selection (fields, a11y summary
  actions, canvas all funnel here; Phase 3 re-homing test counts it reachable ×3 paths).
- `help.toolbars` — opens the toolbars submenu/help note (i18n surface).
All other 74 ids: unchanged, same semantics, same dispatch path (`runCommand`).

## 5. Explicit non-goals (A-2/A-3 guards)
Nothing in the inventory is removed. fx/analyze stay menu-only by design (documented above —
this is a placement decision, NOT a removal; approval token never needed). Engine, DSP,
document, undo, persistence, export remain out of scope; spectrogram/RMS decision recorded
in DECISIONS UX-D5.
