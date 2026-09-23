# Tech Doc — WaveForge conventions

> Source: Build Plan v2.2 §4, §6, §8. Summary for day-to-day work.

## Stack (pinned)

Vite 8 · TypeScript 5.9 strict (`noUncheckedIndexedAccess`) · Preact 10 + Signals ·
Zod 4 · Vitest 5 (+coverage-v8) · ESLint 10 + typescript-eslint · Prettier ·
vercel.json static deploy. Details: `adr/000`.

## TypeScript rules (ECC)

- Explicit types on **exported** functions; infer obvious locals
- `interface` for extensible shapes, `type` for unions; **string-literal unions over enums**
- **No `any`** — `unknown` + narrowing (`getErrorMessage` from `core/errors`)
- Zod schemas at every system boundary (files, URLs, IDB records, worker messages)
- Immutability at the document layer; DSP kernels follow ADR 004 exception

## Error handling (Build Plan §6)

- `core/errors.ts`: `WaveForgeError { code: 'WF-Exxx'; context?; cause? }` —
  codes are the i18n keys (`errors.WF-E102`)
- `core/result.ts`: `Result<T> = { ok: true; data } | { ok: false; error }` at boundaries
- Engine never throws across the bus; commands catch → toast + `logger.error`
- UI panes wrapped in Preact error boundaries; a white screen is a defect
- Every catch: **recover, rethrow typed, or report** — empty catches fail review
- Logger (`core/logger.ts`) is the only console consumer; keeps last 100 events,
  context redacted (basename paths, no audio bytes)

## Style gates (CI-enforced)

- Functions < 50 lines · files target 200–400 (ceiling 800, vendored exempt) · nesting ≤ 4
- No magic numbers → `core/constants.ts` named exports
- No `console.log` (ESLint `no-console: error`, logger-file override)
- i18n catalog only — no hardcoded UI copy in components

## Testing (ECC)

- TDD: RED → GREEN → IMPROVE; AAA; behavior-named tests
- Coverage thresholds (v8): lines/functions 80%, branches 75% — currently
  scoped to `src/core/**`; widens with each milestone
- E2E (Playwright) flows land M1+; unit + integration run on every push

## Git (ECC)

- Conventional commits: `feat|fix|refactor|docs|test|chore|perf|ci: summary`
- Branches `feat/<scope>`…; PRs get Vercel preview URLs automatically

## Deployment

Static → Vercel (import repo; build `npm run build`; output `dist/`; headers in
`vercel.json`). Phase 2 (M12): `api/` Node functions + MongoDB Atlas
(driver singleton, Zod-validated docs, secrets in Vercel env vars).
