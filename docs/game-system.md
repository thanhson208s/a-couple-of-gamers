# Game System

TypeScript `GamePlugin` interface (5 methods), server authority model, open vs hidden information state visibility, multi-phase game pattern, AI integration point, and the current game catalog with complexity notes.

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
Client submits move
  → Server resolves playerIndex (0 if player1, 1 if player2)
  → Server calls plugin.applyMove(currentState, move, playerIndex)
  → On success: persist new state, broadcast player views
  → On throw: return error to submitting client, state unchanged
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

## Multi-Phase Games

Some games have distinct phases where the set of valid actions changes (e.g. Battleship: ship placement → shooting). The plugin handles this entirely within its own state: `applyMove` validates the move against the current phase stored in `GameState` and throws if the action is invalid for the current phase. The server has no special knowledge of phases — it just calls `applyMove` and trusts the plugin to enforce phase rules.

---

## AI Integration

The game plugin lives at `server/src/logic/<slug>/`. It runs on both the server (for vs Human move validation) and the Cocos Creator client (for vs AI offline play).

- AI logic will live in `client/games/<slug>/*` and import the plugin when the client is scaffolded
- For vs AI matches: the entire game runs client-side and calls `applyMove` locally, no server contact during play
- AI reads the current `PlayerView`, computes a `Move`, and applies it via the local plugin instance
