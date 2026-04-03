# Account Deletion

**Requires reading:** [requirements.md#account-deletion](../requirements.md#account-deletion)

---

## Overview

Account deletion is a single atomic operation: abandon all active matches, then hard-delete all user-owned data in cascade order, including data owned by other users that references the deleted account (rival stats).

---

## Deletion Order

1. Abandon all `pending` and `active` matches (status → `abandoned`; no rival stats recorded)
2. Delete rival stats rows where `user_id = deleted` OR `opponent_id = deleted` (both directions)
3. Delete match history, favorites, device tokens
4. Delete the user record

All steps run in a single DB transaction. If any step fails, the entire deletion is rolled back.

---

## Related

- Endpoint: `DELETE /v1/users/me` → [api-reference.md#users](../api-reference.md#users)
- DB tables affected: [database-schema.md](../database-schema.md) — `users`, `matches`, `match_players`, `rival_stats`, `user_favorites`, `device_tokens`
