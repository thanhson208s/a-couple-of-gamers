// GamePlugin interface — shared between the NestJS server (vs Human validation)
// and the Cocos Creator client (vs AI offline play).
// See: docs/game-system.md#game-plugin-interface

export interface GameState {
  [key: string]: unknown;
}

export interface GameAction {
  [key: string]: unknown;
}

export interface GameMove {
  [key: string]: unknown;
}

export interface GameView {
  [key: string]: unknown;
}

// Game-specific options passed at match creation (e.g. difficulty, selected roles).
// Each game defines what fields it expects; unknown fields are ignored.
export interface GameOptions {
  [key: string]: unknown;
}

// One step in the move sequence returned by applyAction.
export interface GameEvent<M extends GameMove = GameMove, S extends GameState = GameState> {
  move: M;
  state: S;
  playerIndex: number;
}

export interface GamePlugin {
  // Return the initial game state for a new match (before any actions).
  // options is game-specific (e.g. difficulty, selected roles). Omit for defaults.
  initialState(options?: GameOptions): GameState;

  // Apply a move and return an ordered sequence of (move, resulting-state) events.
  // Empty array = move was cached (e.g. simultaneous-move game waiting for opponent).
  // For sequential games: one event. For auto-agent or phase transitions: multiple.
  // playerIndex: 1 = player1, 2 = player2. 0 is reserved (draw / both).
  // Throw if move is invalid.
  applyAction(state: GameState, action: GameAction, playerIndex: 1 | 2): GameEvent[];

  // Return the subset of state visible to a specific player.
  // For open-information games, return full state unchanged.
  // For hidden-information games, strip opponent's private data.
  getPlayerView(state: GameState, playerIndex: 1 | 2): GameView;

  // Return true if the game has ended (win, loss, draw, or forfeit).
  isGameOver(state: GameState): boolean;

  // Return the winning player index (1 or 2), or 0 for a draw.
  // Only call when isGameOver() is true.
  getWinner(state: GameState): 0 | 1 | 2 | null;
}
