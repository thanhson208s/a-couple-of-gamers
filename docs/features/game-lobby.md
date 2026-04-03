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

## Related

- Catalog endpoint: [api-reference.md#games](../api-reference.md#games)
- Favorites endpoints: [api-reference.md#favorites](../api-reference.md#favorites)
- Active match list: [api-reference.md#matches](../api-reference.md#matches)
- DB: [database-schema.md#games](../database-schema.md#games), [database-schema.md#user_favorites](../database-schema.md#user_favorites)
