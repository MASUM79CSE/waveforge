# AudioMass Feature-Parity Matrix (AM-01 … AM-16)

Reference: https://audiomass.co/ (menu inventory fetched 2026-10-13; behavior-level checks in Phase 5).
WaveForge base: `audit/remediation` @ `22b6aba` (production `main`).
Statuses: `VERIFIED EQUIVALENT` · `VERIFIED INTENTIONAL DIFFERENCE` · `MISSING` · `UNVERIFIED`
Rule: a button/menu item is not a feature — each row needs behavioral evidence on both apps.

| ID | Feature area | Status | Evidence | Limitations | Test date | Linked |
| --- | --- | --- | --- | --- | --- | --- |
| AM-01 | Audio import and waveform | UNVERIFIED | — | — | — | WF-009 |
| AM-02 | Zoom, pan, selection | UNVERIFIED | — | — | — | PF-07 |
| AM-03 | Core destructive edits (cut/copy/paste/trim/silence/reverse/invert/normalize/fades) | UNVERIFIED | — | — | — | PF-04 |
| AM-04 | Effects workflow (preview/cancel/apply/undo) | UNVERIFIED | — | — | — | PF-04 |
| AM-05 | Recording (permission, start/stop, input select) | UNVERIFIED | — | mock vs real must be labeled; real-device expected NOT RUN | — | WF-012 |
| AM-06 | Multitrack (tracks, mute/solo/vol/pan, mixdown; clip fades + crossfade) | UNVERIFIED | — | — | — | PF-02 |
| AM-07 | Markers (add `M`, ruler dbl-click, named, drag, rename, delete, `[`/`]` jump, Shift-jump = selection) | UNVERIFIED | — | — | — | PF-01 |
| AM-08 | Spectrum / peak / distortion indication | UNVERIFIED | — | — | — | verify |
| AM-09 | Repair tools (declick / dehum / edit-point smoothing) | UNVERIFIED | — | — | — | PF-03 |
| AM-10 | Beat tools + pitch/speed profile | UNVERIFIED | — | — | — | verify |
| AM-11 | Seamless loop | UNVERIFIED | — | — | — | PF-06 |
| AM-12 | Portable project save/open (`.amss` vs WaveForge draft-only) | UNVERIFIED | — | — | — | PF-05 |
| AM-13 | Export formats (every advertised format/settings/filename/MIME/bytes) | UNVERIFIED | — | — | — | WF-010 |
| AM-14 | Shortcuts + context menus | UNVERIFIED | — | — | — | verify |
| AM-15 | Offline / PWA | UNVERIFIED | — | — | — | WF-012 |
| AM-16 | Session persistence + recovery | UNVERIFIED | — | — | — | WF-009/PF-05 |

## AudioMass documented reference (from fetched landing page, 2026-10-13)

Menus: File = Export/Download · Load from Computer · Load Sample File · **Load From URL** · New Recording · Save Draft Locally · Open Local Drafts. Edit = Undo/Redo (Shft+Z/Y), Play/Stop, Select All/Deselect, Channel Info/Flip, **Seamless Loop**, Zero-Cross Selection. Effects = **Gain, Fade In, Fade Out**, Noise Reduction (Voice), Paragraphic EQ, Compressor, Normalize, Graphic EQ (+20-band), Hard Limiter, **Delay**, Distortion, Reverb, **Audio Repair**, Speed Up/Slow Down (pitch), Speed/Playback Rate, Reverse, Invert, Remove Silence. View = Follow Cursor, Peak Separators, Timeline, Frequency/Spectrum Analyser, Multitrack Mixer, Tempo Tools, ID3 Tags. Multitrack: add/mute/solo/volume/pan/rec-trigger/delete channels. Beat: toggle markers, snap, BPM + time signature. Zoom keys: +/−/0; Tab = center to cursor. Shortcuts are Shift+key combos (Shift+C/X/V/N, Shift+Z/Y, R record, L loop, Q clear selection).

Phase 5 must test each row behaviorally on both apps with equivalent fixtures and record `VERIFIED …`/`MISSING` with evidence — not from this inventory.
