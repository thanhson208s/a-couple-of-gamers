import type { GameOptions, GamePlugin, GameEvent, GameState, GameAction, GameMove, GameView } from '../';

interface TicTacToeState extends GameState {
  board: (1 | 2 | null)[][];
  currentTurn: 0 | 1 | 2;
  winner: 0 | 1 | 2 | null;
}

interface TicTacToeAction extends GameAction {
  row: number;
  col: number;
}

interface TicTacToeMove extends GameMove {
  row: number;
  col: number;
}

interface TicTacToeView extends GameView {
  playerIndex: number;
  board: (1 | 2 | null)[][];
  currentTurn: 0 | 1 | 2;
}

type TicTacToeEvent = GameEvent<TicTacToeMove, TicTacToeState>;

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

function checkWinner(board: (1 | 2 | null)[][]): 1 | 2 | null {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    const v = board[a[0]][a[1]];
    if (v !== null && v === board[b[0]][b[1]] && v === board[c[0]][c[1]]) return v;
  }
  return null;
}

function isBoardFull(board: (1 | 2 | null)[][]): boolean {
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

  applyAction(state: TicTacToeState, action: TicTacToeAction, playerIndex: number): TicTacToeEvent[] {
    const s = state;
    const a = action;

    if (s.winner !== null) throw new Error('Game is already over');
    if (s.currentTurn !== playerIndex) throw new Error('Not your turn');

    const { row, col } = a;
    if (row < 0 || row > 2 || col < 0 || col > 2) throw new Error('Move out of bounds');
    if (s.board[row][col] !== null) throw new Error('Cell already occupied');

    const board = s.board.map(r => [...r]) as (1 | 2 | null)[][];
    board[row][col] = playerIndex as 1 | 2;

    const winnerIndex = checkWinner(board);
    const winner: TicTacToeState['winner'] =
      winnerIndex !== null ? winnerIndex : isBoardFull(board) ? 0 : null;
    const currentTurn: 0 | 1 | 2 = winner !== null ? 0 : ((3 - playerIndex) as 1 | 2);

    const newState: TicTacToeState = { ...s, board, currentTurn, winner };
    return [{ move: { row: a.row, col: a.col } satisfies TicTacToeMove, state: newState, playerIndex }];
  }

  // Open-information game — full state is the player view
  getPlayerView(state: TicTacToeState, playerIndex: number): TicTacToeView {
    return {
      playerIndex,
      board: state.board,
      currentTurn: state.currentTurn
    } satisfies TicTacToeView;
  }

  isGameOver(state: TicTacToeState): boolean {
    return state.winner !== null;
  }

  getWinner(state: TicTacToeState): number | null {
    return state.winner;
  }
}
