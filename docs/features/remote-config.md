# Remote Config

**Requires reading:** [requirements.md#remote-config](../requirements.md#remote-config)

---

## Overview

A single config document stored in Postgres controls which games are visible in the lobby. The client fetches it once on app launch and caches it locally. An internal admin dashboard at `/admin` lets authorized staff update the config; changes take effect on users' next app launch.

---

## Config Schema

```json
{
  "games": {
    "tictactoe":  { "enabled": true,  "bundleUrl": "...", "bundleVersion": "1.0.0" },
    "battleship": { "enabled": false, "bundleUrl": "...", "bundleVersion": "1.0.0" },
    "kingdomino": { "enabled": true,  "bundleUrl": null,  "bundleVersion": null }
  }
}
```

`enabled` reflects `games.enabled`. `bundleUrl` and `bundleVersion` come from `games.bundle_url` and `games.bundle_version` — both null until the first CI bundle publish. All fields are sourced from the `games` table at serve time — no separate stored config document is needed for the game catalog. Additional top-level keys (feature flags, etc.) can be added via the `config` table when required.

---

## Client Fetch Flow

```
App launch
  → GET /v1/config
  → Cache response locally
  → Filter lobby game list: only show games where enabled = true
  → Compare bundleVersion per game against local cache for download/update indicators

If fetch fails:
  → Use locally cached config (last known good)
  → No error shown to user
```

---

## Admin Dashboard

Served by NestJS at `/admin` as static HTML files embedded in the Docker image (`server/public/admin/`). No separate deployment.

- Protected by `X-Admin-Token` header (value set via `ADMIN_TOKEN` env var)
- Shows all games with enable/disable toggles
- On save: `PUT /v1/admin/config` with the full updated config object
- Changes persist to `config` table immediately

---

## Interaction with Game Bundles

Disabling a game hides it from the lobby. It does **not**:
- Delete the user's locally cached bundle
- Prevent future bundle updates from being published to R2

Re-enabling the game restores its lobby visibility immediately on the user's next launch.

---

## Tasks

`[ ]` not started · `[~]` in progress · `[x]` done

**Server**
- [x] `GET /v1/config` — serve game catalog from `games` table (`enabled`, `bundleUrl`, `bundleVersion`)
- [ ] Admin dashboard (`/admin`) + `PUT /v1/admin/config` endpoints

**Client**
- [ ] Fetch and cache config on launch; apply `enabled` flag to game catalog

---

## Related

- DB: [database-schema.md#config](../database-schema.md#config)
- Endpoints: [api-reference.md#config](../api-reference.md#config), [api-reference.md#admin](../api-reference.md#admin)
- Lobby filtering: [game-lobby.md](game-lobby.md)
