# CB-6.1 — Control-by-control parity sweep (audit §2 → Control Bar v2)

**Date:** 2026-10-15 · **Base:** Phase-6 tree · **Method:** audit §2 inventory (56+ rows) mapped
to the v2 bar; every row verified live by `tests/e2e/cb6.spec.ts` (inventory + placement +
routing), `tests/unit/app/shortcutTruth.test.ts` (shortcut column vs real bindings), and the
cb3/cb4/cb5 suites (pressed states, names, ≥24 px). "Panel" = the ⋮ dialog (CB-D19) — a
relocation, not a removal; single instance guaranteed by spec.

| Audit §2 | Control | v2 disposition | Routes via | Shortcut (truth-checked) | Acc name / state | Verdict |
|---|---|---|---|---|---|---|
| #1–6 | Menus File/Edit/Effects/Analyze/View/Help | carried `MenuBar apg` — APG keyboard (H-11 closed) | registry (unchanged items) | APG arrows/Enter/Escape | `menubar` + `menuitem` + `aria-expanded` | **IMPROVED** |
| #7 | Clock | v2 Clock + format switcher (CB-2.2) | signal + menu | — | `title=Cursor position` | **IMPROVED** |
| #8/#13 | Play/Pause, Stop | TransportZone | `transport.playPause` / `transport.stop` | Space | AL + `aria-pressed` | **IMPROVED** (registry) |
| #9/#10 | Back/Forward 5 s | **RESTORED in Phase 6** (had been dropped in the Phase-2 transport build — caught by this sweep); tuck tier <430 px (panel) | `transport.nudgeBack/Fwd` (new registry ids) | Shift+← / Shift+→ (real bindings) | AL `Back 5 seconds`/`Forward 5 seconds` | **PARITY** (gap closed) |
| #11 | Loop | TransportZone | `transport.loop` | L | AL + `aria-pressed` | **IMPROVED** |
| #12 | Record | TransportZone | `record.toggle` | R | AL 3-state + `aria-pressed` | **IMPROVED** |
| #15–29 | Edit tools / Quick FX / Zoom (15 buttons) | carried ToolBar; tucks <890 px → panel (all 15 commands verified present in menus) | registry (all) | Ctrl+X/C/V, Del, +−0 (via labels/kbd) | AL = label (kbd) | **PARITY** |
| #30 | Selection Start/End/Length | SelectionZone — now EDITABLE+validated (F-07) | `selectRange` → snap pipeline | — | `<label for>` ×3 | **IMPROVED** |
| #31 | Clear Selection ✕ | SelectionZone | `edit.deselect` | Q | AL+T `Deselect All (Q)` | **PARITY** |
| #32–34 | BEAT / SNAP / BPM | TempoZone (panel <1360 px) | `view.beatsShown` / `view.snapToBeat` (SNAP no longer a raw signal write — F-09) | menu-only | AL + `aria-pressed` ✓ | **IMPROVED** |
| #35 | Monitor | RecordZoneV2 (panel <1540 px) | `record.monitor` | **none** (v1 title claimed M — false; M = metronome) | AL + `aria-pressed` ✓ | **IMPROVED** (H-04) |
| #36 | Punch | RecordZoneV2 | `record.punch` | P | AL + title (P) | **IMPROVED** |
| #37/#39 | Rec meter + elapsed | RecordZoneV2 reserved slots (F-05 = 0 px arm shift) | signals | — | title dB; slots never unmount | **IMPROVED** |
| #38 | Clip LED | RecordZoneV2 — 24×24 hit, 10 px lamp | `record.clipReset` | — | AL from catalog | **IMPROVED** (was 10×10) |
| #40 | Count-in chip | reserved slot, mounts while counting | signal | — | `aria-live=polite` | **PARITY** |
| #41–46 | Mutes / vol / pan strips | MasterZoneV2 verbatim (panel <2150 px) | actions (unchanged) | — | AL + `aria-pressed` ✓ | **PARITY** |
| #47/#48 | Add track / Swap ⇄ | MasterZoneV2 verbatim | `ensureProject` / action | — | AL (`trackAdd`/`channelSwap`) | **PARITY** |
| #49 | Master volume | MasterZoneV2 — canonical `masterVolume` signal (CB-D9, no local useState) | signal → `engine.setVolume` | — | AL + `aria-valuetext` % | **IMPROVED** |
| #50–55 | ZoomBar / StatusBar facts | shell furniture — v2 does not touch them (flag-OFF DOM identical) | unchanged | unchanged | unchanged | **PARITY** |

**Fabricated-hint corrections (E-CB-021):** v1 titles claimed `(M)` for Monitor (false — M is the
metronome's) and `Tab` for Center-to-Cursor (never bound). Phase 4 mis-purged the *truthful*
R/P/M hints (incomplete audit that missed `resolveShortcut`); Phase 6 restored them via the
registry (`record.toggle R`, `record.punch P`, `record.metronome M`) and purged the two real
offenders. Every advertised hint now provably corresponds to a binding
(`shortcutTruth.test.ts`, 3/3).

**Result: zero parity diffs.** Two reachability gaps found BY the sweep were closed in-phase
(seek pair restored; tucked ToolBar hosted in the panel). No tickets required.
