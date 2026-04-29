# Game System

Covers the full runtime lifecycle of a match: the `GamePlugin` interface every game implements, how the server applies and stores state, the Redis match-state cache, the WebSocket session mechanics for human matches.

---

## Game Plugin Interface

Every game is a TypeScript module that implements this interface. The server calls these methods; the client only renders.

```typescript
interface GameOptions {
  [key: string]: unknown   // game-specific fields (e.g. difficulty, selected roles)
}

interface GameEvent {
  move: GameMove         // the move that produced this state
  state: GameState       // game state after this move
  playerIndex: number    // who made this move (1 or 2; auto-generated moves use agent's index)
}

interface GamePlugin {
  // Return the initial game state for a new match (before any actions).
  // options is game-specific and optional — omit for defaults.
  // Passed from the body of POST /v1/matches and stored on the match record.
  initialState(options?: GameOptions): GameState

  // Apply a move and return an ordered sequence of GameEvents.
  // Empty array = move was cached (e.g. simultaneous-move game waiting for opponent).
  // Sequential games return one event. Auto-agent or phase transitions may return multiple.
  // playerIndex: 1 = player1, 2 = player2. Throw if the move is invalid.
  applyAction(state: GameState, action: GameAction, playerIndex: number): GameEvent[]

  // Return the subset of state visible to a specific player.
  // playerIndex is 1 or 2. For open-information games, return full state unchanged.
  // For hidden-information games, strip opponent's private data.
  getPlayerView(state: GameState, playerIndex: number): GameView

  // Return true if the game has ended (win, loss, draw, or forfeit).
  isGameOver(state: GameState): boolean

  // Return the winning player index (1 or 2), or 0 for draw, or null if not finished.
  // Only call when isGameOver() is true.
  getWinner(state: GameState): number | null
}
```

`GameOptions`, `GameState`, `GameAction`, `GameView`, `GameMove`, and `GameEvent` are game-specific shapes. The server stores `GameState` as JSONB and `GameOptions` as JSONB on the match record — no cross-game schema coupling.

The server is responsible for all playerId ↔ playerIndex mapping: `player1Id` = index 1, `player2Id` = index 2.

---

## Server Authority Model

- Server is the only entity that calls `applyAction`
- Client submits a `GameAction` object (game-specific payload) via HTTP; server validates and applies it
- Client never receives a state it didn't earn via a valid move sequence

```
Client sends HTTP: POST /v1/matches/action { matchId, action }
  → Server resolves playerIndex (1 if player1, 2 if player2)
  → Server loads state via getStateFromCache (Redis → Postgres fallback)
  → Server calls plugin.applyAction(currentState, action, playerIndex) → GameEvent[]
  → On throw: HTTP 400, state unchanged
  → On empty []: HTTP 204, move cached by plugin — no broadcast yet
  → On success: persist final state, emit match:move for each GameEvent via WS
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
- `isGameOver()` returns true after `applyAction` → write to Postgres immediately
- Player sends `close_match` → flush then reset presence
- Player disconnects (`handleDisconnect`) → flush if `ws:user:{userId}` was a matchId

Risk: if Redis is lost between two flush points, moves since the last flush are unrecoverable. Acceptable for async turn-based play; not suitable for time-sensitive or high-stakes moves.

**Read path** (`getStateFromCache`): Read from Redis. On miss, load from Postgres (JSONB parsed by TypeORM), write back to Redis, and return. The server trusts the stored state — no plugin-level validation step.

---

## Session Mechanics

Moves are submitted via **HTTP** (`POST /v1/matches/action`). The client gets a clear success (`204`) or failure (`400`/`403`/`404`) immediately. Resulting state changes are pushed asynchronously over the **global persistent WebSocket** (`/v1/ws`) as `match:move` events.

When a move generates events, the server checks whether each player has an active WS connection:
- **Player connected and viewing this match** → push `match:move` over WS immediately (real-time path)
- **Player not viewing** → buffer events in replay queue; enqueue FCM push notification only if player is not online

### WebSocket Connection Lifecycle

```
User logs in → client opens wss://<host>/v1/ws?ticket=<ticket>
  Server validates ticket, sets ws:user:{userId} = "lobby" in Redis

