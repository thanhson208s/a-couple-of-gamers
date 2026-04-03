# Match Session

**Requires reading:** [requirements.md#vs-human-match](../requirements.md#vs-human-match) | [architecture.md#server-modules](../architecture.md#server-modules)

---

## Overview

All human matches are async by default. When both players have active WebSocket connections to the same match, the server detects presence via Redis and auto-upgrades to real-time delivery — no mode switch is visible to either client or the match model.

Postgres is always written first. Redis is a presence cache and broadcast channel, not the source of truth.

---

## Async Path (default)

```
Player A submits move → POST /matches/:id/moves
  Server validates via game plugin (applyMove)
  Writes updated state to Postgres
  Checks Redis: opponent WS connected? NO
  → Enqueues FCM push to opponent
  → Returns updated player view to Player A

Player B (hours later) → GET /matches/:id
  Server reads state from Postgres
  Returns Player B's player view

Player B submits move → same flow
```

---

## Real-Time Path (auto-upgrade)

```
Player A connects WS → server registers presence in Redis (keyed by matchId + playerId)
Player B connects WS → server registers presence; both players now tracked

Player A submits move → WS event
  Server validates via game plugin
  Writes updated state to Postgres
  Checks Redis: opponent WS connected? YES
  → Updates Redis room cache
  → Broadcasts Player A's view to Player A via WS
  → Broadcasts Player B's view to Player B via WS
  (no FCM sent)
```

Each client receives only their own player view. See [game-system.md#state-visibility](../game-system.md#state-visibility).

---

## Reconnection

If a player's WS drops:
- Server starts a grace period timer (at least 30s, exact value TBD)
- If the player reconnects within the grace period: presence is restored, real-time path continues
- If the grace period expires with no reconnect: presence entry removed from Redis; match falls silently to async — FCM is sent on the next opponent move

---

## Data Flows

### Async move
```
Player ──POST /matches/:id/moves──► Server
                                      │ validate + applyMove
                                      │ write to Postgres
                                      │ check Redis presence: NO
                                      │ → enqueue FCM
                                   ◄──┤ return player view
Opponent ◄──FCM push────────────────── FCM service
Opponent ──GET /matches/:id──────────► Server
                                   ◄──┤ return opponent's player view
```

### Real-time move
```
Player A ──WS: move──► WsGateway
                          │ validate + applyMove
                          │ write to Postgres
                          │ check Redis presence: YES
                          │ update Redis room cache
                        ──┤ broadcast view A ──► Player A
                          └ broadcast view B ──► Player B
                          (no FCM)
```

---

## Related

- REST endpoint: [api-reference.md#moves](../api-reference.md#moves)
- WS events: [api-reference.md#websocket-events](../api-reference.md#websocket-events)
- DB tables: [database-schema.md#matches](../database-schema.md#matches)
- Turn reminder after inactivity: [background-workers.md](background-workers.md)
