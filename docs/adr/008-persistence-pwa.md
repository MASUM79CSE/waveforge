# ADR 008 — Persistence & PWA (M6)

**Status:** accepted · **Supersedes:** plan §8 storage/PWA rows ratified at M0 (implementation detail level)

## Context

M6 adds local persistence (drafts, autosave, settings) and offline capability.
Constraints carried from the build plan (§8):

- IndexedDB via **`idb`** + native **`CompressionStream('gzip')`** — no Dexie
  (heavy), no raw IDB (boilerplate), no LZ4 wasm (platform replaces it).
- PWA via **`vite-plugin-pwa` (Workbox 7)** — hand-rolled SW rejected
  (no versioning discipline). SW changes are a security-review trigger (§5).
- Repository pattern (§4.4): `findAll / findById / save / update / delete`,
  mockable; the future `CloudProjectRepository` (M12) implements the same
  surface.
- Self-recovery (§6.3): autosave ring bounds data loss to ≤ 30 s; quota
  guard never loses data silently; corrupt records never block the list.

## Decisions

### D1 — Two-store layout, metadata decoupled from payloads

DB `waveforge` v1:

| store | key | contents |
|---|---|---|
| `drafts` | `id` | draft **metadata only** (name, dates, format facts, hash, sizes) |
| `draftBlobs` | `id` (same key) | compressed `Uint8Array` payload |
| `autosave` | `id = 'ring'` | latest autosave snapshot (meta + payload in one record) |

Rationale: the drafts **list** must not deserialize megabytes of PCM
(`findAll` = `getAll('drafts')` is cheap); `findById` joins both stores in one
transaction; delete removes both rows atomically.

### D2 — Draft payload format `WFD1` (pure module, fully unit-tested)

```
magic  'WFD1' (raw) | 'WFR1' (uncompressed fallback)   4 B
u32 LE header length
JSON header  { v:1, name, sampleRate, channels, length, savedAt,
               cursor?, selection?: {start,end} }
interleaved float32 PCM (channels × length samples)
```

- gzip via `CompressionStream` when available; **fallback raw `WFR1`** when
  missing (§6.3 degradation matrix — each path unit-tested).
- The decoder sniffs the magic, so raw records stay readable forever
  regardless of platform capability.
- Header validated with **zod** on decode — a corrupt/truncated record
  surfaces as `WF-E402`, never as a crash or a blocked list.
- `hashPcm()` = SHA-256 over the PCM bytes (WebCrypto; FNV-1a fallback
  outside secure contexts) — the identity anchor for e2e flow #5.

### D3 — Repository + autosave are separate modules; the controller is injectable

- `IdbDraftRepository implements DraftRepository` over the two stores.
- `AutosaveController` (§6.3.2): snapshot fires on a 30 s debounce **or**
  every `AUTOSAVE_OPS` (8) edit operations, whichever first (1 s micro-
  debounce so bursts write once). Clock + persistence injected → testable
  with fake timers + fake-indexeddb. One record (`ring`): loss bounded to
  the last debounce window, which the plan's ≤ 30 s bound allows.
- Crash recovery: at boot, if an autosave record exists, the shell shows a
  **restore banner** (Restore / Discard) — a white screen is a defect (§6.3).

### D4 — Quota guard before writes, WF-E401 as the only quota path

`navigator.storage.estimate()` is checked before draft/autosave writes; ≥ 90%
projected usage, or a caught `QuotaExceededError`, maps to `WF-E401`
("storage full — manage your drafts") and **opens the drafts manager** —
never silent data loss (§6.3.5). Corrupt record on read → `WF-E402` → row
renders as damaged with delete-only actions, list stays usable.

### D5 — Settings boundary

`storage/settings.ts` is the single localStorage boundary (namespaced,
zod-validated reads, typed keys). The M1–M5 ad-hoc `readStoredBool` helpers
in `state.ts` delegate to it. Autosave on/off is a setting (default on).

### D6 — PWA: prompt update flow, full precache

- `vite-plugin-pwa`, `registerType: 'prompt'`: an update never applies
  mid-session (audio work must never be interrupted); `UpdateBanner` offers
  **Reload** via `onNeedRefresh`.
- Precache covers the whole shell incl. workers, wasm and `demo.wav`
  (offline must include record/export/FLAC paths, not just the UI).
- Dev server runs without SW; the offline e2e (flow #6) runs in a dedicated
  Playwright project against `vite preview` (production build, real SW).
- Manifest: brand name/colors, maskable PNG icons generated from the SVG
  mark (192/512).

## Consequences

- New deps: `idb` (runtime), `fake-indexeddb` + `vite-plugin-pwa` (dev).
- e2e numbering: plan flow #5 (draft round-trip, hash identity) and #6
  (offline reload) land in `tests/e2e/draft.spec.ts` / `offline.spec.ts`;
  the M5 analysis specs are retitled `analysis: …` to free the numbering.
- Security review (§5) covers the IDB layer and the generated SW before the
  phase closes.
- OPFS (>2 GB sessions, §8.5) and the M12 cloud repository stay future work;
  both slot in behind the same interfaces.
