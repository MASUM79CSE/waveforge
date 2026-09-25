# WaveForge — Database & Persistence Design

> **Status:** Production · v1.0 · 2026-09-25
> **Applies to:** `c0a1baa` and later
> **Related:** [ARCHITECTURE.md](ARCHITECTURE.md) · [MEMORY.md](MEMORY.md) 

WaveForge v1 is **pure client-side**: its "database" is origin-scoped
**IndexedDB** plus `localStorage` for settings. A server database
(**MongoDB Atlas** behind Vercel serverless) is designed but **deferred**
to phase-2 cloud (M12) — §3 specifies it so the client seam does not
move when cloud lands.

---

## 1. Client persistence (shipped)

### 1.1 Stores (IndexedDB, database `waveforge`)

| Store | Key | Value | Purpose |
|---|---|---|---|
| `drafts` | `id` (string, draft UUID) | Draft envelope + payload | Manual saves; listed/restored by the Drafts manager |
| `autosave` | `slot` (ring index) | Draft envelope + payload | Debounced crash-recovery snapshots (bounded ring, oldest evicted) |
| `assets` | `assetId` (hash) | Audio buffer blob | **Deduplicated** source buffers shared by lanes/clips (M9f) |
| `presets` | `id` | FX chain / preset JSON | User presets for effects and rack chains |
| `blobs` | `key` | Arbitrary binary | Misc: IR imports, exports-in-progress metadata |

All writes go through **`DraftRepository`** (the only module that opens
the DB) — the seam the phase-2 cloud will implement for remote storage.

### 1.2 Payload versioning (`WFD#`)

| Version | Shape | Introduced |
|---|---|---|
| `WFD1` | single document + view metadata | M6 (storage layer) |
| `WFD2` | + multitrack lanes/strips, project payloads | M8e |
| `WFD3` | + clip arrangement over deduped assets, **optional automation fields** | M9f / A5 |

Rules: readers accept **N and N−1**; writers emit the current version;
new fields are **optional** (no version bump for additive data — the
automation fields rode along inside WFD3). Noise prints persist in draft
**and autosave headers**, so NR survives save/reload/reopen (M7 gate).

### 1.3 Autosave & crash recovery

```
edit ──debounce──► autosave ring (slot N+1 mod K) ──► done
launch ──► compare autosave vs last manual draft
         ├─ autosave newer ─► crash-recovery banner (restore / discard)
         └─ equal/absent   ─► normal start (welcome dialog)
```

- Ring bound keeps IndexedDB usage predictable; slots are full payload
  snapshots (cheap to reason about, safe to restore).
- Recovery is user-consented — never auto-applied.
- PWA context: precached app + durable drafts ⇒ full offline workflow.

### 1.4 Settings (localStorage, non-audio)

Theme, experimental-effects gate, monitor toggle default, shortcut
profile, welcome-seen flag. Never stores audio or project data.

## 2. Data lifecycle

```
create ─► decode ─► AudioDocument (RAM) ─┐
                                         ├─► autosave ring (debounced)
edit ─► new generation ─────────────────-┤
                                         └─► manual save ─► drafts (WFD3)
import file/URL ─► asset store (hash-dedup) ◄── lanes/clips reference
delete draft ─► envelope removed; orphan assets GC'd on next open
```

## 3. Phase-2 cloud design (DEFERRED — M12, do not build yet)

> Status: **parked** until the user restarts cloud work. The design is
> recorded now so the client seam (`DraftRepository`) is stable.

**Topology:** Vercel serverless functions ⇄ MongoDB Atlas (per the
project's deploy decision). Client keeps working offline-first; cloud
adds sync, not dependency.

```
Browser                        Vercel serverless                MongoDB Atlas
DraftRepository ──sync API──► /api/auth, /api/projects ───────► collections
(pure client)                 (JWT session, rate-limited)      (validated JSON schema)
```

### 3.1 Collections

| Collection | Key fields | Indexes |
|---|---|---|
| `users` | `_id`, email (unique), hash+salt (Argon2/bcrypt), displayName, createdAt | `{email: 1}` unique |
| `projects` | `_id`, ownerId, name, payloadVer (mirrors WFD#), updatedAt | `{ownerId: 1, updatedAt: -1}` |
| `project_blobs` | `projectId`, `assetHash`, bin (GridFS/chunked) | `{projectId: 1, assetHash: 1}` unique |
| `shares` | `projectId`, token, role, expiresAt | `{token: 1}` TTL |

### 3.2 Rules

- Payload shapes mirror WFD3 (server validates version + size, never
  interprets audio).
- Uploads size-capped; per-user quota; signed, expiring share tokens.
- Sync model: **manual push/pull first** (explicit, conflict-light);
  last-writer-wins per project with server-side version stamp; autosave
  ring stays local-only (crash recovery never requires network).
- Privacy posture unchanged: cloud is **opt-in**; the pure-client path
  remains fully functional offline.

## 4. Migration & compatibility policy

1. Additive fields → optional, no version bump (A5 precedent).
2. Structural change → bump `WFD#`, ship N−1 reader for one release.
3. Server (phase-2) schema changes → expand-and-contract: additive
   first, backfill, then constrain — never a breaking rename in place.
4. Every persistence change lands with round-trip unit anchors + a
   save/reload/reopen e2e (M7/M9f convention).

---

*DATABASE.md and its gates update in the same series as any storage
change (ECC rule). Cloud work stays parked until explicitly restarted.*