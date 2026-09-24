# WaveForge ↔ AudioMass Design Analysis (UI parity for the "light version" → advanced)

**Date:** 2026-09-24 · **Method (ECC evidence-first):** fetched the live
`audiomass.co` DOM (rendered text map), its production stylesheet
(`all.css`, 53 KB) and app bundle (`all.build.js`, 425 KB); extracted the
complete token system, component anatomy and canvas colors from source.
Compared component-by-component against WaveForge at `a1157f8`.

> Attribution: AudioMass by Pantelis Kalogiros (MIT). WaveForge is a
> ground-up reimplementation; visual parity here means matching the
> *design system*, not copying assets. The IcoMoon icon font is replaced
> with inline SVG (no font dependency, license-clean, preview-safe).

---

## 1. The AudioMass design system (extracted, live 2026 site)

### 1.1 Tokens (`:root` of all.css)

| Role | Value | WaveForge today | Verdict |
|---|---|---|---|
| bg-0 (page) | `#07080a` | `--canvas-bg #0a0e13` / `--bg #0d1117` | close, bluer |
| bg-1..bg-4 ladder | `#0e1013 #14171c #1c2026 #262b32` | `--panel #131a23`, `--panel-raised #18212c` | PARTIAL (no 5-step ladder) |
| fg-0..fg-3 ladder | `#e8edf0 #9aa3ad #6a7380 #3a414a` | `--text #dbe4ee`, `--text-dim #8b96a5`, `--text-faint #8a94a2` | PARTIAL |
| accent | `#5af2ff` (cyan) + `-2 #99c2c6`, `-soft rgba(90,242,255,.12)`, `-glow rgba(90,242,255,.45)`, `-ink #041014` | `--accent #3ddad0` (teal) + dim/line | PARTIAL — different hue, no glow/ink roles |
| rec | `#ff3355` (+glow) | `--danger #ff6b6b` | PARTIAL |
| solo `#28c8f0` · warn `#f5c542` · ok `#6ecc87` · playhead `#ff8c35` | — | `--playhead #ffb454`, `--ok #58d68d` | PARTIAL |
| borders | `rgba(255,255,255,.07)` / `.04` / hover accent `.4` | `--line #232d3a` (opaque) | PARTIAL |
| radii | `--r 2px`, `--r-md 4px`, `--r-lg 8px` | `--radius 8px`, `--radius-sm 5px` | DIFFERENT (AM is squarer) |
| spacing | `--s1..s4 = 4/8/12/16px` | ad-hoc px values | MISSING |
| motion | `160ms cubic-bezier(.2,.7,.3,1)` everywhere | none systematized | MISSING |
| shadows | glow ring `0 0 0 1px bd-h + 0 0 10px glow`; `inset 0 1px 0 rgba(255,255,255,.04)` | none | MISSING |
| type | `system-ui…` + `ui-monospace…` (same stacks as ours) | identical | MATCH |

### 1.2 Canvas colors (from the JS bundle)

| Element | Value |
|---|---|
| Waveform | **`#9dff6a`** (light green), dim variant for muted channels |
| Playhead / cursor | `#ff8c35` (orange), 1 px, with cursor marker |
| Timeline / dB labels | `#d9d955` on `rgba(0,0,0,.65)` strips |
| Lane/panel grid accent | `#365457` family |
| Region/selection | accent-soft fills, accent borders |
| Marker palette | `#9dff6a #5af2ff #f557d2 #ffd15c #ff8c35 #b9c6ff` |

