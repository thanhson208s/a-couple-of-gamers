# Match Session

**Requires reading:** [requirements.md#vs-human-match](../requirements.md#vs-human-match) | [architecture.md#server-modules](../architecture.md#server-modules)

---

## Overview

All human match moves are submitted over the **global persistent WebSocket** (`/v1/ws`). The connection is opened once after login and covers all active matches simultaneously.

When a move is submitted, the server checks whether the opponent has an active WS connection:
- **Opponent connected** → broadcast new state over WS immediately (real-time path)
- **Opponent not connected** → enqueue FCM push notification (async path)

The async/real-time distinction is invisible to the client — both paths use the same WS move event.

Postgres is always written first. Redis is a presence cache, not the source of truth.

---

## WebSocket Connection Lifecycle

```
User logs in → client opens wss://<host>/v1/ws?ticket=<ticket>
  Server validates ticket, sets ws:{userId} = "lobby" in Redis

User enters match board scene → client sends open_match { matchId }
  If ws:{userId} was a matchId (navigated from another match):
    → send opponent_disconnected to old match's opponent
  Server sets ws:{userId} = matchId
  Server checks: ws:{opponentId} === matchId?
    YES → sends opponent_connected { matchId } to opponent
          sends opponent_connected { matchId } to self (opponent was already there)
    NO  → nothing

User leaves match board scene → client sends close_match { matchId }
  Server sets ws:{userId} = "lobby"
  Server sends opponent_disconnected { matchId } to opponent (if connected)

User disconnects WS (app background / network loss)
  Server deletes ws:{userId}
  Server sends opponent_disconnected { matchId } to opponent (if ws:{userId} was a matchId)
```

---

## Move Flow

```
Client sends WS event: move { matchId, move: <game-specific> }
  Server validates via game plugin (applyMove)
  Writes updated state to Postgres
  Checks Redis: ws:{opponentId} present (any value)?
    YES → send match:state { matchId, view } to opponent over WS
          send match:state { matchId, view } to mover over WS
    NO  → enqueue FCM push to opponent
          send match:state { matchId, view } to mover over WS
```

Each client receives only their own player view. See [game-system.md#state-visibility](../game-system.md#state-visibility).

---

## Presence Model (Redis)

Single key per user: `ws:{userId}`

| Value | Meaning |
|-------|---------|
| absent / `null` | User offline (no WS connection) |
| `"lobby"` | Connected, in lobby (no match scene open) |
| `<matchId>` | Connected, viewing that match's board |

Set on `handleConnection` → `"lobby"`. Updated on `open_match` → matchId. Reset to `"lobby"` on `close_match`. Deleted on `handleDisconnect`.

On `open_match`: if current value is already a matchId (user navigated from another match), send `opponent_disconnected` to the old match's opponent before switching.

`opponent_connected` / `opponent_disconnected` reflect match-viewing presence (`ws:{userId} === matchId`), not just WS connection.

---

## Data Flows

### Move — opponent online
```
Player A ──WS: move { matchId }──► WsGateway
                                     │ validate + applyMove
                                     │ write to Postgres
                                     │ check Redis: opponent WS connected? YES
                                   ──┤ send match:state (view A) ──► Player A
                                     └ send match:state (view B) ──► Player B
                                     (no FCM)
```

### Move — opponent offline
```
Player A ──WS: move { matchId }──► WsGateway
                                     │ validate + applyMove
                                     │ write to Postgres
                                     │ check Redis: opponent WS connected? NO
                                   ──┤ send match:state (view A) ──► Player A
                                     └ enqueue FCM push ──► FCM ──► Player B device
```

### Entering a match scene
```
Player A ──WS: open_match { matchId }──► WsGateway
                                           │ set match:{matchId}:viewing:{userId}
                                           │ check: opponent also viewing?
                                           YES → send opponent_connected ──► Player B
```

---

## Tasks

`[ ]` not started · `[~]` in progress · `[x]` done

**Server**
- [ ] WS gateway: ticket-based auth on connect, register `user:{userId}:ws` in Redis
- [ ] WS `open_match`: set match-viewing presence, send `opponent_connected` to opponent
- [ ] WS `close_match` + disconnect: clear presence, send `opponent_disconnected` to affected opponents
- [ ] WS `move`: validate (game plugin), write Postgres, broadcast WS or enqueue FCM

**Client**
- [ ] Open WS immediately after login; maintain persistent connection
- [ ] Send `open_match` / `close_match` when entering / leaving match board
- [ ] Submit all human moves via WS `move` event
- [ ] Handle `match:state`, `match:over`, `opponent_connected`, `opponent_disconnected`

---

## Related

- WS events: [api-reference.md#websocket-events](../api-reference.md#websocket-events)
- WS auth: [security.md#websocket-authentication](../security.md#websocket-authentication)
- DB tables: [database-schema.md#matches](../database-schema.md#matches)
- Turn reminder after inactivity: [background-workers.md](background-workers.md)
