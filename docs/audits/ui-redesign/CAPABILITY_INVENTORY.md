# CAPABILITY_INVENTORY — WaveForge @ main `22b6aba` (Phase 0, UX-0.4)

Single source of truth for "every capability that must survive the redesign" (assumption A-1:
re-homed, never removed; A-2: removal needs literal `APPROVE REMOVAL: <capability>`).
Verified against `src/app/commands.ts`, `src/app/menus.ts`, `src/app/keyboard.ts`,
`src/app/shortcuts.ts`, and component grep on `22b6aba`. The Phase-1 re-homing map must
cover every row below.

## 1. Command registry — 74 ids (`src/app/commands.ts`)

Shortcut column: `kbd` = global keyboard handler case in `keyboard.ts`;
`resolve` = plain/modified layer in `shortcuts.ts`; `—` = no keyboard path.

### File / record (10)
| id | menu | keyboard | notes |
|---|---|---|---|
| file.open | File › Import | Ctrl+O (resolve) | |
| file.url | File › Import | — | URL import dialog |
| file.sample | File › Import | — | demo.wav loader |
| file.recordSettings | File › Record | — | RecordSettingsDialog |
| record.toggle | File › Record | r (resolve) | **no dedicated kbd case; via resolve only** |
| record.punch | File › Record | — | **no keyboard path** |
| record.monitor | File › Record | m (resolve) | |
| record.metronome | File › Record | — | **no keyboard path** |
| file.export | File › Export | Ctrl+S (resolve) | ExportDialog |
| file.draftSave / file.draftOpen | File › Drafts | Ctrl+D / Ctrl+Shift+O-region (resolve) | drafts system |

(edit.* covered below; Ctrl+D = draft save per shortcuts.ts `case 'd'` under Ctrl layer.)

### Edit / clipboard (11)
edit.undo (Ctrl+Z, Shift+Z variant), edit.redo (Ctrl+Y, Shift+Y), edit.cut (Ctrl+X, Shift+X), edit.copy (Ctrl+C, Shift+C), edit.paste (Ctrl+V, Shift+V), edit.delete (Del/Backspace plain), edit.trim, edit.silence, edit.selectAll (Ctrl+A + plain `a`), edit.deselect, file.draftSave already above. edit.trim/edit.silence: menu-only (no keyboard path).

### Clips (3)
clip.split (Ctrl+Shift+X-family via resolve? verified: Ctrl layer `case 'x'`+shift paths; menu Edit › split), clip.duplicate (Ctrl+Shift+D-region), clip.delete (menu Edit). Menu membership verified in menus.ts.

### Effects (32)
fx.rack (opens FxRackDialog) + 31 effects, menu Effects with 10 group headers:
- Dynamics: fx.compressor, fx.limiter, fx.gate, fx.deesser
- Noise: fx.nr3, fx.nrPrint (NrPrintDialog), fx.rnvoice
- EQ: fx.pgeq8 (Pgeq8Dialog), fx.pgeq, fx.geq10, fx.geq20
- Reverb/Delay: fx.delay, fx.reverb, fx.reverb2 (Reverb2Dialog)
- Modulation: fx.chorus, fx.flanger, fx.phaser, fx.tremolo, fx.vibrato
- Distortion: fx.distortion
- Time/Pitch: fx.rate, fx.stretch (StretchPitchDialog)
- Amplitude: fx.gain, fx.fadeIn, fx.fadeOut, fx.normalize, fx.normalizeLufs
- Special: fx.reverse, fx.invert, fx.removeSilence
All menu-only (no keyboard paths). Effect dialogs open via EffectDialog/PromptDialogs.

### View (10)
view.zoomIn (+/= kbd), view.zoomOut (−/_ kbd), view.zoomReset (0 kbd), view.center (**registry advertises kbd 'Tab' — PHANTOM: no Tab case exists in keyboard.ts or shortcuts.ts; fabrication to fix in Phase 1**), view.follow, view.zerocross, view.axis, view.theme, view.accent, view.follow/l: plain `l` kbd toggles follow; view.* surfaced in ViewBars + menu View.

### Analyze (6)
analyze.report (report-run/report-export/report-copy/report-verdicts testids in dialog), analyze.lufs, analyze.bpm (click-bpm testid), analyze.beats, analyze.panel; analyze.* menu Analyze; menu-only.

### Automation / help (4)
automation.toggle (track-panel context, **not in any menu** — surfaced on lanes), help.welcome (reopens welcome dialog), help.shortcuts, help.about (About/credit dialog), help.doctor (diagnostics; storage-usage/rnvoice-status testids).

