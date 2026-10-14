# AudioMass Feature-Parity Matrix (AM-01 … AM-16)

Reference: https://audiomass.co/ (menu inventory fetched 2026-10-13; behavior-level checks in Phase 5).
WaveForge base: `audit/remediation` @ `22b6aba` (production `main`).
Statuses: `VERIFIED EQUIVALENT` · `VERIFIED INTENTIONAL DIFFERENCE` · `MISSING` · `UNVERIFIED`
Rule: a button/menu item is not a feature — each row needs behavioral evidence on both apps.

| ID | Feature area | Status | Evidence | Limitations | Test date | Linked |
| --- | --- | --- | --- | --- | --- | --- |
| AM-01 | Audio import and waveform | UNVERIFIED | — | — | — | WF-009 |
| AM-02 | Zoom, pan, selection | VERIFIED EQUIVALENT | +/−/0 keys, ctrl+wheel anchored zoom, wheel pan, zoom bar, drag selection + readouts + Clear(Q), zero-cross snap (default on, beats priority), Center to Cursor, Follow Cursor — all behaviorally proven (×zoom readout + canvas pixel diffs); touch: single-finger select/tap-seek, two-finger pinch zoom + pan (E-024) | touch evidence is EMULATED (Playwright hasTouch + CDP) — real-device NOT RUN; reference Center key = Tab, WF uses the View menu (Tab reserved for focus navigation — intentional) | 2026-10-14 | PF-07 |
| AM-03 | Core destructive edits (cut/copy/paste/trim/silence/reverse/invert/normalize/fades) | PARTIALLY VERIFIED | gain −6 dB ×0.5 ±5 %, fade-in/out head/tail ramps, undo restores — proven on exported WAV bytes (pcm24 decoded); effects.spec 3/3 (E-022) | remaining ops (cut/copy/paste/trim/silence/reverse/invert/normalize) in AM matrix close-out | 2026-10-14 | PF-04 |
| AM-04 | Effects workflow (preview/cancel/apply/undo) | PARTIALLY VERIFIED | apply+undo via menu flows for Gain/Fade In/Fade Out/Delay on real bytes; Delay apply toast + duration growth + undo (E-022) | dialog preview/A-B + cancel flows in AM matrix close-out | 2026-10-14 | PF-04 |
| AM-05 | Recording (permission, start/stop, input select) | UNVERIFIED | — | mock vs real must be labeled; real-device expected NOT RUN | — | WF-012 |
| AM-06 | Multitrack (tracks, mute/solo/vol/pan, mixdown; clip fades + crossfade) | VERIFIED EQUIVALENT | clip fades + crossfade e2e: trim→duplicate→Crossfade clip — mixdown bytes differ inside the overlap (74/147 sampled frames ≥ ⅓ threshold) and match outside (177); undo restores baseline byte-for-byte; Clip Fades 100 ms fade-in ramps clip-2 head (|sample| rising over 50 ms), undo restores; kernel 26/26 (cos/sin equal-power, fi+fo clamp, sub-5 ms snap-to-0, later-slip fallback); mixdown + realtime envelope paths both wired | intentional: crossfade addressed from either side of the ADJACENT pair (reference toggles all overlapping pairs of the selection — WF arranger forbids overlaps except xfade headroom, so pairs are adjacent by construction); overlap default 10 ms = reference default; e2e touch portion covered in PF-07 (real device NOT RUN) | 2026-10-14 | PF-02 |
| AM-07 | Markers (named, dbl-click add, rename, delete, jump, Shift-select) | VERIFIED EQUIVALENT | kernel 6/6 + e2e 2/2 (add B/dbl-click, jump [ / ], rename/delete via menu, draft round-trip) | drag-to-move omitted — keyboard/menu equivalents (accessibility-first; B not M: M = metronome in WF) | 2026-10-13 | PF-01 |
| AM-08 | Spectrum / peak / distortion indication | UNVERIFIED | — | — | — | verify |
| AM-09 | Repair tools (declick / dehum / edit-point smoothing) | UNVERIFIED | — | — | — | PF-03 |
| AM-10 | Beat tools + pitch/speed profile | UNVERIFIED | — | — | — | verify |
| AM-11 | Seamless loop | VERIFIED EQUIVALENT | Edit ▸ Seamless Loop; dialog defaults 10 ms/×1/snap-on/trim-off; equal-power tail→head fold (len−fade), repeat 1–64 tiling; apply = overwrite-paste (undoable) + loop re-selected; whole-doc target when no selection; unit 10/10 + e2e duration/undo proof (E-023) | intentional: no preview canvas/Preview Loop button (behavior proven at kernel/byte level), no Open-in-New-Editor (single-window), no apply toast (WF editOps convention) | 2026-10-14 | PF-06 |
| AM-12 | Portable project save/open (`.amss` vs WaveForge draft-only) | UNVERIFIED | — | — | — | PF-05 |
| AM-13 | Export formats (every advertised format/settings/filename/MIME/bytes) | UNVERIFIED | — | — | — | WF-010 |
| AM-14 | Shortcuts + context menus | UNVERIFIED | — | — | — | verify |
| AM-15 | Offline / PWA | UNVERIFIED | — | — | — | WF-012 |
| AM-16 | Session persistence + recovery | UNVERIFIED | — | — | — | WF-009/PF-05 |

## AudioMass documented reference (from fetched landing page, 2026-10-13)

Menus: File = Export/Download · Load from Computer · Load Sample File · **Load From URL** · New Recording · Save Draft Locally · Open Local Drafts. Edit = Undo/Redo (Shft+Z/Y), Play/Stop, Select All/Deselect, Channel Info/Flip, **Seamless Loop**, Zero-Cross Selection. Effects = **Gain, Fade In, Fade Out**, Noise Reduction (Voice), Paragraphic EQ, Compressor, Normalize, Graphic EQ (+20-band), Hard Limiter, **Delay**, Distortion, Reverb, **Audio Repair**, Speed Up/Slow Down (pitch), Speed/Playback Rate, Reverse, Invert, Remove Silence. View = Follow Cursor, Peak Separators, Timeline, Frequency/Spectrum Analyser, Multitrack Mixer, Tempo Tools, ID3 Tags. Multitrack: add/mute/solo/volume/pan/rec-trigger/delete channels. Beat: toggle markers, snap, BPM + time signature. Zoom keys: +/−/0; Tab = center to cursor. Shortcuts are Shift+key combos (Shift+C/X/V/N, Shift+Z/Y, R record, L loop, Q clear selection).

Phase 5 must test each row behaviorally on both apps with equivalent fixtures and record `VERIFIED …`/`MISSING` with evidence — not from this inventory.
