# R-series — studio recording (build plan)

> **R6 SHIPPED (2026-09-25):** punch routed through the PROJECT stack —
> pre-roll plays the project mix (projectSeek/projectTogglePlay), the
> splice commits to the ACTIVE LANE via activeTrackTarget +
> commitTrackChannels (one project-history entry); punch pre-roll is now
> a persisted setting (0.5–3 s, default 1.5). e2e #53. Gates: 716/716
> unit, 53/53 e2e, lint 0, tsc, build; LH desktop 100/100/100/100
> (mobile 87 = first-paint under emulated slow-4G, TBT 70 ms, CLS 0 —
> main-chunk splitting listed as future optimization).

> **STATUS: SHIPPED (2026-09-25).** All phases R1–R5 landed in one green
> wave: 714/714 unit, 51/51 e2e (#50 studio flow, #51 punch), lint 0,
> tsc clean, build OK. Non-goal deviations: takes = informational strip +
> discard-list (lane removal rides Ctrl+Z); punch pre-roll fixed 1.5 s;
> punch targets the document path (lane punch = follow-up).

**Date:** 2026-09-25 · **Extends:** `docs/recording-analysis.md` · Reuses:
RecorderEngine/RecordBuffer, analyser meter, BPM detection, selection,
makeOverwritePaste / commitTrackChannels, AudioEngine playback, fake-media
e2e harness.

## R1 — Arm state + studio metering + input monitoring

- `RecorderState` gains `'armed'`: idle → (Arm) → armed → (Roll) →
  recording → stop → idle. Arm opens the mic + starts the meter; Roll
  starts the worklet without re-opening the device (instant start).
- Toolbar: Record button becomes a two-step control (Arm/Roll; Esc or
  second click disarms; `R` keeps working — first press arms, second
  rolls, third stops).
- **Peak-hold meter + clip LED** in the transport (peak hold decays; clip
  latches ≥ −0.1 dBFS until disarmed). Meter math stays in `meter.ts`.
- **Input monitoring toggle** (default OFF): un-mutes the existing sink
  path; first enable per session shows a headphones/feedback warning
  toast (BandLab pattern). Settings persisted with the mic constraints.

## R2 — Count-in + metronome click

- Settings (RecordSettingsDialog): count-in bars 0–4 (default 1), metro-
  nome on/off, tempo (manual 40–240 OR "use detected BPM"), volume,
  accent downbeats. Persisted.
- Pure kernel `src/engine/metronome.ts`:
  `clickSchedule({ bpm, bars, beatsPerBar, preRollSec, rate })` →
  `ClickEvent[] { atSec, freq, gain }` (accent 1320 Hz / beat 880 Hz) —
  used for count-in AND punch pre-roll clicks.
- Browser glue schedules the clicks on the shared context (oscillator +
  gain envelopes, click-free); count-in shows 4·3·2·1 in the status bar;
  recording starts exactly at schedule end (worklet start is immediate —
  no added latency to compensate).
- Shortcuts: `M` toggles the metronome; `R` respects the count-in.

## R3 — Takes

- Pure reducer `src/engine/takes.ts`: session takes list
  `{ id, name, seconds, kept }`; actions `append`, `discardLast`,
  `keep(id)` (keep = the existing lane/doc commit; discard drops the
  buffer). Panel strip in the transport area listing takes of this
  session with keep/discard; "Take N" naming shared with the current
  counter.

## R4 — Punch in/out with pre-roll (flagship)

- With a selection + armed track + monitoring ON (enforced): Punch command
  → count-in (if metronome) → **pre-roll playback** of the existing audio
  (AudioEngine from `punchIn − preRoll`) → at the in-point the worklet
  starts; at the out-point (selection end) it stops → the recorded region
  replaces the selection via `makeOverwritePaste` (doc) /
  `commitTrackChannels` (lane ≥ 2) — one undoable, non-destructive edit.
- Pure kernel `src/engine/punch.ts`:
  `punchPlan({ selection, rate, preRollSec, countInBars, bpm })` →
  `{ playFromFrame, punchInFrame, punchOutFrame, clicks }` (clamped,
  ordered — anchor-tested).
- Toolbar Punch button (enabled when a selection exists) + `P` shortcut.
  The replaced material stays in history (undo = the original, exactly the
  non-destructive punch contract).

## R5 — e2e + close

- 50th e2e (fake media): Arm → meter visible → monitor toggle → Roll with
  count-in → stop → take lands; M metronome toggle persisted.
- 51st e2e: selection + punch → pre-roll plays → region replaced → undo
  restores → redo re-applies.
- Full gates + Lighthouse + doc stamps.

## Non-goals (this series)

Latency-compensated overdub alignment (round-trip delay is device-
dependent; monitoring guidance instead — the BandLab stance); multi-input
aggregation (stereo pair binding); comping/playlist editor UI; MIDI; loop-
record.
