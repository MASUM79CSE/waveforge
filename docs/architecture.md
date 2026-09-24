# Architecture — WaveForge

> Source: Build Plan v2.2 §3 + §6. Summary; `ecc:doc-updater` keeps in sync.

```
UI (Preact + Signals)  —— commands ▼ / events ▲ ——  Application (TS)
   MenuBar · Transport · Panes · Dialogs · Toasts      CommandRegistry · History · Selection
                                                       DraftRepository · Settings · Zod boundaries
                                                                │
Engine (imperative, UI-free)                      Workers (typed, supervised)
   AudioEngine · AudioDocument + EDL                 peaks · wav · mp3 · flac · tempo
   EffectRegistry (offline render + preview)         AudioWorklet recorder
   WaveRenderer (canvas lifecycle + interaction) · waveDraw (painting)
   Analyzer kernels
                                                                │
Platform: Web Audio · Canvas · IndexedDB · File System · Service Worker (PWA)
```

## Golden rules

1. Engine never imports UI. UI→engine = commands; engine→UI = events/signals.
2. Any loop that can exceed 16 ms runs in a worker or is chunked + yielded.
3. User audio never leaves the device; network = first-load shell assets only.
4. Every effect is a registered, pure definition (testable without UI).
5. Errors never cross layers raw: `Result` at boundaries, typed `engine:error`
   events, Preact error boundaries in UI. See `tech_doc.md` § errors.

## Key decisions

| ADR | Decision |
| --- | --- |
| [001](adr/001-custom-renderer-vs-wavesurfer.md) | renderer: custom vs libraries — open until M1 spike |
| [002](adr/002-edl-undo-vs-snapshots.md) | EDL copy-on-write undo (not snapshots) |
| [003](adr/003-worker-topology.md) | one worker per concern, transferables, supervision |
| [004](adr/004-immutability-vs-dsp.md) | immutability at document layer; DSP kernels excepted (stage buffers) |
