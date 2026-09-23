# ADR 003 — Worker Topology

**Status:** Accepted · **Phase:** design (workers land M1+)

## Decision

One dedicated worker per concern, message-typed, all data moved via
**transferable ArrayBuffers** (zero-copy), each worker supervised by its
main-thread client (restart + single retry, then degrade — Build Plan §6.2):

| Worker | Concern | Landed |
| --- | --- | --- |
| `peaks.worker.ts` | min/max mip tiles + raw sample slices, tile LRU cache | M1 |
| `wav.worker.ts` / `mp3.worker.ts` / `flac.worker.ts` | export encoding, progress messages | M4 |
| `tempo.worker.ts` | BPM autocorrelation | M5 |
| `recorder` AudioWorklet | mic capture ring buffer | M4 |

## Rationale

- One concern per worker = independent lifetime, small message protocols,
  easy supervision, no head-of-line blocking (e.g., a long FLAC encode can
  never stall waveform tiling).
- Zod schemas validate every worker message at the boundary (ECC TS rules).

## Consequences

- A small `workers/protocol.ts` per worker keeps contracts testable.
- Worker count stays ≤ 5; no pool machinery unless profiling demands it (§8.5 B1).
