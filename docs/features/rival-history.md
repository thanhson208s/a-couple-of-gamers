# Rival History

**Requires reading:** [requirements.md#rival-history](../requirements.md#rival-history)

---

## Overview

Rival stats are a denormalized win/loss/draw counter per (user, opponent, game) triple, updated at match completion. Reading stats is a simple lookup; no aggregation over match history at read time.

---

## Key Points

- Stats are updated atomically when a match completes: increment wins/losses/draws for both players in the same transaction as the match status update
- `rival_stats` rows are created on first completed match between a pair; incremented on subsequent matches
- On account deletion: all `rival_stats` rows referencing the deleted user are hard-deleted (both directions) — see [account-deletion.md](account-deletion.md)
- Guest users have no rival stats (no server-side account to attach them to)

---

## Related

- Endpoints: [api-reference.md#users](../api-reference.md#users) (`/v1/users/me/rivals`, `/v1/users/me/rivals/:opponentId`)
- DB: [database-schema.md#rival_stats](../database-schema.md#rival_stats)
- Updated by: [match-completion.md](match-completion.md)
