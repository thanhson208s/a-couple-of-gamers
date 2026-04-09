// GamePlugin interface — shared between the NestJS server (vs Human validation)
// and the Cocos Creator client (vs AI offline play).
// See: docs/game-system.md#game-plugin-interface

export interface GameState {
  [key: string]: unknown;
}

export interface Move {
  [key: string]: unknown;
}

export interface PlayerView {
  [key: string]: unknown;
}

// Game-specific options passed at match creation (e.g. difficulty, selected roles).
// Each game defines what fields it expects; unknown fields are ignored.
export interface GameOptions {
  [key: string]: unknown;
}

export interface GamePlugin {
  // Return the initial game state for a new match (before any moves).
  // options is game-specific (e.g. difficulty, selected roles). Omit for defaults.
  initialState(options?: GameOptions): GameState;

  // Apply a move and return the new state. Throw if move is invalid.
  // playerIndex is 0-based: 0 = first player, 1 = second player.
  // The server maps playerId → playerIndex before calling this method.
  applyMove(state: GameState, move: Move, playerIndex: number): GameState;

  // Return the subset of state visible to a specific player.
  // For open-information games, return full state unchanged.
  // For hidden-information games, strip opponent's private data.
  getPlayerView(state: GameState, playerIndex: number): PlayerView;

  // Return true if the game has ended (win, loss, draw, or forfeit).
  isGameOver(state: GameState): boolean;

  // Return the winning player index (0 or 1), or null for a draw.
  // Only call when isGameOver() is true.
  // The server maps the returned index back to a playerId.
  getWinner(state: GameState): number | null;
}
