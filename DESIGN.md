# WaveForge — Design System & UX

> **Status:** Production · v1.0 · 2026-09-25
> **Applies to:** `c0a1baa` and later
> **Related:** [ARCHITECTURE.md](ARCHITECTURE.md) · [docs/design/](docs/design) · [docs/design-parity-plan.md](docs/design-parity-plan.md)

WaveForge's interface follows a **pro--tool visual language** — a close,
rebrandable homage to [AudioMass](https://audiomass.co), extended with the
zone-cluster conventions of professional DAWs (Adobe Audition-style
labeled transport groups). Dark-first, canvas-centric, keyboard-complete.

---

## 1. Brand

| Token | Value |
|---|---|
| Name | **WaveForge** |
| Mark | Rounded-square badge, cyan waveform stroke, dark gradient fill + glow |
| Voice | Direct, professional, zero marketing fluff ("No uploads, no accounts, no tracking") |
| License posture | MIT; AudioMass attribution carried by `LICENSE` + `src/brand.ts` |
| Developer credit | Welcome: one line ("Developed by Mir Md. Masum", name → mailto) · About: full card (avatar + role + contacts) |

All brand strings live in one module (`src/brand.ts`) — rebranding the
product is a single-file change.

## 2. Design tokens

Tokens are CSS custom properties; the canvas palette is **derived from
CSS vars** so themes stay consistent between DOM and canvas.

- **Surfaces**: layered dark greys (page → panel → raised dialog), 
  hairline borders, soft glow on the primary mark.
- **Accent**: cyan (`#3be1ec`-family) for primary actions, playhead,
  selection border, focus rings; amber/red reserved for record and
  destructive states.
- **Waveform**: bright green-on-black (AudioMass heritage) with muted
  selection tint; lane clip blocks use per-lane hue variants.
- **Text**: 3-step hierarchy (primary / secondary / faint) — all steps
  meet WCAG 2.1 AA contrast on their backgrounds (axe-gated; the faint
  step was re-tuned to pass).
- **Type**: system UI stack; monospaced figures for the position clock
  and time readouts (tabular alignment).
- **Light theme**: full token set + canvas palette swap (D9), accent
  system shared across themes.

## 3. Layout anatomy

```
┌────────────────────────── MenuBar ────────────────────────────┐
│ File · Edit · Effects · Analyze · View · Help   (grouped)     │
├────────────────────────── TransportBar (zones) ───────────────┤
│ POSITION │ PLAY │ TRANSPORT │ STOP/PAUSE │ EDIT TOOLS │       │
│ clock    │ toggle │ ⏪⏩ ⟲ ● │ ⏸ ⏹      │ cut copy … │ SELECTION │ BEAT │ RECORD │ MASTER │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│   Timeline ruler + beat/snap row                              │
│   WaveCanvas (or LaneStack in project mode)                   │
│   · channel rail (L/R labels, per-lane strips)                │
│   · bottom amplitude axis · zoom bar · vertical zoom          │
│                                                               │
├────────────────────────── StatusBar ──────────────────────────┤
│ file · rate/channels · length │ ×1024 · zoom · time · version │
└───────────────────────────────────────────────────────────────┘
```

Design rules:

1. **Position clock first** — the leftmost transport element is the big
   monospaced position/duration readout (Audition-convention).
2. **Labeled zones** — every transport cluster sits under a small
   uppercase zone label (POSITION / PLAY / TRANSPORT / STOP-PAUSE /
   EDIT TOOLS / SELECTION / BEAT GRID / RECORD / MASTER).
3. **Standalone play toggle** — Play has its own zone; its icon/state
   flips between play and pause; stop/pause are a separate zone.
4. **Record + Master anchored right** — destructive/high-stakes controls
   live at the arm's far end, visually isolated.
5. **No truncated labels** — menus and dialogs never use literal `…`
   suffixes (user-perceived as bugs); dropdowns clip neither names nor
   overflow.

## 4. Component inventory

| Component | Behavior contract |
|---|---|
| **MenuBar** | Grouped dropdowns (Effects = 9 labeled tool sections; File/View grouped); keyboard navigable; hints show platform-correct shortcuts |
| **WelcomeDialog** | Hero: glowing logo, privacy line, centered `Open file` / `Load sample`, shortcut tips, one-line developer credit |
| **AboutDialog** | Version, tagline, full developer card (avatar with monogram fallback, name, DEVELOPER role, Email/Instagram/Discord), OK |
| **ExportDialog** | Format **cards** (WAV/MP3/FLAC) with badges + per-preset guidance, quality radios, live size estimate, progress + cancel |
| **RecordSettings** | Device picker, constraint toggles, monitor toggle (default OFF), count-in/BPM, punch source + pre-roll |
| **Takes panel** | Session takes list; a take is a normal undoable edit |
| **FX dialog** | Live analytic response curve per effect, A/B preview, per-param automation toggle + envelope authoring |
| **FX Rack** | Serial chain list (reorder/bypass), recipes, presets, JSON import/export, per-entry envelope curves |
| **Analyze panel/report** | Live meters (spectrum/loudness), full report with platform verdicts, CSV/clipboard export |
| **Dialogs/shortcuts/doctor** | Focus-trapped modals; Escape closes in deterministic chain order; doctor = self-diagnostics |

## 5. Interaction patterns

- **Selection**: drag on canvas; readout zone shows start/end/duration
  with a clear (✕) affordance + `Q` shortcut; zero-cross snapping.
- **Loop**: seamless loop toggle with region-aware playback.
- **Drag editing (clips)**: select → move / trim edges / split / duplicate;
  every mutation is one undo step; arrangement interactions have a
  dedicated e2e gate.
- **Automation envelopes**: `A` toggles envelope mode; per-lane overlay
  with knot gestures; keyboard-operable (X3 accessibility pass).
- **Undo/redo**: standard `Ctrl+Z/Y/X/C/V/A` **and** legacy shift-letters
  (`Shift+Z/C/X/V/A`), single source `src/app/shortcuts.ts`; menus render
  platform-aware hints.
- **Toasts**: non-blocking, stacked bottom-right (e.g. "Armed — check
  your level, press R to roll"); dismissible; double as guidance.

## 6. Accessibility (gated)

- axe-core **WCAG 2.1 AA zero-violations** e2e suite runs on every change.
- Full keyboard operability, including envelope canvases (no app-wide
  Tab swallowing); visible focus rings from the accent token.
- Semantic roles for menus/dialogs (`getByRole` tested); `exact` names
  locked by tests.
- Icon-only buttons carry `title`/delegated tooltips (D10).

## 7. Responsive behavior

- Verified at **1440 / 1280 / 768 / 375 px** (page-overflow guard at
  375 px is a standing e2e rule).
- Transport zones reflow into wrapped rows; menus stay reachable;
  welcome/about dialogs scale with the viewport.
- Mobile Lighthouse performance **99**; layout is usable on phones,
  though editing is desktop-first by intent.

## 8. Iconography & assets

- Inline SVG icons (no icon-font, no external requests); stroke style
  matches the mark's 2 px rounded strokes.
- Product screenshots for docs are captured from the real app via
  Playwright into `docs/screenshots/` (no mockups).

## 9. Design QA gates

| Gate | Standard |
|---|---|
| Lighthouse accessibility | **100** |
| axe-core e2e | 0 violations |
| Contrast | AA on all text tokens |
| Console | zero errors across the full shell session (twimg-CDN exception documented) |
| Page overflow | none at 375 px |
| Visual evidence | screenshot per shipped UI phase (`docs/design/`, `docs/screenshots/`) |

---

*Design changes ship with before/after screenshots and updated gates,
per the D-series convention.*
