# Game System

Covers the full runtime lifecycle of a match: the `GamePlugin` interface every game implements, how the server applies and stores state, the Redis match-state cache, the WebSocket session mechanics for human matches.

---

## Game Plugin Interface

Every game is a TypeScript module that implements this interface. The server calls these methods; the client only renders.

```typescript
interface GameOptions {
  [key: string]: unknown   // game-specific fields (e.g. difficulty, selected roles)
}

interface GamePlugin {
  // Return the initial game state for a new match (before any moves).
  // options is game-specific and optional — omit for defaults.
  // Passed from the body of POST /v1/matches and stored on the match record.
  initialState(options?: GameOptions): GameState

  // Apply a move and return the new state. Throw if move is invalid.
  // playerIndex is 0-based: 0 = first player (player1), 1 = second player (player2).
  // The server maps playerId → playerIndex before calling this method.
  applyMove(state: GameState, move: Move, playerIndex: number): GameState

  // Return the subset of state visible to a specific player.
  // playerIndex is 0-based. For open-information games, return full state unchanged.
  // For hidden-information games, strip opponent's private data.
  getPlayerView(state: GameState, playerIndex: number): PlayerView

  // Return true if the game has ended (win, loss, draw, or forfeit).
  isGameOver(state: GameState): boolean

  // Return the winning player index (0 or 1), or null for a draw.
  // Only call when isGameOver() is true.
  // The server maps the returned index back to a playerId.
  getWinner(state: GameState): number | null
}
```

`GameOptions`, `GameState`, `PlayerView`, and `Move` are game-specific shapes. The server stores `GameState` as JSONB and `GameOptions` as JSONB on the match record — no cross-game schema coupling.

The server is responsible for all playerId ↔ playerIndex mapping: `player1Id` = index 0, `player2Id` = index 1.

---

## Server Authority Model

- Server is the only entity that calls `applyMove`
- Client submits a `Move` object (game-specific payload); server validates and applies it
- Client never receives a state it didn't earn via a valid move sequence

```
Client sends WS: move { matchId, move }
  → Server resolves playerIndex (0 if player1, 1 if player2)
  → Server loads state via getStateFromCache (Redis → Postgres fallback)
  → Server calls plugin.applyMove(currentState, move, playerIndex)
  → On success: persistState (Redis first, flush to Postgres at checkpoints), broadcast player views
  → On throw: return match:move_error to submitting client, state unchanged
```

---

## State Visibility

`getPlayerView` is called once per connected player after every move. It produces the state object sent to that player.

**Open-information games** (Tic-tac-toe, Kingdomino, Azul, Patchwork):  
`getPlayerView` returns the full state unchanged. Both players see the same board.

**Hidden-information games** (Battleship):  
`getPlayerView` strips fields the player should not see. For Battleship: a player sees their own ship positions and all shots fired by both sides, but never the opponent's ship positions (only sunk ships are revealed when sunk).

The server calls `getPlayerView` for each player separately and sends each their own view via WebSocket (real-time) or HTTP response (async).

---

## Match State Cache

Postgres is the source of truth. Redis holds a warm copy of the current `GameState` for each active match so that move processing does not require a Postgres read on every event.

| Detail | Value |
|--------|-------|
| Redis key | `match:state:{matchId}` |
| Value | `JSON.stringify(GameState)` |
| TTL | Sliding 1 h — reset after every successful move |
| Cache miss | Load from Postgres, parse JSONB, repopulate Redis |
| Invalidation | `DEL match:state:{matchId}` on match completion or abandonment |

**Write path** (`persistState`): Write to Redis immediately (fast path for live sessions). Flush to Postgres on session boundary events: game over, `close_match`, or player disconnect. This avoids a Postgres write on every move while still persisting before the in-memory state can be lost.

Flush triggers:
- `isGameOver()` returns true after `applyMove` → write to Postgres immediately
- Player sends `close_match` → flush then reset presence
- Player disconnects (`handleDisconnect`) → flush if `ws:{userId}` was a matchId

Risk: if Redis is lost between two flush points, moves since the last flush are unrecoverable. Acceptable for async turn-based play; not suitable for time-sensitive or high-stakes moves.

**Read path** (`getStateFromCache`): Read from Redis. On miss, load from Postgres (JSONB parsed by TypeORM), write back to Redis, and return. The server trusts the stored state — no plugin-level validation step.

---

## Session Mechanics

All match moves are submitted over the **global persistent WebSocket** (`/v1/ws`). The connection is opened once after login and covers all active matches simultaneously.

When a move is submitted, the server checks whether the opponent has an active WS connection:
- **Opponent connected** → broadcast new state over WS immediately (real-time path)
- **Opponent not connected** → enqueue FCM push notification (async path)

The async/real-time distinction is invisible to the client — both paths use the same WS move event.

### WebSocket Connection Lifecycle

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

### Presence Model (Redis)

Single key per user: `ws:{userId}`

| Value | Meaning |
|-------|---------|
| absent / `null` | User offline (no WS connection) |
| `"lobby"` | Connected, in lobby (no match scene open) |
| `<matchId>` | Connected, viewing that match's board |

