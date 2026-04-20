import type { GameOptions, GamePlugin, GameState, Move, PlayerView } from '../';

// TicTacToe-specific state shape — uses player indices (0 | 1), never player IDs.
interface TicTacToeState extends GameState {
  board: (0 | 1 | null)[][]; // 3x3, null = empty, 0/1 = player index
  currentTurn: 0 | 1;        // player index whose turn it is
  winner: 0 | 1 | 'draw' | null;
}

// TicTacToe move shape
interface TicTacToeMove extends Move {
  row: number; // 0–2
  col: number; // 0–2
}

const WIN_LINES = [
  [[0, 0], [0, 1], [0, 2]],
  [[1, 0], [1, 1], [1, 2]],
  [[2, 0], [2, 1], [2, 2]],
  [[0, 0], [1, 0], [2, 0]],
  [[0, 1], [1, 1], [2, 1]],
  [[0, 2], [1, 2], [2, 2]],
  [[0, 0], [1, 1], [2, 2]],
  [[0, 2], [1, 1], [2, 0]],
] as const;

function checkWinner(board: (0 | 1 | null)[][]): 0 | 1 | null {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    const v = board[a[0]][a[1]];
    if (v !== null && v === board[b[0]][b[1]] && v === board[c[0]][c[1]]) return v;
  }
  return null;
}

function isBoardFull(board: (0 | 1 | null)[][]): boolean {
  return board.every(row => row.every(cell => cell !== null));
}

export class TicTacToePlugin implements GamePlugin {
  initialState(): TicTacToeState {
    return {
      board: [[null, null, null], [null, null, null], [null, null, null]],
      currentTurn: 0,
      winner: null,
    };
  }

  applyMove(state: GameState, move: Move, playerIndex: number): TicTacToeState {
    const s = state as TicTacToeState;
    const m = move as TicTacToeMove;

    if (s.winner !== null) throw new Error('Game is already over');
    if (s.currentTurn !== playerIndex) throw new Error('Not your turn');

    const { row, col } = m;
    if (row < 0 || row > 2 || col < 0 || col > 2) throw new Error('Move out of bounds');
    if (s.board[row][col] !== null) throw new Error('Cell already occupied');

    const board = s.board.map(r => [...r]) as (0 | 1 | null)[][];
    board[row][col] = playerIndex as 0 | 1;

    const winnerIndex = checkWinner(board);
    const winner: TicTacToeState['winner'] =
      winnerIndex !== null ? winnerIndex : isBoardFull(board) ? 'draw' : null;
    const currentTurn: 0 | 1 = winner !== null ? s.currentTurn : ((1 - playerIndex) as 0 | 1);

    return { ...s, board, currentTurn, winner };
  }

  // Open-information game — full state is the player view
  getPlayerView(state: GameState, _playerIndex: number): PlayerView {
    return state as PlayerView;
  }

  isGameOver(state: GameState): boolean {
    return (state as TicTacToeState).winner !== null;
  }

  // Returns 0 or 1 (winner index), or null for a draw.
  getWinner(state: GameState): number | null {
    const winner = (state as TicTacToeState).winner;
    return winner === 'draw' ? null : winner;
  }
}
