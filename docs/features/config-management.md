# Config Management

**Requires reading:** [requirements.md#config-management](../requirements.md#config-management) | [games-management.md](games-management.md)

---

## Overview

A single config document carries per-game status + bundle pointers plus any additional feature flags. The client fetches it once on app launch and caches it locally. An internal admin dashboard lets authorized staff update each game's status; changes take effect on users' next launch (after the Cloudflare cache expires).

Game metadata (display names, icons, banners, intro/rule images) and the list of known slugs are **not** in this config — they live in the client catalog and are delivered via [hot-update.md](hot-update.md).

---

## Config Schema

```json
{
  "games": {
    "tictactoe":  { "status": 2, "remoteUrl": "...", "remoteVersion": "1.0.0" },
    "battleship": { "status": 3, "remoteUrl": "...", "remoteVersion": "1.0.0" },
    "kingdomino": { "status": 1, "remoteUrl": null,  "remoteVersion": null },
    "chess":      { "status": 0, "remoteUrl": "...", "remoteVersion": "0.9.1" }
  },
  "<flag>": "<value>"
}
```

Per-game fields:

- `status` — int enum: `0` under_maintenance, `1` coming_soon, `2` enabled, `3` disabled. Admin-controlled.
- `remoteUrl` — R2 CDN URL for the bundle. CI/CD-controlled. `null` until the first publish.
- `remoteVersion` — bundle version string. CI/CD-controlled. `null` until the first publish.

All three are sourced from the `games` table at serve time. Additional top-level keys (feature flags, etc.) can be added via the `config` table when required.

---

## Client Fetch Flow

```
App launch
  → GET /v1/config
  → Cache response locally

For each slug in the client catalog (first gate):
  server entry missing OR status == 3 (disabled)  → hide tile
  status == 1 (coming_soon)                       → tile + "Coming soon" badge; Play disabled
  status == 0 (under_maintenance)                 → tile + "Under maintenance" badge; Play disabled
  status == 2 (enabled)                           → tile; derive Download / Update / Play from remoteVersion

If fetch fails:
  → Use locally cached config (last known good)
  → No error shown to user
```

### Game Tile States (when `status == 2` / enabled)

Derived from comparing the local bundle version against `remoteVersion` in the config response:

| State | Condition | UI |
|-------|-----------|----|
| `up-to-date` | local version == remoteVersion | Play button enabled |
| `update-available` | local version != remoteVersion | Play button enabled (old version); update badge shown |
| `not-downloaded` | no local bundle | Download button shown |

Update check runs once per launch after `GET /v1/config` completes.

Tiles where `status` is `1` (coming_soon) or `0` (under_maintenance) skip this table — Play is disabled regardless of local bundle state.

---

## Admin Dashboard

Served by NestJS at `/admin` as static HTML files embedded in the Docker image (`server/public/admin/`). No separate deployment.

- Protected by `X-Admin-Token` header (value set via `ADMIN_TOKEN` env var)
- Shows every row in the `games` table with a status dropdown (`0` under_maintenance, `1` coming_soon, `2` enabled, `3` disabled) and the current `remote_url` / `remote_version` (read-only — CI/CD writes these)
- On status change: `PUT /v1/admin/games/:slug/status` with `{ status }`
- Feature flags still use `PUT /v1/admin/config` with the full updated config object; persists to the `config` table
- Either endpoint triggers a Cloudflare cache purge for `/v1/config`

---

## Tasks

`[ ]` not started · `[~]` in progress · `[x]` done

**Server**
- [x] `GET /v1/config` — serve game catalog from `games` table (`status`, `remoteUrl`, `remoteVersion`)
- [x] `PUT /v1/admin/games/:slug/status` — admin status update
- [ ] Admin dashboard (`/admin`) + `PUT /v1/admin/config` endpoint for feature flags

**Client**
- [ ] Fetch and cache config on launch; apply two-gate filtering to the client catalog

---

## Related

- Endpoints: [api-reference.md#config](../api-reference.md#config), [api-reference.md#admin](../api-reference.md#admin)
- DB: [database-schema.md#config](../database-schema.md#config), [database-schema.md#games](../database-schema.md#games)
- Bundle download + status gating: [games-management.md](games-management.md)
- Metadata delivery: [hot-update.md](hot-update.md)
