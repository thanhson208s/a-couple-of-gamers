# Background Workers

**Requires reading:** [requirements.md#background-workers](../requirements.md#background-workers) | [architecture.md#server-modules](../architecture.md#server-modules)

---

## Overview

Two application-level workers run in the NestJS worker service (separate container from the API server). Both use BullMQ with Redis as the job queue. The API server enqueues jobs; the worker service processes them. Neither worker makes HTTP calls to the API server.

The daily Postgres backup is **not** a BullMQ job — it is an OS cron script on prod-data VPS. See [infrastructure.md#backup-strategy](../infrastructure.md#backup-strategy).

---

## Inactive Match Cleanup Worker

**Type:** BullMQ repeatable job (`cleanup` queue, `stale-matches` job, every 24 hours)  
**Registered by:** `WorkerModule.onModuleInit`  
**Processed by:** `CleanupProcessor` → `MatchesService.cleanupStaleMatches()`

Single job handles two cases in sequence:
1. `pending` matches where `invite_code_expires_at < NOW()` (invite expired after 24 h)
2. `active` matches where `updated_at < NOW() − 30 days` (inactivity threshold)

No stats recorded — cleanup deletion is not a forfeit.

See [requirements.md#inactive-match-cleanup](../requirements.md#inactive-match-cleanup) for behavior rules.

---

## Turn Reminder Worker

**Type:** BullMQ delayed job; one job enqueued per move submission

**Logic:**
1. When a move is submitted, `NotificationsModule` enqueues a delayed job targeting the opponent, with delay = reminder interval (TBD)
2. If the opponent submits a move before the delay expires → the pending reminder job is cancelled
3. If the delay expires with no move → worker sends one FCM push to the opponent
4. No further reminders until the turn changes again (new move resets the cycle)

**Cancellation mechanism:** the job is identified by a stable key (e.g. `reminder:<matchId>:<playerId>`) so it can be located and removed when the turn changes.

---

## Tasks

`[ ]` not started · `[~]` in progress · `[x]` done

**Server**
- [x] Stale match cleanup (BullMQ repeatable, every 24 h — `stale-matches` job registered in `WorkerModule`, processed by `CleanupProcessor`)
- [ ] Turn reminder dispatch (BullMQ delayed job; cancel on move)

---

## Related

- Worker container setup: [infrastructure.md#docker-compose](../infrastructure.md#docker-compose)
- DB index used by cleanup query: [database-schema.md#matches](../database-schema.md#matches) (`matches(updated_at)`)
- FCM dispatch: [api-reference.md#users](../api-reference.md#users) (device token registration)
