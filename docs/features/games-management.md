# Games Management

**Requires reading:** [requirements.md#games-management](../requirements.md#games-management) | [hot-update.md](hot-update.md) | [config-management.md](config-management.md) | [infrastructure.md#cloudflare-r2](../infrastructure.md#cloudflare-r2)

---

## Overview

Game visibility and playability are controlled by **two independent gates**:

1. **Client gate (catalog)** — the client ships a static game catalog (slug list + metadata: banners, icons, display name, intro/rule images). The catalog is hot-updated alongside the main app. Only slugs that appear in the catalog are ever rendered.
2. **Server gate (status)** — for each catalog slug, the client looks up the server's `status` (int enum: `0` under_maintenance, `1` coming_soon, `2` enabled, `3` disabled) from `GET /v1/config`. `3` hides the tile; `2` allows Play; `0` / `1` show the tile with a badge and block Play.

The remote bundle contains **only** the INGAME scene, scripts, and assets — no metadata, no catalog. Bundle version and URL per slug live in a single `manifest.json` on R2, written by CI on every publish. Metadata lives with the client catalog. Admins set `status` via the dashboard (Postgres-backed); CI never touches Postgres.

---

## Responsibilities

| Concern | Source of truth | Update mechanism |
|---------|-----------------|-------------------|
| Game catalog (list of slugs) | Client (hot-updated) | Main-app hot update — see [hot-update.md](hot-update.md) |
| Per-game metadata (display name, icons, banners, intro/rule images) | Client (hot-updated) | Same hot update as catalog |
| Bundle manifest (`manifest.json` — per-slug `version` + `url`) | R2 `game-bundles/<env>/manifest.json` | CI/CD on bundle publish |
| Per-game `status` | Server (`games` table) | Admin dashboard — see [config-management.md](config-management.md) |
| Game bundle (scene + scripts + assets) | R2 `game-bundles/<env>/<slug>/<hash>/` | CI/CD on bundle publish |

---

## Source of Truth

The bundle manifest on R2 is the **sole** source of truth for bundle version + URL per slug. No Postgres columns mirror it, so there is no dual-write and no cross-system consistency window.

- `manifest.json` is a single R2 object; a `PUT` is atomic — readers see either the old or the new contents, never a partial mix.
- CI composes the full manifest in memory from its build output, so the publish has no read-modify-write against R2.
- The workflow is serialized per environment via a GitHub Actions `concurrency: { group: bundle-publish-${env}, cancel-in-progress: true }` lock, so two overlapping publishes can't race on the manifest — the latest run wins.
- If the manifest `PUT` fails, the manifest is unchanged and its previous bundle URLs are still intact on R2 (bundles live at immutable content-hashed paths). Retry is always safe.

Example manifest shape (served from `https://acob.gootube.online/game-bundles/production/manifest.json`):

```json
{
  "generatedAt": "2026-04-21T14:23:00Z",
  "games": {
    "tictactoe":  { "version": "ab12cd...", "url": "https://acob.gootube.online/game-bundles/production/tictactoe/ab12cd.../" },
    "kingdomino": { "version": "ef34gh...", "url": "https://acob.gootube.online/game-bundles/production/kingdomino/ef34gh.../" }
  }
}
```

A slug missing from the manifest behaves the same as one with no local bundle: if it reaches the Play gate, the client renders a Download-blocked state.

For the CI flow that writes the manifest, see [workflow.md — Publishing a Game Bundle](../workflow.md#publishing-a-game-bundle).

---

## Bundle System

### Bundle Contents

```
client/res/games/<slug>/     ← Asset Bundle root (INGAME only)
  scenes/                    ← game scene(s)
  scripts/                   ← .gd / .ts scripts (including AI)
  textures/, audio/, etc.    ← game assets
```

Each bundle is built independently and uploaded to `game-bundles/<env>/<slug>/<hash>/` on R2 — a brand-new immutable folder per publish, keyed by a content hash of the source directory. If the hash matches an existing folder, CI skips the upload. Metadata is **not** included — it ships with the client catalog.

### App-Launch Flow

```
App launch
  ├─ Main-app hot update (Cocos AssetsManager)
  │    → refreshes client catalog + per-game metadata
  │
  ├─ GET /v1/config                                (server-composed; Cloudflare-cached)
  │    → per-slug: { status }
  │    → plus any top-level feature flags
  │
  └─ GET game-bundles/<env>/manifest.json          (R2 direct; Cloudflare-cached)
       → per-slug: { version, url }

For each slug in the client catalog (first gate):
    status   = configResponse.games[slug]?.status
    bundle   = manifestResponse.games[slug]            (may be missing)

    if status is missing OR status == 3 (disabled)
        → hide tile (second gate)
    else if status == 1 (coming_soon)
        → show tile with "Coming soon" badge; Play disabled
    else if status == 0 (under_maintenance)
        → show tile with "Under maintenance" badge; Play disabled
    else if status == 2 (enabled)
        → show tile; compare localVersion to bundle.version:
              bundle missing           → Download button, but blocked (no URL yet)
              no local bundle          → Download button
              localVersion != version  → Update badge + Play on old
              localVersion == version  → Play
```

### Download Flow

```
User taps Download (or Update)
  → Show progress bar (files downloaded / total files)
  → Download bundle from bundle.url (R2 CDN, direct — no NestJS proxy)
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

- Locally cached bundles are **never** auto-deleted on status changes — a re-enabled game plays immediately with its cached version (Update badge if the manifest's version moved).
- A slug with `status = 2` (enabled) but no entry in the bundle manifest still shows the tile; Play is blocked client-side until the manifest carries an entry and a local bundle exists.

---

## Tasks

`[ ]` not started · `[~]` in progress · `[x]` done

**Server**
- [x] `status` column in `games` table
- [x] `PUT /v1/admin/games/:slug/status` (admin-set status)

**Client**
- [ ] Client-side game catalog + metadata (bundled; refreshed via main-app hot update)
- [ ] Two-gate visibility (catalog gate + server status gate)
- [ ] Parallel fetch of `/v1/config` (status) and `manifest.json` (bundle info) on launch
- [ ] Bundle version check on launch; show Download / Update / Coming soon / Under maintenance indicators
- [ ] In-app download with progress bar; offline cache

**CI**
- [ ] Per-slug bundle build + upload (skip-if-exists) to `game-bundles/<env>/<slug>/<hash>/` on `client/res/games/**` change
- [ ] Compose and `PUT` `game-bundles/<env>/manifest.json` (single atomic object write — the "transaction")
- [ ] Prune `<slug>/<version>/` folders not referenced by the new manifest
- [ ] `concurrency: { group: bundle-publish-${env}, cancel-in-progress: true }` on the publish job

---

## Related

- DB: [database-schema.md#games](../database-schema.md#games)
- R2 paths: [infrastructure.md#cloudflare-r2](../infrastructure.md#cloudflare-r2)
- Publishing workflow: [workflow.md#publishing-a-game-bundle](../workflow.md#publishing-a-game-bundle)
- Admin status control + `/v1/config` shape: [config-management.md](config-management.md)
- Metadata delivery: [hot-update.md](hot-update.md)
- Offline vs AI play: [vs-ai.md](vs-ai.md)
- Endpoints: [api-reference.md#config](../api-reference.md#config), [api-reference.md#admin](../api-reference.md#admin)
