# ADR 004 — Immutability Rule vs DSP Kernel Performance

**Status:** Accepted (documented exception) · **Phase:** standing policy

## Context

ECC `coding-style.md` marks immutability **CRITICAL**. Audio DSP kernels
(gain ramps, fades, peak scans, resampling) process multi-million-element
`Float32Array`s; allocating a fresh array per step — or treating samples as
immutable — is not viable.

## Decision

- **Document layer (enforced immutable):** published `AudioBuffer`s and
  application state are never mutated in place; edits produce new buffers or
  EDL entries (ADR 002); UI state flows through signals with immutable updates.
- **Kernel interior (exception):** sample loops mutate **locally-owned**
  `Float32Array`s inside workers or stage buffers that are never shared before
  publication. No aliasing across layers.

## Consequences

- Every kernel module carries a header comment referencing this ADR.
- Review checklist: any mutation of a *shared/published* structure is a
  CRITICAL review finding; mutation inside a stage buffer is compliant.
- "Stage-then-swap" (Build Plan §6.3) makes the exception crash-safe: a failed
  kernel leaves the published document untouched.
