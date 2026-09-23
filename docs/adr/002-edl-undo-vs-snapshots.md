# ADR 002 — EDL Copy-on-Write Undo vs Full-Buffer Snapshots

**Status:** Accepted · **Phase:** design (implemented M2)

## Context

AudioMass snapshots whole `AudioBuffer`s per undo step with a 1.5 GB byte budget.
Memory scales O(history × file size) and forces a low cap on long files.

## Decision

WaveForge records **edit decisions, not audio**: each command stores its inverse
operation plus any newly-created slices (copy-on-write). Properties:

- cut/trim/delete cost O(1) memory (range metadata only)
- pastes/mixed ops store only the new slice
- LRU byte budget bounds total history; budget exhaustion drops *oldest* steps
  beyond a guaranteed minimum (10), never the newest

## Consequences

- Commands must be expressible as forward+inverse operations — constrains M2
  command design (good: forces clean command layer).
- Whole-buffer snapshot remains the fallback for exotic transforms that cannot
  express an inverse cheaply; budget still applies.
