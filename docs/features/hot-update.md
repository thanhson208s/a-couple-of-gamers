# Hot Update

**Requires reading:** [requirements.md#hot-update](../requirements.md#hot-update) | [infrastructure.md#asset-pipeline-r2](../infrastructure.md#asset-pipeline-r2)

---

## Overview

The main app bundle (lobby, UI, core flows) is updated without an app store release using Cocos Creator's built-in hot update system. On launch, the client checks a remote version manifest; if a newer version exists, it downloads only the changed files before rendering.

Mini game bundles are **not** part of the hot update — they are versioned and distributed separately through the bundle download system.

---

## Flow

```
App launch
  → AssetsManager fetches version.manifest from R2 hot-update/<env>/
  → Compare remote version against local cached version
  → If same: proceed to launch
  → If newer:
      Download changed assets from R2 (only the diff)
      Apply to local cache
      Restart scene

If manifest fetch fails or download errors:
  → Log to Sentry
  → Continue with cached (last known good) version
```

The app always has a usable cached version. A failed update never blocks launch.

---

## CI Pipeline

Triggered on every `dev` merge (staging) and `v*` tag (production) as part of the Cocos asset publish job:

1. Build Cocos main bundle
2. Run hot-update manifest tool → compare MD5s against previous `project.manifest`
3. Upload only changed asset files to `hot-update/<env>/assets/`
4. Upload new `version.manifest` and `project.manifest` to `hot-update/<env>/`

The manifest upload is the last step — clients only see the new version once the manifest is updated, ensuring assets are already in place.

---

## Tasks

`[ ]` not started · `[~]` in progress · `[x]` done

**Client**
- [ ] Cocos AssetsManager manifest check + delta download on launch
- [ ] Graceful fallback to cached version on network failure

**CI**
- [ ] Main bundle build + version diff upload to R2 on `dev` merge / `v*` tag

---

## Related

- R2 paths: [infrastructure.md#asset-pipeline-r2](../infrastructure.md#asset-pipeline-r2)
- CI/CD jobs: [infrastructure.md#cicd](../infrastructure.md#cicd)
- Game bundles (separate system): [game-bundles.md](game-bundles.md)
