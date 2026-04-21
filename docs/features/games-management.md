# Games Management

**Requires reading:** [requirements.md#games-management](../requirements.md#games-management) | [hot-update.md](hot-update.md) | [config-management.md](config-management.md) | [infrastructure.md#asset-pipeline-r2](../infrastructure.md#asset-pipeline-r2)

---

## Overview

Game visibility and playability are controlled by **two independent gates**:

1. **Client gate (catalog)** — the client ships a static game catalog (slug list + metadata: banners, icons, display name, intro/rule images). The catalog is hot-updated alongside the main app. Only slugs that appear in the catalog are ever rendered.
2. **Server gate (status)** — for each catalog slug, the client looks up the server's `status` (int enum: `0` under_maintenance, `1` coming_soon, `2` enabled, `3` disabled) from `GET /v1/config`. `3` hides the tile; `2` allows Play; `0` / `1` show the tile with a badge and block Play.

The remote bundle contains **only** the INGAME scene, scripts, and assets — no metadata, no catalog. Metadata lives with the client catalog; `remote_url` + `remote_version` on the server track where the current bundle is and which version it is. CI/CD writes `remote_url` / `remote_version` after a bundle publish. Admins set `status` via the dashboard.

---

## Responsibilities

| Concern | Source of truth | Update mechanism |
|---------|-----------------|-------------------|
| Game catalog (list of slugs) | Client (hot-updated) | Main-app hot update — see [hot-update.md](hot-update.md) |
| Per-game metadata (display name, icons, banners, intro/rule images) | Client (hot-updated) | Same hot update as catalog |
| Per-game `remote_url` + `remote_version` | Server (`games` table) | CI/CD on bundle publish |
| Per-game `status` | Server (`games` table) | Admin dashboard — see [config-management.md](config-management.md) |
| Game bundle (scene + scripts + assets) | R2 `game-bundles/<env>/<slug>/<version>/` | CI/CD on bundle publish |

---

## Bundle System

### Bundle Contents

```
client/res/games/<slug>/     ← Asset Bundle root (INGAME only)
  scenes/                    ← game scene(s)
  scripts/                   ← .gd / .ts scripts (including AI)
  textures/, audio/, etc.    ← game assets
```

Each bundle is built independently and uploaded to `game-bundles/<env>/<slug>/<version>/` on R2 — a brand-new immutable folder per publish. Metadata is **not** included — it ships with the client catalog. For the publish ordering and retention rule, see [Publish Consistency](#publish-consistency) below.

### App-Launch Flow

```
App launch
  ├─ Main-app hot update (Cocos AssetsManager)
  │    → refreshes client catalog + per-game metadata
  │
  └─ GET /v1/config
       → per-slug: { status, remoteUrl, remoteVersion }
       → cached at Cloudflare for up to 5 minutes; freshness
         after a CI/CD publish or admin status change is
         eventually consistent within that window

For each slug in the client catalog (first gate):
    lookup = server response[slug]
    if lookup is missing OR lookup.status == 3 (disabled)
        → hide tile (second gate)
    else if lookup.status == 1 (coming_soon)
        → show tile with "Coming soon" badge; Play disabled
    else if lookup.status == 0 (under_maintenance)
        → show tile with "Under maintenance" badge; Play disabled
    else if lookup.status == 2 (enabled)
        → show tile; compare localVersion to lookup.remoteVersion:
              no local bundle          → Download button
              localVersion != remote   → Update badge + Play on old
              localVersion == remote   → Play
```

### Download Flow

```
User taps Download (or Update)
  → Show progress bar (files downloaded / total files)
  → Download bundle from remoteUrl (R2 CDN, direct — no NestJS proxy)
  → Decompress and write to local cache
  → Update local version record
  → Enable Play button
```

### Playing a Bundle

```
User taps Play (only reachable when status == 2 / enabled)
  → assetManager.loadBundle(localCachePath)
  → Instantiate main scene prefab from bundle
  → Game runs (vs AI: fully offline; vs Human: connects to server normally)
```

---

## Status Lifecycle

| Value | Status | Who sets | Tile in lobby | Play |
|-------|--------|----------|---------------|------|
| `0` | `under_maintenance` | Admin (temporary hold) | Shown with badge | Disabled |
| `1` | `coming_soon` | Default for newly registered games | Shown with badge | Disabled |
| `2` | `enabled` | Admin (once bundle is live) | Shown normally | Enabled |
| `3` | `disabled` | Admin (retired / hidden) | Hidden | — |

- Locally cached bundles are **never** auto-deleted on status changes — a re-enabled game plays immediately with its cached version (Update badge if `remote_version` moved).
- `remote_url` / `remote_version` are NULL until the first CI bundle publish. A game with `status = 2` (enabled) but NULL `remote_url` still shows the Download button; Play is blocked client-side until a local bundle exists.

---

## Publish Consistency

Bundle publishes are a dual-write (R2 + Postgres). Two rules keep them consistent without a distributed transaction:

**Invariant.** The `<version>` segment in `remote_url` always equals `remote_version`. Both are written by the same `UPDATE games` statement, so they can never diverge.

**Ordering.** CI executes publish steps in a fixed order (full walkthrough in [workflow.md — Publishing a Game Bundle](../workflow.md#publishing-a-game-bundle)):

1. Read the current `remote_version` for the slug (call it `prev`; may be NULL on first publish).
2. Upload the new bundle to `game-bundles/<env>/<slug>/<new-version>/` — a brand-new immutable folder; nothing is overwritten.
3. `UPDATE games SET remote_url = '<versioned-url>', remote_version = '<new-version>' WHERE slug = ?`.
4. List `game-bundles/<env>/<slug>/*/` and delete every `<version>/` folder whose name is neither `new` nor `prev` (retention — see below).

**Retry safety.** If step 3 fails, the row still points at `prev` (still intact on R2 because nothing was overwritten). Retrying the whole publish is safe: the next successful UPDATE flips the pointer and step 4 cleans up the orphan from the failed attempt. If step 4 fails, the DB is already consistent — the extra orphan folders are cleaned up on the next successful publish (they will be neither `new` nor `prev` then).

**Retention (keep last 2 versions per slug).** Step 4's delete-everything-except-`new`-and-`prev` rule bounds R2 storage at exactly two versions per slug while preserving a 5-minute window for clients holding a cached `/v1/config` response to finish downloading `prev`. Orphan folders from failed publishes are neither `new` nor `prev` on the *next* successful publish, so they get cleaned up naturally — no separate janitor job is needed.

---

## Tasks

`[ ]` not started · `[~]` in progress · `[x]` done

**Server**
- [x] `status`, `remote_url`, `remote_version` columns in `games` table
- [x] `PUT /v1/admin/games/:slug/status` (admin-set status)
- [ ] CI hook writing `remote_url` + `remote_version` to the row after a bundle publish

**Client**
- [ ] Client-side game catalog + metadata (bundled; refreshed via main-app hot update)
- [ ] Two-gate visibility (catalog gate + server status gate)
- [ ] Bundle version check on launch; show Download / Update / Coming soon / Under maintenance indicators
- [ ] In-app download with progress bar; offline cache

**CI**
- [ ] Per-game bundle build + upload to `game-bundles/<env>/<slug>/<new-version>/` on `client/res/games/<slug>/` change
- [ ] After a successful upload, `UPDATE games SET remote_url, remote_version` for the slug (step 3 of the [Publish Consistency](#publish-consistency) ordering)
- [ ] Retention step: delete every `<version>/` folder under `game-bundles/<env>/<slug>/` except `new` and `prev`

---

## Related

- DB: [database-schema.md#games](../database-schema.md#games)
- R2 paths: [infrastructure.md#asset-pipeline-r2](../infrastructure.md#asset-pipeline-r2)
- Publishing workflow: [workflow.md#publishing-a-game-bundle](../workflow.md#publishing-a-game-bundle)
- Admin status control + `/v1/config` shape: [config-management.md](config-management.md)
- Metadata delivery: [hot-update.md](hot-update.md)
- Offline vs AI play: [vs-ai.md](vs-ai.md)
- Endpoints: [api-reference.md#config](../api-reference.md#config), [api-reference.md#admin](../api-reference.md#admin)