User enters match board scene → client sends open_match { matchId }
  If ws:user:{userId} was a matchId (navigated from another match):
    → send opponent_disconnected to old match's opponent
  Server sets ws:user:{userId} = matchId
  Server checks: ws:user:{opponentId} === matchId?
    YES → sends opponent_connected { matchId } to opponent
          sends opponent_connected { matchId } to self (opponent was already there)
    NO  → nothing

User leaves match board scene → client sends close_match { matchId }
  Server sets ws:user:{userId} = "lobby"
  Server sends opponent_disconnected { matchId } to opponent (if connected)

User disconnects WS (app background / network loss)
  Server deletes ws:user:{userId}
  Server sends opponent_disconnected { matchId } to opponent (if ws:user:{userId} was a matchId)
```

### Presence Model (Redis)

Single key per user: `ws:user:{userId}`

| Value | Meaning |
|-------|---------|
| absent / `null` | User offline (no WS connection) |
| `"lobby"` | Connected, in lobby (no match scene open) |
| `<matchId>` | Connected, viewing that match's board |

Set on `handleConnection` → `"lobby"`. Updated on `open_match` → matchId. Reset to `"lobby"` on `close_match`. Deleted on `handleDisconnect`.

`opponent_connected` / `opponent_disconnected` reflect match-viewing presence (`ws:user:{userId} === matchId`), not just WS connection.

### Move Flow

```
Client sends HTTP: POST /v1/matches/action { action }
  Server loads state via getStateFromCache
  Server calls plugin.applyAction → GameEvent[]
  HTTP 400 on invalid move; HTTP 204 on empty sequence (move cached by plugin)
  Persists final state (Redis first, flush to Postgres on game over / close_match / disconnect)
  For each GameEvent in sequence (up to and including any game-over event):
    Checks Redis: ws:user:{player} === matchId for each player
      Viewing → send match:move { matchId, move, playerIndex, view } over WS
      Not viewing → append { move, playerIndex, view } to match:replay:{matchId}:{playerId}
  If game over → send match:over { match } to both players
               → enqueue FCM push to offline players
```

Each player receives only their own `GameView`.

### Move Replay

When a player opens a match they may have missed several opponent moves. The server sends a replay so the client can animate them before showing the current board.

**Auto-acknowledgment**: if the opponent is already viewing the match when a move is submitted (`ws:user:{opponentId} === matchId`), the move is delivered in real-time — nothing is stored.

**Pending replay buffer**: if the opponent is offline or in the lobby, append the move to their buffer.

| Detail | Value |
|--------|-------|
| Redis key | `match:replay:{matchId}:{playerId}` |
| Value | JSON array of `{ move: GameMove, playerIndex: number, view: GameView }` |
| TTL | 7 days — safety cleanup for abandoned matches |
| Cleared | GETDEL on `open_match` |

Each entry is already player-specific (view pre-computed server-side). Raw state is never stored or exposed to the client.

**On `open_match`**: GETDEL the buffer → if non-empty, send `match:replay { matchId, moves: [...] }` before `match:state`. Buffer is cleared immediately; delivery is assumed successful.

### Data Flows

**Move — both players viewing**
```
Player A ──HTTP: POST /v1/matches/:id/moves──► MatchesController
                                                 │ applyAction → GameEvent[]
                                                 │ persistState
                                                 │ emit match:moves ──► WsGateway.onMatchMoves
                                                 │   check Redis: both viewing? YES
                                               ──┤   send match:move (view A) ──► Player A
                                                 └   send match:move (view B) ──► Player B
HTTP 204 ◄──────────────────────────────────────
```

**Move — opponent offline / in lobby**
```
Player A ──HTTP: POST /v1/matches/:id/moves──► MatchesController
                                                 │ applyAction → GameEvent[]
                                                 │ persistState
                                                 │ emit match:moves ──► WsGateway.onMatchMoves
                                                 │   check Redis: opponent viewing? NO
                                               ──┤   append to match:replay:{matchId}:{playerBId}
                                               ──┤   send match:move (view A) ──► Player A
                                                 └   enqueue notify job ──► [delay] ──► FCM ──► Player B device