## 2. Menus (6) — verified structure `menus.ts`
- **File**: groups Import (file.open, file.url, file.sample), Record (file.recordSettings, record.toggle, record.punch, record.monitor, record.metronome), Export (file.export), Drafts (file.draftSave, file.draftOpen).
- **Edit**: undo, redo, —, cut, copy, paste, delete, —, clip.split, clip.duplicate, clip.delete, —, trim, silence, —, selectAll, deselect.
- **Effects**: fx.rack, —, then 10 labelled fx groups (32 fx ids total).
- **Analyze**: analyze.lufs, analyze.report, analyze.bpm, —, analyze.beats, analyze.panel.
- **View**: Zoom (zoomIn, zoomOut, zoomReset, center), Cursor (follow, zerocross, axis), Appearance (theme, accent).
- **Help**: help.welcome, help.shortcuts, help.about, help.doctor.
- Known gap (finding F-2): MenuBar has **no APG keyboard** behavior (no arrow-key roving, no Escape handling verified) — 156-line component, click-only.

## 3. Keyboard surfaces (global)
- `keyboard.ts` cases: Space (play/pause), ArrowLeft/Right (seek), Home/End, `l` (follow), +/= and −/_ (zoom), 0 (zoom reset), q/Q (~), ~.
- `shortcuts.ts` resolveShortcut: plain r/p/m; Ctrl layer z/y/x/c/v/a/o/d/s; plain s/x/a/delete/backspace; Shift layer z/y/x/c/v/a/n/s.
- **Integrity findings:** F-1 `view.center` advertises `Tab` (registry label) but no Tab handler exists anywhere — phantom shortcut must not be re-advertised in v2; F-3 record.punch / record.metronome have no keyboard path (decide in Phase-1 spec whether to assign one; that is an addition, allowed).

## 4. Testids (DOM contract) — static, grep-verified
analysis-report, click-bpm, clip-led, count-in, countin-bars, drafts-dialog, metronome-toggle, monitor-toggle, punch-button, punch-preroll, rack-add, rack-apply, rack-presets, record-toggle, report-copy, report-export, report-run, report-verdicts, restore-banner, rnvoice-status, storage-usage, studio-monitor, take-discard, takes-list, transport-pause, transport-play, transport-seek-back, transport-seek-fwd, transport-stop, update-banner (30).

## 5. Testids — dynamic patterns
`clips-${name}`, `automation-${name}` (TrackLanes), `export-format-${id}` (ExportDialog), `fx-envelope-${key}`, `fx-env-count-${key}` (FxCurveEditor), `rack-row-${i}` (FxRackDialog), `draft-${name}` (DraftsDialog). (7 patterns.)

## 6. Dialogs (Modal.tsx hosts role="dialog"; mount set in Dialogs.tsx)
Welcome (first-run, Load sample), Export, Drafts/Drafts list (drafts-dialog testid), SaveDraft, FxRack, Effect (generic effect UI), Pgeq8, NrPrint, Reverb2, StretchPitch, RecordSettings, Metadata, Url (file.url), Prompt(s), About/credit + Shortcuts + Doctor surfaces via help.* commands. (15 component files under `src/app/components/` matching *Dialog*; Dialogs.tsx mounts them.)

## 7. Non-registry capabilities that must also survive (A-1)
- Welcome dialog flow incl. Load sample → demo.wav.
- Track lanes: per-track header controls, clip drag/split/duplicate/delete, automation lane toggle (automation.toggle), mute/solo/etc. per TrackLanes.tsx.
- Waveform canvas interactions: click-seek, drag-selection, zoom (canvas pane, CanvasPane.tsx 93 lines) — canvas must never be the only way (§9 accessible summary + keyboard select/seek/zoom).
- Status bar info (file name, sample rate, channels, duration, zoom, v1.0.0) + toasts (Loaded demo.wav / Armed / Record; toast-close button found 23×17 — finding F-4 below-24 target).
- i18n en/bn (`waveforge.locale`), themes (`waveforge.theme`), BPM/beat grid (BEAT/SNAP, click-bpm), master/track VOL meters strip, record-arm flow (takes-list, take-discard, punch-preroll, count-in/countin-bars).
- Update/restore banners (update-banner, restore-banner).

## 8. Findings register (Phase 0)
- **F-1** phantom shortcut: `view.center` advertises kbd `Tab`; no Tab handler exists. Fix in Phase-1 registry truth pass.
- **F-2** MenuBar lacks APG keyboard support. Redesign in Phase 2/3 must add roving menus (WAI-ARIA menu pattern) — capability addition, allowed.
- **F-3** record.punch, record.metronome, file.recordSettings, fx.* (32), analyze.* (5), edit.trim, edit.silence, edit.deselect, view.follow/zerocross/axis/theme/accent have no keyboard path — Phase-1 spec decides the shortcut map (documented, not silent).
- **F-4** smallest focusable/clickable target in baseline = toast-close 23×17 px (< 24×24, no spacing exception — adjacent to toast edge). Must be fixed in v2 (Phase 5 a11y gate).
- **F-5** baseline tab stops = 39 (menu bar contributes 7 top-level items; toolbars contribute per-control stops) — v2 toolbars collapse to one stop each per APG.

Phase-1 re-homing map must reference every id in §1 (74) plus §7 rows. Testid contract (§4–5)
is preserved verbatim in v2 (carried evergreen rule).
