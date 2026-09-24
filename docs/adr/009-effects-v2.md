# ADR 009 — Effects v2 architecture

**Status:** accepted · **Plan:** `docs/effects-v2-plan.md` (E1–E6) · **Ships with:** E1 (mastering), E2 (parametric EQ)

## Context

The effects-v2 plan extends the M3 registry (ADR 005) with accuracy-gated
kernels. Two implementation pressures needed architectural answers:
wet tails for pure kernels, and effects whose parameter space is
structured (8 EQ bands) rather than a flat list of scalars.

## Decisions

### D1 — New kernels live in `src/fx/*.ts`, pure, registry-registered

`mastering.ts`, `compressor.ts`, `biquad.ts`, `paramEq.ts` follow the ADR
005 split: pure kernels (unit-tested, browser-free), registry defs in
`defs.ts` validate/clamp every parameter before `process` runs. The
composition-root rule is now explicit: **`fxActions` imports `../fx/defs`
for its side effect** — without it the browser registry stays empty (M3
defect, caught by the E1 e2e).

### D2 — Structured effects bridge to flat numeric params

`fx.pgeq8` generates 32 flat `ParamSpec`s (4 per band: type enum, freq,
gain, Q) so the existing generic plumbing — `validateParams` clamping,
`applyEffect`, worker-free kernel preview — works unchanged. Pure bridges
`eqBandsFromParams` / `bandsToParams` convert between the user model
(`EqBand`) and the flat shape; both are unit-tested. Structured UIs
(`Pgeq8Dialog`) are separate components mounted by `App` on the dialog id.

### D3 — The dialog curve is the apply path

`eqCurveDb` draws the response from the same RBJ coefficients the audio
path uses (`biquadMagnitudeDb`). No parallel "UI math" exists to drift
from the DSP; the analytic function is itself anchor-tested against
probe-sine measurements (±0.3 dB).

### D4 — Bypass is structural, not a gain of zero

Zero-gain peaking/shelf bands are *skipped*, so bypass is bit-exact
(filter state never touched) rather than "multiplied by unity". Anchored
by a `toEqual` test.

### D5 — RBJ cookbook is the EQ design authority; BS.1770 stays special

The M5 K-weighting failure was BS.1770-specific constants misused in an
RBJ shape. General EQ uses the Audio EQ Cookbook directly and proves
correctness with probe-sine anchors. `biquad.ts` carries this note so the
lesson cannot scare future work off cookbook designs.

### D6 — Profile budgets bind to uninstrumented runs

`[profile]` logs printed by tests record the number that feeds the §8.5
B1 trigger; v8 coverage instrumentation slows hot loops ~3×, so in-test
smoke guards are set at 5 s. E1: 621–1147 ms. E2: 219 ms (budget 600 ms).

## Consequences

- E3–E6 plug in with zero architecture change: E3 as plain kernels, E4 as
  kernel + `tail` (plan §0, still pending — needed for stretch/convolver
  region growth), E5 behind `settings.experimentalFx` (setting exists),
  E6 as STFT kernels.
- The registry-order and kind-map expectations in `fxRegistry.test.ts`
  are maintained by hand — intentional, they are the review gate that
  forces new effects to be consciously added (and documented here).
