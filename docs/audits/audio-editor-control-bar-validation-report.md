# WaveForge Control Bar — Validation Report (Deliverable 3, Phase 6)

**Date:** 2026-10-15 · **Program:** Control Bar v2 (`ui/control-bar-v2`) · **Base:** `main`@`3691995`
**Scope:** validates the delivered v2 control bar against every finding of the audit
(Deliverable 1, §4 hypotheses H-01..H-12, §5 findings F-01..F-11) and the plan's phase
acceptance criteria. Evidence columns point at committed tests/probes; vocabulary per protocol.

## 1. Finding-by-finding validation

| Finding | Audit verdict | v2 status | Evidence |
|---|---|---|---|
| H-01 no switchable clock | CONFIRMED | **FIXED** — time (m:ss.mmm) / samples / bars&beats (bars hidden while tempo unknown, CB-D10); format persisted | `clock.test.ts` 13/13; `cb2.spec` switch+reload tests |
| H-02 selection not editable | CONFIRMED | **FIXED** — Start/End/Length editable+validated, commits through the canvas snap pipeline | `cb3.spec` 11/11 incl. snap-literal + clamp |
| H-03 tab stops / no roving | CONFIRMED | **FIXED (v2)** — transport toolbar roving (1 tab stop, inputs excluded), APG menubar | `cb2.spec` roving tests; `cb4.spec` menubar model |
| H-04 icon-only naming/pressed gaps | PARTIALLY CONFIRMED | **CLOSED (v2)** — every `.cb2` interactive carries an acc name (aria/label-for/text/title chain, asserted); ALL toggles carry `aria-pressed` from signals (loop/record/monitor/swap included) | `cb4.spec` name+pressed sweep; `cb3.spec` |
| H-05 / F-01 invisible-scroll bar, page h-scroll | CONFIRMED | **FIXED** — v2 row internal overflow **0 px at 1440/1280/1024/768/390/320** (was ≤1871); page h-scroll 0; no hidden-scrollbar pattern (relocation panel instead) | `cb5.spec`; `cb5-probe.mjs` before/after; 12+12 PNGs |
| H-06 / F-02 sub-24 px targets | CONFIRMED | **FIXED** — 18 sub-24 boxes → **0** (inputs, titles, clip-led 24×24 hit, sliders); compact tier keeps ≥24 | `cb5.spec` measured sweeps |
| H-07 clock jitter | REFUTED as defect; hardening kept | **HARDENED** — `tabular-nums` + fixed slots; box/cursor/separator p2p **0 px**; CLS byte-identical to v1 baseline (toast-sourced) | `jitter-v2.json`; F-05 spec |
| H-08 color-only state | PARTIALLY CONFIRMED | **FIXED (v2)** — programmatic pressed state on every toggle; state never color-only | `cb3/cb4` assertions |
| H-09 permission/engine feedback | PARTIALLY CONFIRMED (both cells measured) | **UNCHANGED, VERIFIED** — denied-permission arm fails cleanly (toast + polite live region, stable bar, clean retry); v2 arm shift 0 px. Persistent engine-state chip remains backlog (T-CB-11) | `permission-denied.json`; `cb5.spec` no-audio |
| H-10 undo/redo tooltips | REFUTED | CLOSED Phase 1 (coverage gap, no defect) | audit §4; plan §8 |
| H-11 menubar APG keyboard | CONFIRMED | **FIXED (v2)** — full APG model (arrows/Home/End/Enter/Escape/Tab, focus management); v1 untouched (CB-D17) | `cb4.spec` + `cb4adv` 6/6 |
| H-12 long localized labels | NOT RUN | **PARTIAL** — real bn catalog ships and renders at 390 px without overflow; pseudo-localization harness remains T-CB-3 | `cb5.spec` bn test; `cb4Tooltips` |
| F-03 toolbar keyboard model | — | **FIXED (v2)** — roving toolbars (transport/tempo/selection) + APG menubar | `cb2/cb4` |
| F-04 programmatic state gaps | — | **FIXED (v2)** — see H-04 | same |
| F-05 arm-time layout shift (+122 px) | — | **FIXED — MET: arm AND roll zoneDeltas 0 px @1280 & 390** (reserved, never-unmounted slots) | `cb3.spec` F-05 test; `jitter-v2.json` |
| F-06 clock single-format/duplicated | — | **FIXED** — switchable bar clock; status raw-seconds readout now LABELLED (format unification rides the flag decision — declared interim) | `cb4.spec` both-flag label test |
| F-07 selection numeric editing | — | **FIXED** — see H-02 (F-11 root pattern; DOM-authoritative commit CB-D16 lineage) | `cb3/cb3adv` |
| F-08 master volume component-local | — | **FIXED (v2)** — canonical `masterVolume` signal(0.9) → engine by effect; persistence deliberately NOT shipped (CB-D9 ratified — session-scope volume; revisit only with a settings story) | `cb3.spec` signal/reload tests |
| F-09 mixed routing | — | **FIXED (v2)** — every v2 control routes through the registry (incl. new `transport.nudgeBack/Fwd`; SNAP demoted from raw signal write) | `cb2/cb3/cb6` specs |
| F-10 scattered mode clusters | — | **IMPROVED** — metronome+count-in live on the bar's record cluster; BPM chip explains its empty state; zero-cross stays a View command (single home; acceptable) | `cb3.spec`; inventory |
| F-11 stale-input race | FIXED Phase 1 | **ROOT-FIXED** — uncontrolled+ref-init pattern applied to all dialogs (Phase 2) AND the v2 selection fields (Phase 5); truth guarded by dedicated e2e | E-CB-013/019; `cb3adv` |

