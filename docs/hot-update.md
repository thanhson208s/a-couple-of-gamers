# Hot Update

**Requires reading:** [requirements.md#non-functional-requirements](requirements.md#non-functional-requirements) | [infrastructure.md#cloudflare-r2](infrastructure.md#cloudflare-r2) | [features/config-management.md](features/config-management.md) | [features/games-management.md](features/games-management.md)

---

## Overview

The app delivers two kinds of content over-the-air from R2 (via the Cloudflare CDN), without an app-store release:

1. **Main-app hot update** — the lobby, UI, core flows, **game catalog, and per-game metadata** bundled into the Cocos main bundle. Updated via Cocos Creator's built-in hot update system, keyed by a per-platform/per-minor-version track.
2. **Game-bundle hot update** — per-game INGAME scene, scripts, and assets downloaded on demand. Each bundle is built and published independently; a single R2 `manifest.json` is the sole source of truth for per-slug version + URL.

Both subsystems share R2 as origin and Cloudflare as cache, but they have separate manifests, separate CI jobs, and separate launch-time fetches. The sections below are organised by subsystem.

---

## Main-App Hot Update

The main app bundle is updated without an app store release using Cocos Creator's built-in hot update system. On launch, the client selects a **track** based on its own platform and native version, fetches that track's manifest, and downloads only the changed files before rendering.

Game catalog changes (adding a slug, updating a display name, swapping a banner, editing rule images) ship through this same hot update — there is no separate endpoint for catalog or metadata.

### Tracks

Hot-update content is split into **per-platform, per-minor-version tracks**. Each track holds one bundle — the latest one compatible with that `<platform, major.minor>` combination. Publishes overwrite the track in place.

```
hot-update/
  production/
    ios/
      apk-1.3/    version.manifest · project.manifest · assets/
      apk-1.4/
    android/
      apk-1.4/
      apk-1.5/
  staging/        (same shape)
```

Patch versions share a minor's track by convention — native plugins are not allowed to change in a patch release. A new minor means a new track.

### Two-Gate Version Check

On launch the client reads `appVersion` from `/v1/config` (see [features/config-management.md](features/config-management.md#config-schema)) and applies two gates against its own baked-in `NATIVE_VERSION`:

| Gate | Condition | Effect |
|------|-----------|--------|
| **A — hard** | `NATIVE_VERSION < appVersion.<platform>.minSupportedVersion` | Blocking "update required" screen with a link to the correct store. Manifest fetch is skipped. |
| **B — soft** | `NATIVE_VERSION < appVersion.<platform>.latestVersion` | Dismissible "update available" banner with a store link. Launch proceeds normally. |

Both thresholds are admin-editable server-side with no APK or bundle publish required — see [features/config-management.md](features/config-management.md#admin-dashboard).

### Flow

```
App launch
  → platform  = sys.platform                      (ios | android)
  → track     = "<platform>/apk-<major>.<minor>"   (derived from NATIVE_VERSION)
  → fetch /v1/config  →  read appVersion.<platform>.{minSupportedVersion, latestVersion}

  → Gate A: NATIVE_VERSION < minSupportedVersion ?
       yes → show blocking update screen → stop

  → Gate B: NATIVE_VERSION < latestVersion ?
       yes → show dismissible update banner (continue)

  → AssetsManager fetches version.manifest from R2 hot-update/<env>/<track>/
  → Compare remote version against local cached version
  → If same:    proceed to launch
  → If newer:   download changed assets → apply to local cache → restart scene

If manifest fetch fails or download errors:
  → Log to Sentry
  → Continue with cached (or APK-embedded) version
```

The app always has a usable cached version — a failed update never blocks launch.

### CI Pipeline

Triggered on every `dev` merge (staging) and `v*` tag (production) as part of the Cocos asset publish job.

The source `version.manifest` committed with the Cocos project carries a `nativeVersion` block declaring each platform's target track:

```json
{
  "version": "<bundle version>",
  "nativeVersion": { "ios": "1.4", "android": "1.4" },
  "assets": { ... },
  "searchPaths": []
}
```

Publish steps:

1. Build Cocos main bundle.
2. Run hot-update manifest tool → compare MD5s against previous `project.manifest`.
3. For **each platform** in `nativeVersion`:
   - Template `packageUrl` / `remoteManifestUrl` / `remoteVersionUrl` to point at `hot-update/<env>/<platform>/apk-<version>/`.
   - Upload changed asset files to that track's `assets/` directory.
   - Upload the templated `version.manifest` and `project.manifest` to the track root — **last**, so clients only see the new version once the assets are in place.

Bundle asset contents are identical across the two platform uploads in the default case; only the manifest URL fields differ. When store review latency forces divergence, `nativeVersion.ios` and `nativeVersion.android` can be set to different values and the two tracks evolve independently.

### Prune

Old tracks are removed by a **scheduled prune workflow**, decoupled from the publish cadence.

- Runs weekly via cron; also available as `workflow_dispatch` with a `dry_run` input.
- Reads `appVersion.<platform>.minSupportedVersion` from `/v1/config`.
- Lists each platform's `hot-update/<env>/<platform>/apk-*` prefixes.
- Deletes any track whose version is **strictly less than** the platform's `minSupportedVersion` (never equal — guards against off-by-one).
- Logs deletions; no-op when there's nothing below the threshold.

Because Gate A already hard-blocks any client still on a retired minor, a pruned track has no active readers.

---

## Game-Bundle Hot Update

Each playable game ships as a standalone bundle (INGAME scene, scripts, and assets) that the client downloads on demand and caches locally. Bundles are version-checked on every launch so players can update to a newer build without shipping a new main-app release. The bundle is **only** the INGAME scene plus scripts and assets — no metadata, no catalog. Metadata and the slug list live with the client catalog shipped via the main-app hot update above (see [features/games-management.md](features/games-management.md)).

### Source of Truth

A single R2 object, `game-bundles/<env>/manifest.json`, is the **sole** source of truth for bundle version + URL per slug. No Postgres columns mirror it, so there is no dual-write and no cross-system consistency window.

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

For the CI runbook that writes the manifest, see [workflow.md#publishing-a-game-bundle](workflow.md#publishing-a-game-bundle).

### Bundle Contents

```
client/res/games/<slug>/     ← Asset Bundle root (INGAME only)
  scenes/                    ← game scene(s)
  scripts/                   ← .gd / .ts scripts (including AI)
  textures/, audio/, etc.    ← game assets
```

Each bundle is built independently and uploaded to `game-bundles/<env>/<slug>/<hash>/` on R2 — a brand-new immutable folder per publish, keyed by a content hash of the source directory. If the hash matches an existing folder, CI skips the upload. Metadata is **not** included — it ships with the client catalog via the main-app hot update.

### Launch Flow

On launch the client fetches the bundle manifest in parallel with `/v1/config`:

```
App launch
  ├─ GET /v1/config                                (server-composed; Cloudflare-cached)
  │    → per-slug: { status }            ← status gate; see features/games-management.md#tile-visibility
  │
  └─ GET game-bundles/<env>/manifest.json          (R2 direct; Cloudflare-cached)
       → per-slug: { version, url }
```

For each slug that passes the catalog + status gates (see [features/games-management.md#tile-visibility](features/games-management.md#tile-visibility)) and resolves to `status == 2` (enabled), the bundle version check drives the Play button:

```
bundle = manifestResponse.games[slug]    (may be missing)

compare localVersion to bundle.version:
    bundle missing           → Download button, but blocked (no URL yet)
    no local bundle          → Download button
    localVersion != version  → Update badge + Play on old
    localVersion == version  → Play
```

A slug with `status = 2` (enabled) but no manifest entry still shows the tile; Play is blocked client-side until the manifest carries an entry and a local bundle exists.

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

Locally cached bundles are **never** auto-deleted on status changes — a re-enabled game plays immediately with its cached version (Update badge if the manifest's version moved).

### Bundle Publish

Every push to `client/res/games/**` on `dev` or `main` triggers a whole-bundle publish for that environment. The operational runbook lives in [workflow.md#publishing-a-game-bundle](workflow.md#publishing-a-game-bundle); the CI contract is:

- Rebuild every `client/res/games/<slug>/`; content-hash each source directory.
- Upload (skip-if-exists) bundles to `game-bundles/<env>/<slug>/<hash>/`. Matching hash → no-op.
- Compose the new `manifest.json` in memory and `PUT` it as a single atomic write. That one object is the transaction.
- Prune `<slug>/<version>/` folders not referenced in the new manifest.
- `concurrency: { group: bundle-publish-${env}, cancel-in-progress: true }` serializes runs per environment.

CI never writes to Postgres — the server does not mirror bundle versions.

---

## Tasks

`[ ]` not started · `[~]` in progress · `[x]` done

**Main app — Client**
- [ ] Bake `NATIVE_VERSION` into the Cocos build (read from `version.manifest`'s `nativeVersion` block + patch suffix).
- [ ] On launch, derive track from `sys.platform` + `NATIVE_VERSION`; fetch `hot-update/<env>/<track>/version.manifest`.
- [ ] Fetch `/v1/config` in parallel; apply Gate A (blocking) and Gate B (dismissible) from `appVersion.<platform>`.
- [ ] Force-update screen + soft "update available" banner, each linking to the correct store URL per platform.
- [ ] AssetsManager delta download + graceful fallback to cached / APK-embedded bundle on failure.

**Main app — Server**
- [ ] Add `appVersion` to the config schema (entity field + `/v1/config` response shape). See [features/config-management.md](features/config-management.md#tasks).
- [ ] `PUT /v1/admin/config` validates the new block; purges Cloudflare cache (existing mechanism).

**Main app — CI**
- [ ] Per-platform track publish: read `nativeVersion` from `version.manifest`, template URL fields, upload to both `hot-update/<env>/ios/apk-<ios>/` and `hot-update/<env>/android/apk-<android>/`.
- [ ] Scheduled `hot-update-prune.yml` workflow (weekly cron + `workflow_dispatch` with `dry_run`).

**Game bundle — Client**
- [ ] Parallel fetch of `/v1/config` (status) and `manifest.json` (bundle info) on launch.
- [ ] Per-slug bundle version check on launch; show Download / Update indicators for enabled games.
- [ ] In-app download with progress bar; offline cache; local version record.
- [ ] Load-and-run a cached bundle via `assetManager.loadBundle`.

**Game bundle — CI**
- [ ] Per-slug bundle build + upload (skip-if-exists) to `game-bundles/<env>/<slug>/<hash>/` on `client/res/games/**` change.
- [ ] Compose and `PUT` `game-bundles/<env>/manifest.json` (single atomic object write — the "transaction").
- [ ] Prune `<slug>/<version>/` folders not referenced by the new manifest.
- [ ] `concurrency: { group: bundle-publish-${env}, cancel-in-progress: true }` on the publish job.

---

## Related

- R2 paths: [infrastructure.md#cloudflare-r2](infrastructure.md#cloudflare-r2)
- CI/CD jobs: [infrastructure.md#cicd](infrastructure.md#cicd)
- Release procedure (track bump → store → admin config): [workflow.md#releasing-a-native-build](workflow.md#releasing-a-native-build)
- Bundle publish runbook: [workflow.md#publishing-a-game-bundle](workflow.md#publishing-a-game-bundle)
- `appVersion` schema & admin: [features/config-management.md](features/config-management.md)
- Status gating + client catalog: [features/games-management.md](features/games-management.md)
- Offline mode (vs AI + Pass-n-Play): [features/offline-mode.md](features/offline-mode.md)
