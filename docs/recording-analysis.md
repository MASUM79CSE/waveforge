# Professional recording upgrade — market analysis

> **STATUS: EXECUTED (2026-09-25)** — see recording-plan.md (shipped same day).

**Date:** 2026-09-25 · **Feeds:** `docs/recording-plan.md` (R-series) ·
Audits the M4/M8f recording stack against the browser-DAW market and
classic studio workflow.

## 1. Current state (audited)

`RecorderEngine`: getUserMedia → AnalyserNode (meter) → AudioWorklet
`wf-recorder` → pure `RecordBuffer` (ScriptProcessor fallback). Device
picker + constraints persisted. Monitor path exists but is **hard-muted at
the sink** (no way to hear yourself). States: `idle | recording` — the
button rolls immediately; a 1 s timer counts; over-long takes auto-stop.
A take lands as a NEW LANE (project open) or a NEW DOC, rate-conformed.
**Missing vs studio practice:** no armed/ready state, no count-in, no
metronome, no monitoring, no punch in/out, no takes list (each take just
stacks a lane), no pause, no clip indicator.

## 2. Market (2026-09)

- **BandLab** (the web benchmark): **input monitoring** behind a per-track
  headphone icon with explicit *use wired headphones* guidance; **metronome**
  (tempo 40–240, sound, volume) with a **count-in duration** setting;
  shortcuts `R` record, `M` metronome. Takes workflow is basic.
- **Soundtrap**: multitrack + waveform/clip editing; punch/comp features
  thin — the web field generally stops at "record → region".
- **Classic DAW workflow** (Wikipedia punch in/out; punch-and-roll guides):
  the professional loop is **arm → count-in → pre-roll playback → punch in
  → punch out**, all **non-destructive** (original kept underneath, undo
  restores), with **takes stacked** for later comping. Punch-and-roll
  (audiobooks) = pre-roll plays the last phrase, then record replaces the
  mistake, seamless. Studio checklists insist on a **level/noise check
  BEFORE the take** — i.e. arming with a live meter is not a luxury.
- **AudioMass** (the parity reference): records a plain take into a fresh
  document. Nothing more. This is the area where WaveForge can leave it
  furthest behind.

## 3. Product take

The studio loop decomposes cleanly onto what WaveForge already has:

1. **Arm** = open the mic and meter it BEFORE rolling (peak-hold + clip
   LED) — reuses the analyser.
2. **Count-in + click** = the BPM/beat machinery already detects tempo; a
   pure scheduler + oscillator beeps cover the metronome.
3. **Monitor** = un-mute the existing sink path, default OFF with a
   headphones warning (feedback is real).
4. **Punch in/out with pre-roll** = selection (already first-class) +
   pre-roll playback (AudioEngine) + `makeOverwritePaste` /
   `commitTrackChannels` (already undoable, non-destructive by design).
5. **Takes** = a small pure session reducer over the existing
   record-into-lane flow.

Latency-compensated overdub alignment is the one thing a browser cannot do
rigorously (round-trip delay is device-dependent) — documented as a
non-goal with monitoring guidance instead, exactly as BandLab does it.
