import type { GamePlugin, GameState, Move, PlayerView } from '@acog/game-logic';

// TicTacToe game plugin stub.
// Implements GamePlugin so it can be registered and wired without game logic.
// See: docs/game-system.md#game-catalog
export class TicTacToePlugin implements GamePlugin {
  initialState(_playerIds: string[]): GameState {
    throw new Error('not implemented');
  }

  applyMove(_state: GameState, _move: Move, _playerId: string): GameState {
    throw new Error('not implemented');
  }

  getPlayerView(state: GameState, _playerId: string): PlayerView {
    // Open-information game — full state is the player view
    return state as PlayerView;
  }

  isGameOver(_state: GameState): boolean {
    throw new Error('not implemented');
  }

  getWinner(_state: GameState): string | null {
    throw new Error('not implemented');
  }
}
