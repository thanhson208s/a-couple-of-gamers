# Game Bundles

**Requires reading:** [requirements.md#game-bundles](../requirements.md#game-bundles) | [infrastructure.md#asset-pipeline-r2](../infrastructure.md#asset-pipeline-r2)

---

## Overview

Each game is a self-contained Cocos Creator Asset Bundle, downloaded on demand and cached locally. Games are playable offline once downloaded (for vs AI). The server tracks bundle versions; the client compares on launch and prompts for updates.

---

## Bundle Structure

```
client/games/<slug>/        ← Cocos Creator Asset Bundle root
  scenes/                   ← game scene(s)
  scripts/                  ← compiled TypeScript (imports from packages/game-logic/<slug>/)
  textures/, audio/, etc.   ← game assets
```

Each bundle is built independently and uploaded to `game-bundles/<env>/<slug>/` on R2.

---

## Version Check on Launch

```
App launch → GET /v1/config
  → Response includes: enabled, bundleUrl, bundleVersion, per game
  → Note: bundle metadata is cached at Cloudflare for up to 5 minutes; freshness after a CI/CD bundle publish is eventually consistent within that window
  → For each enabled game:
      not downloaded locally  → show Download button
      local version == bundleVersion  → already up to date, show Play
      local version != bundleVersion  → show Update indicator
```

---

## Download Flow

```
User taps Download (or Update)
  → Show progress bar (files downloaded / total files)
  → Download bundle from bundleUrl (R2 CDN, direct)
  → Decompress and write to local cache
  → Update local version record
  → Enable Play button
```

Download happens from R2 directly — no proxy through NestJS.

---

## Playing a Bundle

```
User taps Play
  → assetManager.loadBundle(localCachePath)
  → Instantiate main scene prefab from bundle
  → Game runs (for vs AI: fully offline; for vs Human: connects to server normally)
```

---

## Disabling a Game

If a game is disabled via remote config, it is hidden from the lobby. Its local bundle is **not** deleted — the user's download is preserved and the game becomes visible again if re-enabled.

---

## Tasks

`[ ]` not started · `[~]` in progress · `[x]` done

**Server**
- [x] `bundle_url`, `bundle_version` columns in `games` table

**Client**
- [ ] Bundle version check on launch; show Download / Update indicator
- [ ] In-app download with progress bar; offline cache

**CI**
- [ ] Per-game bundle build + upload to R2 on `client/games/<slug>/` change

---

## Related

- DB columns: [database-schema.md#games](../database-schema.md#games) (`bundle_url`, `bundle_version`)
- R2 paths: [infrastructure.md#asset-pipeline-r2](../infrastructure.md#asset-pipeline-r2)
- Publishing workflow: [workflow.md#publishing-a-game-bundle](../workflow.md#publishing-a-game-bundle)
- Lobby download states: [game-lobby.md](game-lobby.md)
- Offline vs AI play: [vs-ai.md](vs-ai.md)
