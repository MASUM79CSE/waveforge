# ADR 000 — Project Scaffold, Toolchain Pins & Research/Reuse Gate (M0)

**Status:** Accepted · **Date:** 2026-09 · **Phase:** M0

## Context

ECC `development-workflow.md` step 0 requires registry/GitHub/docs research before any
implementation. The stack direction was already fixed in Build Plan v2.2 §8.0
(Vite + TS + Preact/Signals, Vercel, Atlas later). M0 must pin concrete versions
that are mutually compatible **today**, from the live registry.

## Research findings (checked 2026-09, npm registry)

| Package | Latest at check | Decision |
| --- | --- | --- |
| vite | 8.3.0 | ✅ take (^8) — @preact/preset-vite peers `…\|\| 8.x` |
| @preact/preset-vite | 2.10.6 | ✅ take |
| preact / @preact/signals | 10.29.8 / 2.11.2 | ✅ take |
| **typescript** | **7.0.2** (native-speed) | ⚠️ **pin 5.9.3 instead** — typescript-eslint 8.70.1 peers `<6.1.0`; TS7 support lands later (tracked for §8.5 watchlist) |
| vitest / @vitest/coverage-v8 | 5.0.1 / 5.0.1 | ✅ take — peers vite ^6.4 \|\| ^7 \|\| ^8 ✓ |
| zod | 4.6.5 | ✅ take (v4; only version-stable APIs used) |
| eslint | 10.11.0 | ✅ take — ts-eslint peers `^10` ✓ |
| typescript-eslint | 8.70.1 | ✅ take |
| prettier | 3.9.9 | ✅ take |

## Decisions

1. **Manual scaffold over `create-vite` template** — the template adds demo code we
   would delete; hand-rolled scaffold gives exactly the ECC structure (KISS/YAGNI).
2. **No ESLint-Prettier integration package** — typescript-eslint `recommended`
   (non-type-checked) carries no formatting rules; no conflict to resolve; one less dep.
3. **`noUncheckedIndexedAccess` ON** — stricter than stock `strict`; worth the verbosity
   for sample-index DSP code arriving in M1+.
4. **Coverage gate scoped to `src/core/**`** for M0 (per Build Plan exit gate:
   "coverage ≥ 80% on core/"); the `include` list widens as layers gain tests
   (engine/io/storage in M1+).
5. **No component-test framework yet** — M0 has no testable UI logic beyond pure
   core; jsdom + testing-library arrive with M1 renderer work (YAGNI).

## Consequences

- Renovate/CI keep these pinned; upgrades go through a research note like this one.
- TS 5.9.3 → 7.x migration is a deliberate future ADR, not an accidental drift.
