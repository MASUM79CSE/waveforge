# CB-1.1 — Benchmark study (master prompt §3 sources)

**Method:** every source below was opened on 2026-10-15 and read for control-bar patterns only. Facts are recorded as short paraphrases with the source URL — nothing is copied into the product, and AudioMass is reference-only (never pixel-copy; zero audiomass.co traces in app source/UI). Anything not opened is marked **NOT RUN** — never assumed.

| # | Source | Status | URL |
|---|---|---|---|
| S1 | Logic Pro User Guide — "Change the LCD display mode" (Apple Support) | OPEN | https://support.apple.com/guide/logicpro/lgcp127f51bc/10.7/mac/11.0 |
| S2 | Ableton Reference Manual 12 — "Live Concepts §3.1 The Control Bar" + "Arrangement View §6" | OPEN | https://www.ableton.com/en/manual/live-concepts/ · /arrangement-view/ |
| S3 | REAPER User Guide (official PDF, reaper.fm) — transport chapters | OPEN | http://dl.reaper.fm/userguide/ReaperUserGuide476C.pdf |
| S4 | Audacity Manual — "Selection Toolbar" + "Audacity Selection" | OPEN | https://manual.audacityteam.org/man/audacity_selection.html |
| S5 | Steinberg Docs (Cubase) — "Time Display Window" | OPEN | https://archive.steinberg.help/cubase_le/v12/en/cubase_nuendo/topics/playback/playback_time_display_window_r.html |
| S6 | BandLab official help | **NOT RUN** (official help pages not reachable/indexed; facts below are from clearly-secondary sources: Sound On Sound review 2015-12, edu course material 2026) | — |
| S7 | AudioMass about page (reference-only) | OPEN | https://audiomass.co/about.html |

## What each source shows

**S1 Logic Pro — clock switching is a first-class control-bar actuator.** The LCD (center of the control bar) has display modes — *Beats & Project, Beats & Time, Beats, Time, Custom* — chosen from a pop-up menu on a down-arrow at the LCD's right edge. Musical (bars/beats) and absolute (min/sec) formats are independent of the ruler format. Tempo, key and time signature are editable from the same LCD. *Implication for F-06: format switching belongs ON the clock itself (small affordance + menu), not buried in settings.*

**S2 Ableton — the control bar is a fixed set of grouped sections.** Manual enumerates nine sections (Follow + arrangement position; transport; automation/capture; tempo; time signature; global quantization; MIDI; key/CPU meters; view switches). Position is editable numerically via Arrangement Position fields; loop via numeric Loop Start/Length fields; Space toggles playback, Shift+Space continues from last stop; quantization is a control-bar menu. *Implications: zone grouping with a stable order is the norm (F-01); numeric position/loop editing in the bar is industry-standard (F-07); Follow is a transport-adjacent toggle (our `view.follow` command exists).*

**S3 REAPER — transport context menu owns format choice; selection readout on the bar.** Right-clicking the transport bar opens a menu that includes the preferred **time display format**; when loop points are linked to the time selection, the bar shows selection **start, finish and duration**; Repeat sits next to Record; Stop returns to play-start position. *Implications: secondary access to format via context menu is a complement, not a substitute, for S1's visible affordance; selection start/end/length on the bar (F-07) matches REAPER.*

**S4 Audacity — the deepest selection-toolbar spec (direct model for F-07).** Selection Toolbar offers four display modes — *Start & End, Start & Length, Length & End, Length & Center* — with digit-level editing: Ctrl+F6 moves focus to the toolbar, Tab traverses controls, Left/Right move between digits, Up/Down increment the highlighted digit, typed values auto-advance; edits always snap to the current selection format. The toolbar also exposes cursor position with no selection (zero length shows in the Length field). *Implications: editable start/end/length with a mode toggle is proven UX; digit-level editing is a differentiator we can adopt selectively (v2: whole-field editing first, per-digit optional); keyboard model must be explicit (we already must build an APG toolbar — F-03).*

**S5 Cubase — the canonical format set.** Time Display formats: **Bars+Beats, Seconds, fps (timecode), Samples, "Show Beat Count Only"** (a visual metronome). A secondary time display can show a second format simultaneously. *Implications: our v2 clock set (time, samples, bars+beats-when-tempo-known, timecode-optional) matches the industry set; a secondary/simultaneous display is precedent for our StatusBar clock consolidation question (F-06's duplicate-format issue) — v2 should show ONE bar clock with switchable format, or two clearly-labelled formats, never two unlabeled different ones.*

**S6 BandLab — NOT RUN (official).** Secondary sources consistently describe: transport top-center (play/stop/record/loop/metronome/tempo/time display); metronome with tempo, time-signature and count-in adjustments. Recorded as secondary-source notes only; no design decision rests solely on this source.

**S7 AudioMass — reference only.** Observed self-description: beat detection with beat bars + snap-to-beat, markers with `[`/`]` jumps and shift-jump selection, seamless-loop preview with crossfade, zero-crossing selection, sub-100 KB no-backend ethos, explicitly not mobile-optimized. *Implications: confirms our BEAT/SNAP direction and zero-crossing placement (View-menu today, F-10 cluster consolidation); its "not mobile-optimized" admission is a warning — our v2 must handle ≤390 px properly (F-01). No visual or textual copying; WaveForge keeps its own command names, visuals, and structure.*

## Synthesis — convergent patterns → v2 decisions

| Pattern | Seen in | v2 decision (feeds design §) |
|---|---|---|
| Clock format switchable at the clock (menu affordance) | S1, S3, S5 | Clock gets an inline format switcher; menu lists available formats; unavailable (bars+beats w/o tempo) not offered rather than disabled |
| Format set = time / samples / bars+beats / timecode | S5 (all), S1 (musical+absolute), S4 (samples for max precision) | Ship time (default) + samples + bars+beats(when known); timecode deferred with ticket (no fps/video workflow in engine) |
| Numeric selection start/end/length on the bar | S3, S4 | Editable validated Start/End/Length fields (F-07); mode toggle deferred — all three fields, cross-computed |
| Explicit keyboard model for bar controls | S4 (Ctrl+F6/Tab/digits) | APG toolbar: one tab stop, roving tabindex, arrows; inputs excluded from roving (master prompt) |
| Grouped fixed-order zones, transport anchored | S2 (9 sections), S3 | Priority-ordered zones; transport never hidden; priority overflow into a menu at narrow widths (F-01) |
| Metronome + tempo + count-in clustered in the bar | S2, S6(secondary), S1 | One tempo/grid/metronome zone wired to existing `recStudio` settings (F-10) |
| Follow-playhead toggle near transport | S2 | Keep `view.follow` command; expose in overflow, not as a new always-visible control (no scope growth) |
| Selection readout duplicates on bar + status | S3 (linked loop/selection), our F-06 duplicate-clock | v2: single source of truth — bar shows selection; status bar shows secondary clock only if labelled |
