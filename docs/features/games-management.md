# Games Management

**Requires reading:** [requirements.md#games-management](../requirements.md#games-management) | [hot-update.md](../hot-update.md) | [config-management.md](config-management.md)

---

## Overview

Game visibility and playability are controlled by **two independent gates**:

1. **Client gate (catalog)** — the client ships a static game catalog (slug list + metadata: banners, icons, display name, intro/rule images). The catalog is hot-updated alongside the main app. Only slugs that appear in the catalog are ever rendered.
2. **Server gate (status)** — for each catalog slug, the client looks up the server's `status` (int enum: `0` under_maintenance, `1` coming_soon, `2` enabled, `3` disabled) from `GET /v1/config`. `3` hides the tile; `2` allows Play; `0` / `1` show the tile with a badge and block Play.

Bundle version + download — the third thing a user needs before Play can resolve — belongs to a separate OTA subsystem. See [hot-update.md#game-bundle-hot-update](../hot-update.md#game-bundle-hot-update).

---

## Responsibilities

| Concern | Source of truth | Update mechanism |
|---------|-----------------|-------------------|
| Game catalog (list of slugs) | Client (hot-updated) | Main-app hot update — see [hot-update.md](../hot-update.md) |
| Per-game metadata (display name, icons, banners, intro/rule images, mode-availability flags `aiAvailable` / `pnpAvailable`) | Client (hot-updated) | Same hot update as catalog |
| Per-game `status` | Server (`games` table) | Admin dashboard — see [config-management.md](config-management.md) |

Bundle version + URL per slug and the game bundle itself are owned by the game-bundle OTA — see [hot-update.md#game-bundle-hot-update](../hot-update.md#game-bundle-hot-update).

---

## Client Catalog

The catalog is a static resource (slug list + per-slug metadata) bundled with the main app. It is refreshed **only** via the main-app hot update — adding a new slug, updating a display name, swapping a banner, or editing rule images all ship through that same channel. There is no catalog endpoint on the server.

Because the catalog is the first gate, a slug that is not in the catalog is completely invisible regardless of its server-side `status`. Use the admin dashboard to control per-slug `status` (see [config-management.md](config-management.md)); use the main-app hot update to add or remove slugs.

---

## Mode Availability

Each catalog entry carries two independent booleans that declare which play modes the game supports:

| Field | Meaning |
|-------|---------|
| `aiAvailable` | The game ships an AI opponent component; vs AI is offered. |
| `pnpAvailable` | The game supports two humans on one device; Pass-n-Play is offered. |

A game may be AI-only, PnP-only, both, or neither. The client uses these flags to decide which mode buttons to render on a game's screen. Offline mode reads them exclusively (see [offline-mode.md](offline-mode.md)); when online the same flags still hide modes the game doesn't support. These are pure client-catalog metadata — they have no server-side counterpart and do not interact with the `status` gate.

---

## Tile Visibility

For each slug in the client catalog (the first gate):

```
status = configResponse.games[slug]?.status

if status is missing OR status == 3 (disabled)
    → hide tile (second gate)
else if status == 1 (coming_soon)
    → show tile with "Coming soon" badge; Play disabled
else if status == 0 (under_maintenance)
    → show tile with "Under maintenance" badge; Play disabled
else if status == 2 (enabled)
    → show tile; Play button state is driven by the bundle version check
      → see hot-update.md#launch-flow
```

---

## Status Lifecycle

| Value | Status | Who sets | Tile in lobby | Play |
|-------|--------|----------|---------------|------|
| `0` | `under_maintenance` | Admin (temporary hold) | Shown with badge | Disabled |
| `1` | `coming_soon` | Default for newly registered games | Shown with badge | Disabled |
| `2` | `enabled` | Admin (once bundle is live) | Shown normally | Enabled |
| `3` | `disabled` | Admin (retired / hidden) | Hidden | — |

- Locally cached bundles are **never** auto-deleted on status changes — a re-enabled game plays immediately with its cached version. See [hot-update.md#playing-a-bundle](../hot-update.md#playing-a-bundle).
- A slug with `status = 2` (enabled) but no entry in the bundle manifest still shows the tile; Play is blocked client-side until the manifest carries an entry and a local bundle exists. See [hot-update.md#launch-flow](../hot-update.md#launch-flow).

---

## Tasks

`[ ]` not started · `[~]` in progress · `[x]` done

**Server**
- [x] `status` column in `games` table
- [x] `PUT /v1/admin/games/:slug/status` (admin-set status)

**Client**
- [ ] Client-side game catalog + metadata (bundled; refreshed via main-app hot update)
- [ ] Two-gate visibility (catalog gate + server status gate)
- [ ] Tile badges for `coming_soon` and `under_maintenance`

Bundle-related client and CI tasks live in [hot-update.md#tasks](../hot-update.md#tasks).

---

## Related

- DB: [database-schema.md#games](../database-schema.md#games)
- Admin status control + `/v1/config` shape: [config-management.md](config-management.md)
- Bundle delivery and download: [hot-update.md#game-bundle-hot-update](../hot-update.md#game-bundle-hot-update)
- Catalog + metadata delivery channel: [hot-update.md](../hot-update.md)
- Offline mode (vs AI + Pass-n-Play): [offline-mode.md](offline-mode.md)
- Endpoints: [api-reference.md#config](../api-reference.md#config), [api-reference.md#admin](../api-reference.md#admin)
