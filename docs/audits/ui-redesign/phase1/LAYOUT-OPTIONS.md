# Layout options A / B / C — Phase 1 (UX-1.4) — DECISION REQUESTED

Three candidate arrangements for the WaveForge editor frame. All three host the SAME
re-homing map (`IA.md` §3) and the same Z1–Z9 zones — they differ in how groups populate
the command bands. Visual wireframes: `wireframes.html` (workspace preview).

## Option A — Classic stacked (Audacity-style fixed bands)

```
┌──────────────────────────────────────────────────────────────────┐
│ WaveForge  File  Edit  Effects  Analyze  View  Help            Z1│
├──────────────────────────────────────────────────────────────────┤
│ ▶ ⏸ ⏹ ⏮ ⏭ 🔁 ● REC  │ ✂ 📋 📌 🗑 trim silence ↶ ↷ │ 🔍+ 🔍− fit Z3│
├──────────────────────────────────────────────────────────────────┤
│ POS 0:00.000 │ SEL [0:00.000][0:09.272][9.272s] │ SNAP ◻ BEAT ◻ │Z2│
├──────────────────────────────────────────────────────────────────┤
│ 0:00  0:01  0:02  0:03 …                                  ruler Z4│
├──────┬───────────────────────────────────────────────────────────┤
│ trk1 │ ▋▋▋▋▋ waveform graph (Z5 headers · Z6 scale · Z7 wave) ▋▋ │
│ trk2 │ ▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋ │
├──────────────────────────────────────────────────────────────────┤
│ demo.wav 44.1kHz Stereo 9.27s         9.27s ×326  v1.0.0     Z8 │
└──────────────────────────────────────────────────────────────────┘
```
Fixed 3 command rows (Z1 + Z3-like row + Z2 row as drawn: tools row then readouts row).
- **Pros:** most deterministic; closest to current mental model (migration cost ~0); every
  group always in the same place; simplest overflow (rows stack); easiest i18n +40%.
- **Cons:** ~184px chrome always — waveform loses ~1 track-height vs B; no compactness
  story on wide screens; reads as "the old app, tidied" (weakest clean-slate story).

## Option B — Unified two-row command surface  ★ RECOMMENDED (UX-D4)

```
┌──────────────────────────────────────────────────────────────────┐
│ WaveForge File Edit Effects Analyze View Help   ▶ ⏮ ⏭ ● 🔁  POS  │
│                                     SEL [start][end][dur] SNAP ⋯ Z1+Z2r1
├──────────────────────────────────────────────────────────────────┤
│ ↶↷ ✂📋📌🗑 trim silence │ 🔍+🔍−fit ↔ │ SNAP BEAT BPM │ meters ▁▃▅ Z2r2│
├──────────────────────────────────────────────────────────────────┤
│ 0:00  0:01  0:02  0:03 …                                  ruler Z4│
├──────┬───────────────────────────────────────────────────────────┤
│ trk1 │ ▋▋▋▋▋ waveform graph ▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋▋ │
├──────────────────────────────────────────────────────────────────┤
│ demo.wav 44.1kHz Stereo 9.27s         9.27s ×326  v1.0.0     Z8 │
└──────────────────────────────────────────────────────────────────┘
```
Row 1 = menu + transport core + position/selection readouts (right-aligned). Row 2 =
edit + tools/view + time-selection-snapping + meters (right). ~140px chrome (−44 vs A).
- **Pros:** maximal audio-graph space (the redesign's stated goal); single scanning line
  for readouts; exactly the master-prompt group taxonomy; overflow primitive (already a
  Phase-2 foundation) absorbs narrow widths in fixed priority transport > selection >
  edit > tools > meters; position readout + selection fields share one format switcher.
- **Cons:** denser bands → i18n (+40% bn) and overflow discipline must be strict (test
  burden, accepted); readouts at 1024 need the compact `m:ss` position variant.

## Option C — Hybrid dockable (A's default + movable groups)

Same as A by default, plus: groups draggable between an upper dock and a lower dock
(above Z8), floatable, position persisted; Reset layout restores.
- **Pros:** power-user personalization; parity with benchmark dock concepts.
- **Cons:** a full drag-dock infrastructure (pointer + keyboard dock moves + persistence +
  collision layout) ≈ +1 phase of work; a11y surface grows (keyboard docking, drag
  alternatives); test matrix ×(groups × docks × states); even Audacity's 2026 manual
  (CLEAN_ROOM_LOG row 4) now keeps only ONE movable toolbar — the benchmark itself
  retreated from full docking. Highest risk to the a11y/i18n non-negotiables.

## Tradeoff summary

| criterion (weight) | A | B | C |
|---|---|---|---|
| audio-graph space (high) | ◐ | ● | ◐ |
| determinism / test cost (high) | ● | ◐ | ○ |
| a11y simplicity (high) | ● | ● | ○ |
| i18n +40% safety (high) | ● | ◐ | ● |
| clean-slate ambition (med) | ○ | ● | ◐ |
| implementation risk (high) | ● | ◐ | ○ |
| responsive ≤320 (med) | ● | ● | ○ |

(● good ◐ acceptable ○ poor)

## Recommendation — UX-D4

**Recommend Option B.** Rationale: the program's goal is a frame that serves the audio
graph; B buys ~44px of permanent graph height while keeping fixed group order (roving
toolbars, tooltips, re-homing test all deterministic). C's dock machinery directly
endangers the a11y/test-cost non-negotiables and is rejected for this program (a dock can
be a later additive ticket if desired — it would NOT need A-2 removal approval since it
removes nothing). A remains a sound fallback if the user prefers minimal density risk.

**WAITING FOR: option approval (A / B / C) + Tier B decision (UX-D5: request RMS, ticket
spectrogram) + `PROCEED TO PHASE 2`.**
