# Game Lobby

**Requires reading:** [requirements.md#game-lobby](../requirements.md#game-lobby)

---

## Overview

The lobby is the app's home screen. It combines two lists: the game catalog (static, rarely changes) and the player's active matches (dynamic, polled on foreground resume). Favorites are a filter/sort layer on top of the catalog, not a separate list.

---

## Key Points

- **Game catalog** is fetched once and cached; refreshed on app update or explicit pull-to-refresh
- **Favorites** stored on server for logged-in users (`user_favorites` table); stored in device SQLite for guests
- **Active match list** polled on foreground resume and refreshed via WS events when the app is open
- **"Your turn" badge** is a count derived from the active match list — matches where it is the current player's turn; displayed persistently (e.g. tab bar badge)
- Badge count updated whenever the match list refreshes or a WS event changes match state

---

## Game Tile Download States

Each game tile shows one of four states, derived from comparing the local bundle version against the server version returned by `GET /v1/config`:

| State | Condition | UI |
|-------|-----------|----|
| `up-to-date` | local version == server version | Play button enabled |
| `update-available` | local version < server version | Play button enabled (old version); update badge shown |
| `not-downloaded` | no local bundle | Download button shown |

Update check runs once per launch after `GET /v1/config` completes.

---

## Download Flow

```
User taps Download (or update badge)
  → Show progress bar (files downloaded / total files)
  → Download bundle from bundleUrl (R2 CDN, direct — no NestJS proxy)
  → Decompress and write to local cache
  → Update local version record
  → Switch tile to 'downloaded' state; enable Play button
```

---

## Tasks

`[ ]` not started · `[~]` in progress · `[x]` done

**Server**
- [ ] `GET /v1/config` — catalog list
- [ ] `GET /v1/matches?active=true` — active match list with turn status
- [ ] `POST /v1/users/favorites/:gameId` — add favorite
- [ ] `DELETE /v1/users/favorites/:gameId` — remove favorite

**Client**
- [ ] Catalog screen (cover, description, download state)
- [ ] Favorites — server-synced for logged-in users; local SQLite for guests
- [ ] Active match list with "your turn" / "waiting" label
- [ ] Persistent "your turn" badge count

---

## Related

- Catalog + bundle metadata endpoint: [api-reference.md#config](../api-reference.md#config)
- Remote config (enabled/disabled games): [remote-config.md](remote-config.md)
- Bundle download system: [game-bundles.md](game-bundles.md)
- Favorites endpoints: [api-reference.md#favorites](../api-reference.md#favorites)
- Active match list: [api-reference.md#matches](../api-reference.md#matches)
- DB: [database-schema.md#games](../database-schema.md#games), [database-schema.md#user_favorites](../database-schema.md#user_favorites)
