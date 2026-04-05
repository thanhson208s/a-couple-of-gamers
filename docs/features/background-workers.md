# Background Workers

**Requires reading:** [requirements.md#background-workers](../requirements.md#background-workers) | [architecture.md#server-modules](../architecture.md#server-modules)

---

## Overview

Two application-level workers run in the NestJS worker service (separate container from the API server). Both use BullMQ with Redis as the job queue. The API server enqueues jobs; the worker service processes them. Neither worker makes HTTP calls to the API server.

The daily Postgres backup is **not** a BullMQ job — it is an OS cron script on prod-data VPS. See [infrastructure.md#backup-strategy](../infrastructure.md#backup-strategy).

---

## Inactive Match Cleanup Worker

**Type:** BullMQ repeatable job (runs on a fixed schedule, e.g. hourly)

**Logic:**
1. Query Postgres for matches where `updated_at` is older than the inactivity threshold (TBD)
2. Hard-delete matching rows; cascades to `match_players` and `moves` tables
3. No stats recorded — inactive deletion is not a forfeit

**Applies to:** both `pending` matches (no opponent joined yet) and `active` matches (play stalled)

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
- [ ] Inactive match cleanup (BullMQ repeatable job)
- [ ] Turn reminder dispatch (BullMQ delayed job; cancel on move)

---

## Related

- Worker container setup: [infrastructure.md#docker-compose](../infrastructure.md#docker-compose)
- DB index used by cleanup query: [database-schema.md#matches](../database-schema.md#matches) (`matches(updated_at)`)
- FCM dispatch: [api-reference.md#users](../api-reference.md#users) (device token registration)
