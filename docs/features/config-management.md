# Config Management

**Requires reading:** [requirements.md#config-management](../requirements.md#config-management) | [games-management.md](games-management.md)

---

## Overview

A single config document carries per-game `status` plus any additional feature flags. The client fetches it once on app launch and caches it locally. An internal admin dashboard lets authorized staff update each game's status; changes take effect on users' next launch (after the Cloudflare cache expires).

Bundle URL and version are **not** in this config — they live in the R2 bundle manifest and are fetched by the client directly from the CDN. Game metadata (display names, icons, banners, intro/rule images) is also not in this config — it ships with the client catalog via [hot-update.md](../hot-update.md).

---

## Config Schema

```json
{
  "appVersion": {
    "ios":     { "minSupportedVersion": "1.2", "latestVersion": "1.4" },
    "android": { "minSupportedVersion": "1.2", "latestVersion": "1.5" }
  },
  "games": {
    "tictactoe":  { "status": 2 },
    "battleship": { "status": 3 },
    "kingdomino": { "status": 1 },
    "chess":      { "status": 0 }
  },
  "<flag>": "<value>"
}
```

Per-platform `appVersion` fields — drive the two-gate version check on client launch (see [hot-update.md#two-gate-version-check](../hot-update.md#two-gate-version-check)):

- `minSupportedVersion` — `<major>.<minor>`. Clients below this see a blocking update screen and skip hot-update fetch.
- `latestVersion` — `<major>.<minor>`. Clients below this (but at or above `minSupportedVersion`) see a dismissible "update available" banner and continue.

Per-game fields:

- `status` — int enum: `0` under_maintenance, `1` coming_soon, `2` enabled, `3` disabled. Admin-controlled; sourced from the `games` table at serve time.

Additional top-level keys (feature flags, etc.) can be added via the `config` table when required.

---

## Bundle Info (separate channel)

Bundle URL and version per slug come from `https://acob.gootube.online/game-bundles/<env>/manifest.json` — an R2-hosted JSON object written by CI on every publish, fetched by the client in parallel with `/v1/config`. The manifest is the sole source of truth for bundle version; the server is not involved. Shape and lifecycle: see [../hot-update.md#source-of-truth](../hot-update.md#source-of-truth).

---

## Client Fetch Flow

```
App launch
  → GET /v1/config          (cache response locally)
  → GET manifest.json       (cache response locally; parallel with /v1/config)

Gating logic per slug: games-management.md#tile-visibility owns
status-based tile states; ../hot-update.md#launch-flow owns the
bundle version check. This doc owns `status` delivery only.

If fetch fails:
  → Use locally cached config (last known good)
  → No error shown to user
```

---

## Admin Dashboard

Served by NestJS at `/admin` as static HTML files embedded in the Docker image (`server/public/admin/`). No separate deployment.

- Protected by `X-Admin-Token` header (value set via `ADMIN_TOKEN` env var)
- Shows every row in the `games` table with a status dropdown (`0` under_maintenance, `1` coming_soon, `2` enabled, `3` disabled)
- Shows per-platform `appVersion` inputs (`minSupportedVersion`, `latestVersion` for ios and android) — edited via the feature-flags path
- On status change: `PUT /v1/admin/games/:slug/status` with `{ status }`
- Feature flags and `appVersion` use `PUT /v1/admin/config` with the full updated config object; persists to the `config` table
- Either endpoint triggers a Cloudflare cache purge for `/v1/config`

---

## Tasks

`[ ]` not started · `[~]` in progress · `[x]` done

**Server**
- [x] `GET /v1/config` — serve game catalog from `games` table (`status` only)
- [x] `PUT /v1/admin/games/:slug/status` — admin status update
- [ ] Admin dashboard (`/admin`) + `PUT /v1/admin/config` endpoint for feature flags

**Client**
- [ ] Fetch and cache config on launch; apply two-gate filtering to the client catalog

---

## Related

- Endpoints: [api-reference.md#config](../api-reference.md#config), [api-reference.md#admin](../api-reference.md#admin)
- DB: [database-schema.md#config](../database-schema.md#config), [database-schema.md#games](../database-schema.md#games)
- Status gating + client catalog: [games-management.md](games-management.md)
- Bundle manifest + download: [../hot-update.md#game-bundle-hot-update](../hot-update.md#game-bundle-hot-update)
- Metadata delivery: [hot-update.md](../hot-update.md)