Set on `handleConnection` → `"lobby"`. Updated on `open_match` → matchId. Reset to `"lobby"` on `close_match`. Deleted on `handleDisconnect`.

`opponent_connected` / `opponent_disconnected` reflect match-viewing presence (`ws:{userId} === matchId`), not just WS connection.

### Move Flow

```
Client sends WS event: move { matchId, move: <game-specific> }
  Server loads state via getStateFromCache
  Server validates via plugin.applyMove
  Writes updated state via persistState (Redis first, flush to Postgres at checkpoints)
  Checks Redis: ws:{opponentId} === matchId? (opponent viewing this match)
    YES → send match:state { matchId, view } to opponent over WS  ← auto-ack, no replay stored
          send match:state { matchId, view } to mover over WS
    NO  → append { moveData, stateAfter } to match:replay:{matchId}:{opponentId}
          enqueue FCM push to opponent (if ws:{opponentId} absent)
          send match:state { matchId, view } to mover over WS
```

Each client receives only their own player view.

### Move Replay

When a player opens a match they may have missed several opponent moves. The server sends a replay so the client can animate them before showing the current board.

**Auto-acknowledgment**: if the opponent is already viewing the match when a move is submitted (`ws:{opponentId} === matchId`), the move is delivered in real-time — nothing is stored.

**Pending replay buffer**: if the opponent is offline or in the lobby, append the move to their buffer.

| Detail | Value |
|--------|-------|
| Redis key | `match:replay:{matchId}:{playerId}` |
| Value | JSON array of `{ moveData, stateAfter }` |
| TTL | 7 days — safety cleanup for abandoned matches |
| Cleared | GETDEL on `open_match` |

**`stateAfter`** is the full `GameState` after the move. The server calls `getPlayerView(stateAfter, playerIndex)` before sending — raw state is never exposed to the client.

**On `open_match`**: GETDEL the buffer → if non-empty, send `match:replay { moves: [{ moveData, view }] }` before `match:state`. Buffer is cleared immediately; delivery is assumed successful.

### Data Flows

**Move — opponent online (viewing this match)**
```
Player A ──WS: move { matchId }──► WsGateway
                                     │ getStateFromCache → applyMove → persistState
                                     │ check Redis: opponent viewing this match? YES
                                   ──┤ send match:state (view A) ──► Player A
                                     └ send match:state (view B) ──► Player B
                                     (no replay stored, no FCM)
```

**Move — opponent offline / in lobby**
```
Player A ──WS: move { matchId }──► WsGateway
                                     │ getStateFromCache → applyMove → persistState
                                     │ check Redis: opponent viewing this match? NO
                                   ──┤ append to match:replay:{matchId}:{playerBId}
                                   ──┤ send match:state (view A) ──► Player A
                                     └ enqueue FCM push (if opponent absent) ──► FCM ──► Player B device
```

**Entering a match scene**
```
Player A ──WS: open_match { matchId }──► WsGateway
                                           │ set ws:{userId} = matchId
                                           │ GETDEL match:replay:{matchId}:{playerAId}
                                           │   → if non-empty: send match:replay ──► Player A
                                           │ send match:state (current view) ──► Player A
                                           │ check: opponent also viewing?
                                           YES → send opponent_connected ──► Player B
```

### Session Tasks

`[ ]` not started · `[~]` in progress · `[x]` done

**Server**
- [ ] WS gateway: ticket-based auth on connect, set `ws:{userId} = "lobby"` in Redis
- [ ] WS `open_match`: GETDEL replay buffer → send `match:replay` if non-empty, then `match:state`; set presence; send `opponent_connected` to opponent
- [ ] WS `close_match` + disconnect: flush state to Postgres, clear presence, send `opponent_disconnected` to affected opponents
- [ ] WS `move`: load via `getStateFromCache`, validate via plugin, `persistState`; if opponent viewing → broadcast WS; else → append to replay buffer + enqueue FCM
- [ ] `getStateFromCache`: Redis read-through, Postgres fallback on miss
- [ ] `persistState`: Redis-first write; flush to Postgres at checkpoints (game over, `close_match`, disconnect)
- [ ] `clearStateFromCache`: called on match complete / abandon

**Client**
- [ ] Open WS immediately after login; maintain persistent connection
- [ ] Send `open_match` / `close_match` when entering / leaving match board
- [ ] Submit all human moves via WS `move` event
- [ ] Handle `match:replay` (animate opponent moves before showing current board)
- [ ] Handle `match:state`, `match:over`, `opponent_connected`, `opponent_disconnected`

---

## Multi-Phase Games

Some games have distinct phases where the set of valid actions changes (e.g. Battleship: ship placement → shooting). The plugin handles this entirely within its own state: `applyMove` validates the move against the current phase stored in `GameState` and throws if the action is invalid for the current phase. The server has no special knowledge of phases — it just calls `applyMove` and trusts the plugin to enforce phase rules.

---

## Related

- WS events: [api-reference.md#websocket-events](api-reference.md#websocket-events)
- WS auth: [security.md#websocket-authentication](security.md#websocket-authentication)
- DB tables: [database-schema.md#matches](database-schema.md#matches)
- Turn reminder after inactivity: [features/background-workers.md](features/background-workers.md)
