import { TicTacToePlugin } from './index';

describe('TicTacToePlugin', () => {
  let plugin: TicTacToePlugin;

  beforeEach(() => {
    plugin = new TicTacToePlugin();
  });

  function makeState(overrides: Record<string, unknown> = {}) {
    return {
      board: [[null, null, null], [null, null, null], [null, null, null]],
      currentTurn: 1,
      winner: null,
      ...overrides,
    } as any;
  }

  it('starts with an empty board and player 1 eligible to act', () => {
    const state = plugin.initialState();

    expect(state).toEqual({
      board: [[null, null, null], [null, null, null], [null, null, null]],
      currentTurn: 1,
      winner: null,
    });
    expect(plugin.getNextTurns(state)).toEqual([1]);
    expect(plugin.isGameOver(state)).toBe(false);
    expect(plugin.getWinner(state)).toBeNull();
  });

  it('returns an open-information player view', () => {
    const state = plugin.initialState();

    expect(plugin.getPlayerView(state, 2)).toEqual({
      playerIndex: 2,
      board: state.board,
      currentTurn: 1,
    });
  });

  it('applies a valid move without mutating the previous state', () => {
    const state = plugin.initialState();

    const [event] = plugin.applyAction(state, { row: 1, col: 2 }, 1);

    expect(state.board[1][2]).toBeNull();
    expect(event).toEqual({
      move: { row: 1, col: 2 },
      playerIndex: 1,
      state: {
        board: [[null, null, null], [null, null, 1], [null, null, null]],
        currentTurn: 2,
        winner: null,
      },
    });
    expect(plugin.getNextTurns(event.state as any)).toEqual([2]);
  });

  it('rejects moves from a player whose turn it is not', () => {
    expect(() => plugin.applyAction(plugin.initialState(), { row: 0, col: 0 }, 2))
      .toThrow('Not your turn');
  });

  it('rejects moves outside the board', () => {
    expect(() => plugin.applyAction(plugin.initialState(), { row: -1, col: 0 }, 1))
      .toThrow('Move out of bounds');
    expect(() => plugin.applyAction(plugin.initialState(), { row: 0, col: 3 }, 1))
      .toThrow('Move out of bounds');
  });

  it('rejects moves into occupied cells', () => {
    const state = makeState({
      board: [[1, null, null], [null, null, null], [null, null, null]],
    });

    expect(() => plugin.applyAction(state, { row: 0, col: 0 }, 1))
      .toThrow('Cell already occupied');
  });

  it('detects every winning line', () => {
    const winningLines = [
      [[0, 0], [0, 1], [0, 2]],
      [[1, 0], [1, 1], [1, 2]],
      [[2, 0], [2, 1], [2, 2]],
      [[0, 0], [1, 0], [2, 0]],
      [[0, 1], [1, 1], [2, 1]],
      [[0, 2], [1, 2], [2, 2]],
      [[0, 0], [1, 1], [2, 2]],
      [[0, 2], [1, 1], [2, 0]],
    ] as const;

    for (const line of winningLines) {
      const board = [[null, null, null], [null, null, null], [null, null, null]] as (1 | 2 | null)[][];
      const [first, second, winningMove] = line;
      board[first[0]][first[1]] = 1;
      board[second[0]][second[1]] = 1;

      const [event] = plugin.applyAction(makeState({ board }), { row: winningMove[0], col: winningMove[1] }, 1);

      expect(event.state).toMatchObject({
        currentTurn: 0,
        winner: 1,
      });
      expect(plugin.getNextTurns(event.state as any)).toEqual([]);
      expect(plugin.isGameOver(event.state as any)).toBe(true);
      expect(plugin.getWinner(event.state as any)).toBe(1);
    }
  });

  it('detects a draw when the final move fills the board without a winner', () => {
    const state = makeState({
      board: [[1, 2, 1], [1, 2, 2], [2, 1, null]],
      currentTurn: 1,
    });

    const [event] = plugin.applyAction(state, { row: 2, col: 2 }, 1);

    expect(event.state).toEqual({
      board: [[1, 2, 1], [1, 2, 2], [2, 1, 1]],
      currentTurn: 0,
      winner: 0,
    });
    expect(plugin.getNextTurns(event.state as any)).toEqual([]);
    expect(plugin.isGameOver(event.state as any)).toBe(true);
    expect(plugin.getWinner(event.state as any)).toBe(0);
  });

  it('rejects moves after the game is already over', () => {
    const state = makeState({ currentTurn: 0, winner: 1 });

    expect(() => plugin.applyAction(state, { row: 0, col: 0 }, 1))
      .toThrow('Game is already over');
  });
});