HTTP 204 ◄──────────────────────────────────────
```

**Entering a match scene**
```
Player A ──WS: open_match { matchId }──► WsGateway
                                           │ set ws:user:{userId} = matchId
                                           │ GETDEL match:replay:{matchId}:{playerAId}
                                           │   → if non-empty: send match:replay ──► Player A
                                           │ send match:state (current view) ──► Player A
                                           │ check: opponent also viewing?
                                           YES → send opponent_connected ──► Player B
```

### Session Tasks

`[ ]` not started · `[~]` in progress · `[x]` done

**Server**
- [x] WS gateway: ticket-based auth on connect, set `ws:user:{userId} = "lobby"` in Redis
- [x] WS `open_match`: GETDEL replay buffer → send `match:replay` if non-empty, then `match:state`; set presence; send `opponent_connected` to opponent
- [x] WS `close_match` + disconnect: flush state to Postgres, clear presence, send `opponent_disconnected` to affected opponents
- [x] HTTP `POST /v1/matches/action`: validate, call `applyAction` → `GameEvent[]`, persist final state, emit `match:moves`; gateway broadcasts `match:move` per event or buffers to replay queue
- [ ] Move notification dispatch (BullMQ short-delay job; cancel on `open_match` within delay window)
- [ ] Turn reminder dispatch (BullMQ delayed job; cancel on opponent move)
- [x] `getStateFromCache`: Redis read-through, Postgres fallback on miss
- [x] `persistState`: Redis-first write; flush to Postgres at checkpoints (game over, `close_match`, disconnect)
- [x] `clearStateFromCache`: called on match complete / abandon

**Client**
- [ ] Open WS immediately after login; maintain persistent connection
- [ ] Send `open_match` / `close_match` when entering / leaving match board
- [ ] Submit all human actions via HTTP `POST /v1/matches/action`
- [ ] Handle `match:replay` (animate opponent moves before showing current board)
- [ ] Handle `match:state`, `match:over`, `opponent_connected`, `opponent_disconnected`

---

## Push Notifications

### Move Notification (BullMQ Short-Delay Job)

When a move is applied and the opponent is not viewing the match, the API server enqueues a short-delay BullMQ job to dispatch the FCM push. The delay absorbs temporary disconnections — if the opponent reconnects within the window, the job is cancelled before firing.

**Type:** BullMQ delayed job (`notifications` queue); one job enqueued per move submission (when opponent not viewing)

**Logic:**
1. After `persistState`, if `ws:user:{opponentId} !== matchId` → enqueue delayed job with a short delay (TBD, e.g. 30 s), keyed by `notify:<matchId>:<opponentId>`
2. If the opponent sends `open_match` before the delay expires → cancel the pending job
3. If the delay expires and opponent still not viewing → worker dispatches FCM push to opponent
4. **Stale token:** if FCM returns `UNREGISTERED`, the server deletes that token

**Payload:** `{ matchId, event: 'your_turn' }` — enough for the client to route to the match screen on tap

This replaces the inline FCM dispatch shown in the Move Flow diagram (async path).

### Turn Reminder (BullMQ Delayed Job)

**Type:** BullMQ delayed job; one job enqueued per move submission

**Logic:**
1. After a move is applied, `NotificationsModule` enqueues a delayed job targeting the opponent with delay = reminder interval (TBD)
2. If the opponent submits a move before the delay expires → the pending reminder job is cancelled
3. If the delay expires with no move → worker sends one FCM push to the opponent
4. No further reminders until the turn changes again (new move resets the cycle)

**Cancellation mechanism:** the job is identified by a stable key (`reminder:<matchId>:<playerId>`) so it can be located and removed when the turn changes.

**Payload:** same shape as move notification — `{ matchId, event: 'turn_reminder' }`.

---

## Multi-Phase Games

Some games have distinct phases where the set of valid actions changes (e.g. Battleship: ship placement → shooting). The plugin handles this entirely within its own state: `applyAction` validates the move against the current phase stored in `GameState` and throws if the action is invalid for the current phase. The server has no special knowledge of phases — it just calls `applyAction` and trusts the plugin to enforce phase rules.

---

## Related

- WS events: [api-reference.md#websocket-events](api-reference.md#websocket-events)
- WS auth: [security.md#websocket-authentication](security.md#websocket-authentication)
- DB tables: [database-schema.md#matches](database-schema.md#matches)
- Notification infrastructure: [features/notifications.md](features/notifications.md)
