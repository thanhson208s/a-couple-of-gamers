# Match Lifecycle

**Requires reading:** [requirements.md#match-lifecycle](../requirements.md#match-lifecycle)

---

## Overview

Covers match creation, invitation, joining, and abandonment — the shell of a match independent of its gameplay. A match moves through states: `pending` → `active` → `completed` | `abandoned`. Gameplay (move submission, real-time session) is a separate concern handled in [vs-ai.md](vs-ai.md) and [match-session.md](match-session.md).

---

## State Machine

```
             create match
                  │
             ┌────▼─────┐
             │ pending  │ ──── inactive cleanup ──► (deleted)
             └────┬─────┘
                  │ opponent joins
             ┌────▼─────┐
             │  active  │ ──── inactive cleanup ──► (deleted)
             └────┬─────┘
          ┌───────┴───────┐
     last move        abandon
          │                │
    ┌─────▼──────┐  ┌──────▼─────┐
    │ completed  │  │ abandoned  │
    └────────────┘  └────────────┘
```

## Invite Flow (vs Human)

1. Creator calls `POST /v1/matches` → server creates match in `pending` state, generates invite code
2. Creator shares invite code or deep link with opponent
3. Opponent calls `POST /v1/matches/:id/join` with code → match transitions to `active`; invite code deleted
4. Invite code is single-use; anyone with it can join (no identity check)

## Abandonment

- Either player can call `DELETE /v1/matches/:id` at any time
- Match transitions to `abandoned`; no stats recorded
- Opponent sees the match disappear on next refresh (no push notification required, though one may be added later)

---

## Related

- Endpoints: [api-reference.md#matches](../api-reference.md#matches), [api-reference.md#invites](../api-reference.md#invites)
- DB: [database-schema.md#matches](../database-schema.md#matches)
- Inactive cleanup: [background-workers.md](background-workers.md)
