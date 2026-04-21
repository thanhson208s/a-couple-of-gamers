# Match Management

**Requires reading:** [requirements.md#match-management](../requirements.md#match-management)

---

## Overview

Covers match creation, invitation, joining, abandonment, and completion for human vs human matches. A match moves through states: `pending` → `active` → `completed` | `abandoned`. Gameplay (move submission, real-time session) is a separate concern; see [game-system.md](../game-system.md).

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

## Invite Flow

1. Creator calls `POST /v1/matches` with `{ gameSlug, playerSlot: 1|2 }` → server creates match in `pending` state with the creator in the chosen slot; response includes `inviteCode` + `deepLink` + `expiresAt` directly
2. Creator shares the deep link or code with opponent
3. Opponent calls `POST /v1/matches/join` with `{ inviteCode }` — server fills the remaining slot → match transitions to `active`; invite code cleared
4. Invite code is single-use and expires after 24 hours; anyone with it can join (no identity check)

## Abandonment

- Either player can call `DELETE /v1/matches/:id` at any time
- Match transitions to `abandoned`; no stats recorded
- Opponent sees the match disappear on next refresh (no push notification required, though one may be added later)

## Inactive Match Cleanup

**Type:** BullMQ repeatable job (`cleanup` queue, `stale-matches` job, every 24 h)  
**Registered by:** `WorkerModule.onModuleInit`  
**Processed by:** `CleanupProcessor` → `MatchesService.cleanupStaleMatches()`

Single job handles two cases in sequence:
1. `pending` matches where `invite_code_expires_at < NOW()` (invite expired after 24 h)
2. `active` matches where `updated_at < NOW() − 30 days` (inactivity threshold)

No stats recorded — cleanup deletion is not a forfeit.

---

## Completion (Server-Driven)

1. Player submits move → server calls `applyMove` → calls `isGameOver`
2. If game is over: record `winner_id` (null for draw), transition match status to `completed`
3. Update `rival_stats` for both players
4. Return final player view with `matchStatus: 'completed'` to the submitting player; broadcast to both via WS if both connected

## Client-Side Steps

1. Client shows results screen (winner/draw/score)
2. Interstitial ad shown after results screen (unless `is_ad_free = true`)
3. Player can tap "Return to lobby" or "Rematch" (rematch creates a new match with same game + opponent)

---

## Tasks

`[ ]` not started · `[~]` in progress · `[x]` done

**Server**
- [x] Stale match cleanup (BullMQ repeatable, every 24 h — `stale-matches` job registered in `WorkerModule`, processed by `CleanupProcessor`)
- [x] `POST /v1/matches` — create match
- [x] `POST /v1/matches/join` — join via invite code (lookup by code, no match ID needed; code expires after 24h)
- [ ] `GET /v1/matches?active=true` — active match list with turn status
- [ ] `DELETE /v1/matches/:id` — abandon match (no penalty)
- [x] Invite code generation + deep link + TTL (returned in `POST /v1/matches` response)
- [ ] End-of-game detection on move accept; transition match to `completed`
- [ ] Upsert `rival_stats` for both players

**Client**
- [ ] Create match flow (game + opponent type selection)
- [ ] Invite code share sheet + deep link handling
- [ ] Abandon match action
- [ ] Results screen (winner / draw)
- [ ] Rematch flow

---

## Related

- Endpoints: [api-reference.md#matches](../api-reference.md#matches), [api-reference.md#invites](../api-reference.md#invites)
- DB: [database-schema.md#matches](../database-schema.md#matches), [database-schema.md#rival_stats](../database-schema.md#rival_stats)
- Rival stats ownership: [users-management.md](users-management.md)
- Game plugin: [game-system.md#game-plugin-interface](../game-system.md#game-plugin-interface)
- WS event on completion: [api-reference.md#websocket-events](../api-reference.md#websocket-events) (`match_over`)
- DB index used by cleanup: [database-schema.md#matches](../database-schema.md#matches) (`matches(updated_at)`)
