# Users Management

**Requires reading:** [requirements.md#users-management](../requirements.md#users-management)

---

## Overview

User-owned server state: profile, favorites, and rival stats. Profile and device token endpoints handle identity and push setup. Favorites are server-synced for logged-in users. Rival stats are denormalized win/loss/draw counters updated at match completion.

---

## User Profile

Endpoints documented in [api-reference.md#users](../api-reference.md#users): `GET/PUT/DELETE /v1/users/profile`, `PUT /v1/users/device`.

Account lifecycle (login, upgrade, deletion) is in [account-management.md](account-management.md).

---

## Favorites

- Stored on server (`user_favorites` table) for social users
- Favorites are a filter/sort layer on top of the game catalog — not a separate list
- Endpoints: `GET /v1/users/favorites`, `PUT /v1/users/favorites/:gameSlug`, `DELETE /v1/users/favorites/:gameSlug`
- On account deletion: all `user_favorites` rows for the deleted user are removed

---

## Rival History

Stats are a denormalized win/loss/draw counter per `(user, opponent, game)` triple, updated at match completion. Reading stats is a simple lookup — no aggregation over match history at read time.

- `rival_stats` rows are created on the first completed match between a pair; incremented on subsequent matches
- Updated atomically when a match completes: both players' rows upserted in the same transaction as the match status update — see [match-management.md](match-management.md)
- On account deletion: all `rival_stats` rows referencing the deleted user are hard-deleted (both directions) — see [account-management.md](account-management.md)
- Logged-in users only; guest matches do not produce rival stats

---

## Tasks

`[ ]` not started · `[~]` in progress · `[x]` done

**Server**
- [ ] `GET /v1/users/favorites` — list favorites
- [ ] `PUT /v1/users/favorites/:gameSlug` — add favorite
- [ ] `DELETE /v1/users/favorites/:gameSlug` — remove favorite
- [ ] `GET /v1/users/rivals` — rival list
- [ ] `GET /v1/users/rivals/:userId` — per-rival stats broken down by game

**Client**
- [ ] Favorites — server-synced for logged-in users; local SQLite for guests

---

## Related

- Endpoints: [api-reference.md#users](../api-reference.md#users), [api-reference.md#favorites](../api-reference.md#favorites)
- DB: [database-schema.md#user_favorites](../database-schema.md#user_favorites), [database-schema.md#rival_stats](../database-schema.md#rival_stats)
- Stats updated by: [match-management.md](match-management.md)