WaveForge canvas today: teal `#3ddad0` wave on `#0a0e13`, orange playhead,
no amplitude axis, no peak separators. Screenshot-verified extras: AM shows
a large mono `00:00:000` clock leftmost in the control row, a red round
record button, edit-icon cluster (copy/paste/cut/S), vertical zoom [+/−]
at the workspace's bottom-left, and a bottom scrollbar with [+ − R] zoom
buttons. (docs/design/*.png)

### 1.3 Layout anatomy (rendered DOM map)

```
┌ Header: logo "AudioMass" · File Edit Effects View Help        (pk_hdr, pk_btn, pk_menu)
├ Control row(s), 46px gradient groups (bg-2→bg-1, 1px bd, r-md, inset-hi):
│   [icon toolbar (pk_tbc): Copy Paste InsertSilence …]  [time display]
│   [transport: play/stop/loop/record + shortcut tooltips]
│   [selection: Start / End / Duration + Clear (Q)]      [BEAT/SNAP/BPM row]
├ Waveform workspace: LEFT dB scale column (-Inf..0) · ruler top · lanes
│   · channel strips (L/R mute/solo, volume, pan) · drag-n-drop overlay
└ Zoom bar: +/− horiz (+/−) · [R] reset (0) · vertical ± zoom
Modals: welcome (tips + OK) · progress ("Please wait… 0% cancel")
Tooltips (custom) · context menu · toasts (oneup)
```

---

## 2. Gap table (component by component)

| # | Area | AudioMass | WaveForge | Verdict |
|---|---|---|---|---|
| G1 | Design tokens | 5-step bg ladder, 4-step fg, cyan accent + glow roles, radii 2/4/8, spacing scale, 160 ms motion, glow/inset shadows | 3 surface tones, teal accent, opaque lines, 8/5 px radii, no motion/shadow tokens | **PARTIAL → D1** |
| G2 | Icon toolbar | Icon button row (cut/copy/paste/silence…) with shortcut tooltips + disable states + overflow scroll | none — edits/effects live in text menus only | **MISSING → D2** |
| G3 | Selection readout | Dedicated group: Start / End / Duration + "Clear Selection (Q)" | selection duration only, inside status bar | **MISSING → D3** (Q already bound: `edit.deselect`) |
| G4 | Time display | Mono time group, cursor + total | already present (`transport-time`, mono) | MATCH (restyle in D1) |
| G5 | Transport | play/pause (Space, Shift+Space pause), stop, loop (L), record (R), seek arrows | seek-start/play/stop/loop + record + L/R mute + volume | MATCH (restyle in D1; Shift+Space = pause candidate) |
| G6 | Canvas skin | green `#9dff6a` wave, orange cursor, dB scale column, peak separators, `#d9d955` labels | teal wave, orange playhead, no dB column, no separators | **PARTIAL → D4** |
| G7 | Zoom bar | bottom button group: horiz ± , reset (0), **vertical ±** | menu + keyboard only | **MISSING → D5** (vertical zoom is new state) |
| G8 | Beat row | BEAT toggle · SNAP · BPM · time signature | BPM detection + `snapEdgeToBeat` engine exist; no UI row | **PARTIAL → D5** |
| G9 | Amplitude axis | **horizontal dB axis along the bottom edge** (-Inf..0, 2 dB steps) + L/R labels on the left rail (screenshot-verified) | none (status bar shows ×spp only) | **MISSING → D4** |
| G10 | Welcome modal | tips + OK (shift-key usage, sample hint, GitHub) | welcome exists (load sample) | MATCH (restyle + tips in D6) |
| G11 | Progress modal | "Please wait… N% + cancel" | export dialog has progress | MATCH (restyle D6) |
| G12 | Tooltips w/ shortcuts | custom tooltip system, every icon | `title` attributes only | **PARTIAL → D2** (title + aria-label; richer tooltip optional) |
| G13 | Channel strips | per-channel mute/solo/volume/pan + flip | L/R mute + swap only | PARTIAL — v2 backlog (pan needs engine work) |
| G14 | Menus | File/Edit/Effects/View/Help | File/Edit/Effects/Analyze/View/Help + experimental | MATCH+ (Analyze is our extra) |
| G15 | Drag-n-drop overlay | full-window drop hint | drop handled on canvas + empty state | MATCH (overlay polish D6) |

### Where WaveForge is already *more advanced* (keep, don't regress)

21 effects (vs ~15) incl. LUFS normalize, de-esser, noise-print NR, parametric
EQ with live response curve; WSOLA stretch/pitch (experimental); drafts +
30 s autosave ring with crash-restore banner; PWA offline; doctor
diagnostics + local error log; focus-trapped modals; WCAG-AA text tokens;
zero-console-error e2e gate; worker-first DSP (no main-thread encoding);
Vercel-ready.

---

## 3. Constraints carried into the plan

1. **Rebrand stays**: WaveForge name/logo/brand.ts untouched; only the skin
   converges. MIT attribution files unchanged.
2. **A11y regression guard**: AudioMass's own `--fg-2 #6a7380` is 3.9:1 —
   below AA. We adopt the ladder but keep our ≥4.5:1 rule for body text
   (deviation documented in D1).
3. **No behavioral regressions**: every phase re-runs the full gate
   (415 unit @ 96/75, 21 e2e, build, lint). Canvas color changes are
   visual-only; anchor tests untouched.
4. **ECC**: TDD where behavior exists (toolbar wiring, shortcuts, zoom
   state), conventional commits per phase, docs synced, ≤400-line files.

---

## 4. Verdict

Functionality parity: **achieved and exceeded** (M0–M7 + effects-v2).
UI parity: **the real gap** — tokens (G1), icon toolbar (G2), selection
readout (G3), canvas skin (G4/G6/G9), zoom/beat rows (G7/G8). The phased
plan in `design-parity-plan.md` closes G1–G12 and then advances beyond
AudioMass (per-channel pan backlog G13, richer tooltips G12).
