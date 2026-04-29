# Match Management

**Requires reading:** [requirements.md#match-management](../requirements.md#match-management)

---

## Overview

Covers match creation, invitation, joining, cancellation, abandonment, and completion for human vs human matches. A match moves through states: `pending` → `active` → `completed` | `abandoned`. Pending matches live in Redis only; a Postgres record is created only when a second player joins. Gameplay (move submission, real-time session) is a separate concern; see [game-system.md](../game-system.md).

---

## State Machine

```
             create match
                  │
          ┌───────▼────────┐
          │ pending (Redis) │ ──── TTL 24 h ──► (auto-expired)
          └───────┬────────┘
                  │ opponent joins  ──── cancel ──► (deleted from Redis)
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

1. Creator calls `POST /v1/matches` with `{ gameSlug, playerSlot: 1|2 }` → server stores match data in **Redis only** (key `invite:code:{inviteCode}`, TTL 24 h); response includes `inviteCode` + `deepLink` + `expiresAt`. No Postgres write.
2. Creator shares the deep link or invite code with opponent.
3. Opponent calls `POST /v1/matches/join` with `{ inviteCode }` — server reads pending data from Redis, deletes the Redis keys, then creates the Postgres `matches` row with `status='active'`; `initialState` is called at this point.
4. Invite code is single-use and expires after 24 h (Redis TTL); anyone with it can join (no identity check).

## Cancellation

- Creator calls `DELETE /v1/matches/pending/:inviteCode`
- Redis keys (`invite:code:{inviteCode}` and sorted-set entry in `invite:user:{userId}`) are deleted immediately
- No Postgres record exists, so no DB write needed

## Abandonment

- Either player calls `DELETE /v1/matches/:id` (active matches only)
- Match transitions to `abandoned`; no stats recorded
- Notify all players in match that match is abandoned

## Inactive Match Cleanup

**Type:** BullMQ repeatable job (`cleanup` queue, `stale-matches` job, every 24 h)  
**Registered by:** `WorkerModule.onModuleInit`  
**Processed by:** `CleanupProcessor` → `MatchesService.cleanupStaleMatches()`

Single job handles two cases in sequence:
1. `abandoned` matches where `updated_at < NOW() - 24 hours` (abandonment threshold)
2. `active` matches where `updated_at < NOW() − 30 days` (inactivity threshold)

No stats recorded — cleanup deletion is not a forfeit.

---

## Completion (Server-Driven)

1. Player submits move → server calls `applyAction` → calls `isGameOver`
2. If game is over: record `winner_id` (null for draw), transition match status to `completed`
3. Update `rival_stats` for both players
4. Broadcast final views to both via WS if both connected

## Client-Side Steps

1. Client shows results screen (winner/draw/score)
2. Interstitial ad shown after results screen (unless `is_ad_free = true`)
3. Player can tap "Return to lobby" or "Rematch" (rematch creates a new match with same game + opponent)

---

## Tasks

`[ ]` not started · `[~]` in progress · `[x]` done

**Server**
- [x] Stale match cleanup (BullMQ repeatable, every 24 h — `stale-matches` job registered in `WorkerModule`, processed by `CleanupProcessor`;)
- [x] `POST /v1/matches` — store pending match in Redis with 24 h TTL; return `inviteCode` + `deepLink` + `expiresAt`
- [x] `DELETE /v1/matches/pending/:inviteCode` — cancel a pending match (Redis delete, creator only)
- [x] `POST /v1/matches/join` — read from Redis by invite code, delete Redis keys, create Postgres `active` match
- [x] `GET /v1/matches/pending` — return caller's pending matches from Redis
- [x] `GET /v1/matches/active` — return caller's active matches from Postgres
- [x] `GET /v1/matches/history` — return last 10 completed matches from Postgres (ordered by updatedAt DESC)
- [ ] `DELETE /v1/matches/:id` — abandon active match; notify players (no penalty)
- [ ] End-of-game detection on move accept; transition match to `completed`
- [ ] Upsert `rival_stats` for both players

**Client**
- [ ] Create match flow (game + opponent type selection)
- [ ] Invite code share sheet + deep link handling
- [ ] Cancel pending match action
- [ ] Abandon match action
- [ ] Results screen (winner / draw)
- [ ] Rematch flow

---

## Related

- Endpoints: [api-reference.md#matches](../api-reference.md#matches)
- DB: [database-schema.md#matches](../database-schema.md#matches), [database-schema.md#rival_stats](../database-schema.md#rival_stats)
- Redis keys: [database-schema.md#data-ownership](../database-schema.md#data-ownership)
- Rival stats ownership: [users-management.md](users-management.md)
- Game plugin: [game-system.md#game-plugin-interface](../game-system.md#game-plugin-interface)
- WS event on completion: [api-reference.md#websocket-events](../api-reference.md#websocket-events) (`match_over`)
- DB index used by cleanup: [database-schema.md#matches](../database-schema.md#matches) (`matches(updated_at)`)
