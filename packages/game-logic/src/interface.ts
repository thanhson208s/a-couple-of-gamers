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

export interface GamePlugin {
  // Return the initial game state for a new match (before any moves).
  initialState(playerIds: string[]): GameState;

  // Apply a move and return the new state. Throw if move is invalid.
  applyMove(state: GameState, move: Move, playerId: string): GameState;

  // Return the subset of state visible to a specific player.
  // For open-information games, return full state unchanged.
  // For hidden-information games, strip opponent's private data.
  getPlayerView(state: GameState, playerId: string): PlayerView;

  // Return true if the game has ended (win, loss, draw, or forfeit).
  isGameOver(state: GameState): boolean;

  // Return the winning playerId, or null for a draw.
  // Only call when isGameOver() is true.
  getWinner(state: GameState): string | null;
}
