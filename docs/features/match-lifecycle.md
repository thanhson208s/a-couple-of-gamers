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

1. Creator calls `POST /v1/matches` with `{ gameSlug, playerSlot: 1|2 }` → server creates match in `pending` state with the creator in the chosen slot; response includes `inviteCode` + `deepLink` + `expiresAt` directly
2. Creator shares the deep link or code with opponent
3. Opponent calls `POST /v1/matches/join` with `{ inviteCode }` — server fills the remaining slot → match transitions to `active`; invite code cleared
4. Invite code is single-use and expires after 24 hours; anyone with it can join (no identity check)

## Abandonment

- Either player can call `DELETE /v1/matches/:id` at any time
- Match transitions to `abandoned`; no stats recorded
- Opponent sees the match disappear on next refresh (no push notification required, though one may be added later)

---

## Tasks

`[ ]` not started · `[~]` in progress · `[x]` done

**Server**
- [x] `POST /v1/matches` — create match
- [x] `POST /v1/matches/join` — join via invite code (lookup by code, no match ID needed; code expires after 24h)
- [ ] `DELETE /v1/matches/:id` — abandon match (no penalty)
- [x] Invite code generation + deep link + TTL (returned in `POST /v1/matches` response)

**Client**
- [ ] Create match flow (game + opponent type selection)
- [ ] Invite code share sheet + deep link handling
- [ ] Abandon match action

---

## Related

- Endpoints: [api-reference.md#matches](../api-reference.md#matches), [api-reference.md#invites](../api-reference.md#invites)
- DB: [database-schema.md#matches](../database-schema.md#matches)
- Inactive cleanup: [background-workers.md](background-workers.md)