## 2. Phase acceptance vs delivery

| Phase | Acceptance | Result |
|---|---|---|
| 2 Foundation | flag default OFF; flag-OFF DOM identical; roving APG toolbar; clock | **MET** (report §9) |
| 3 Editing clusters | field edit → engine selection + undo-safe; inline error; arm shift 0 px @1280/390; no control lost | **MET** (§10; undo-safe = path symmetry with v1 selection setters — verified) |
| 4 Menubar + status | APG menubar; H-04 closed; every v2 string en+bn | **MET** (§11) |
| 5 Responsive + a11y | 0 overflow all widths; ≥24 px; axe clean; screenshots 6×2 | **MET** (§12) |
| 6 Parity + decision | parity zero-diff; gates green both flags; bundle ≤ budget; report + screenshots; default-OFF recorded | **MET** (this report; parity.md; CB-D20) |

## 3. Final gates (exact final build `index-QJPVQ7Q0.js`, 58,105 B gz ≤ 123,661)

- typecheck 0 · eslint 0 · unit **102 files / 854 tests**
- e2e plain **158 passed / 0 flaky** (csp spec red only without `CSP_ENFORCE=1` — CB-D6 composition; enforced **2/2 PASS**)
- Lighthouse: desktop **P100/A100/BP100/S91 both flags**; mobile **P97 (OFF) / P96 (ON)**, **A100 both flags** (S91 = vite-preview robots artifact)
- cb suites cb2/cb3/cb3adv/cb4/cb4adv/cb5/cb6: **70/70** at the final tree

## 4. Carried tickets (none block the delivered scope)

T-CB-1 time signatures · T-CB-2 timecode/fps · T-CB-3 pseudo-loc harness · T-CB-4 output meter ·
T-CB-5 per-digit selection editing · T-CB-6 EffectDialog/ExportDialog F-11 pattern audit ·
T-CB-8 markers-persist flake (pre-existing, proven) · T-CB-9 peakLimits canvas flake ·
T-CB-10 **RESOLVED** (superseded by the shortcut-truth test — hints are registry-derived and
binding-verified) · **T-CB-11 (new)** persistent engine/mic state chip (audit H-09 residual,
backlog input).

## 5. Flag default recommendation (CB-D20)

**Recommendation: flip `ui.controlBarV2` to default ON for the next release**, after human
review of the deliverables (screenshots `docs/screenshots/control-bar-v2/`, this report, the
parity table). The v2 bar meets every master-prompt requirement and gate; the carried tickets
are enhancements, not gaps. **Decision recorded per the plan: the default stays OFF in code
until that approval** — the flip is a one-line change plus the Phase-5 build-flag matrix re-run.
