# Game System

TypeScript `GamePlugin` interface (5 methods), server authority model, open vs hidden information state visibility, multi-phase game pattern, AI integration point, and the current game catalog with complexity notes.

---

## Game Plugin Interface

Every game is a TypeScript module that implements this interface. The server calls these methods; the client only renders.

```typescript
interface GamePlugin {
  // Return the initial game state for a new match (before any moves)
  initialState(playerIds: string[]): GameState

  // Apply a move and return the new state. Throw if move is invalid.
  applyMove(state: GameState, move: Move, playerId: string): GameState

  // Return the subset of state visible to a specific player.
  // For open-information games, return full state unchanged.
  // For hidden-information games, strip opponent's private data.
  getPlayerView(state: GameState, playerId: string): PlayerView

  // Return true if the game has ended (win, loss, draw, or forfeit)
  isGameOver(state: GameState): boolean

  // Return the winning playerId, or null for draw. Call only when isGameOver is true.
  getWinner(state: GameState): string | null
}
```

`GameState` and `Move` are game-specific shapes. The server stores `GameState` as JSONB — no cross-game schema coupling.

---

## Server Authority Model

- Server is the only entity that calls `applyMove`
- Client submits a `Move` object (game-specific payload); server validates and applies it
- Client never receives a state it didn't earn via a valid move sequence
- This applies equally to AI moves: the AI (running in Godot) calls the same move submission API as a human player

```
Client submits move
  → Server calls plugin.applyMove(currentState, move, playerId)
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

- AI logic lives in Godot, inside `games/<slug>/AiPlayer.gd`
- AI reads the current `PlayerView` (its own view of the board)
- AI computes a `Move` and submits it via the normal move API (`POST /matches/:id/moves`)
- Server validates the move via `applyMove` — no special AI bypass
- Consequence: AI games are always real-time (AI needs a running client to compute moves)

AI complexity is per-game and up to the implementer. The server doesn't care how the move was generated.

---

## Game Catalog

| Game | Hidden Info | State Complexity | AI Difficulty Estimate | Notes |
|------|-------------|-----------------|----------------------|-------|
| Tic-tac-toe | No | Very low (3×3 grid) | Trivial (minimax, small tree) | Good first implementation |
| Battleship | Yes (ship positions) | Low-medium (10×10 grids × 2) | Easy (random + targeting heuristic) | Requires `getPlayerView` filtering |
| Kingdomino | No | Medium (grid + tile bag) | Medium (greedy heuristic) | Tile drafting adds randomness |
| Azul | No | Medium (factory display + boards) | Medium-hard (many decision points) | Complex state shape |
| Patchwork | No | Medium (quilt boards + time track) | Medium (spatial reasoning) | Button economy adds depth |
| _Future games_ | TBD | TBD | TBD | Add rows here as games are added |
