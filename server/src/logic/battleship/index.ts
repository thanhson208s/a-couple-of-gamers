import type { GamePlugin, GameState, GameAction, GameMove, GameView } from '../';

type PlayerIndex = 1 | 2;
type TurnIndex = 0 | PlayerIndex;
type ShotResult = 'hit' | 'miss';

interface Coordinate {
  row: number;
  col: number;
}

interface Ship {
  id: string;
  length: number;
  cells: Coordinate[];
  hits: Coordinate[];
}

interface Shot {
  row: number;
  col: number;
  result: ShotResult;
  sunkShipId?: string;
  sunkShipLength?: number;
}

interface PlayerBoard {
  ships: Ship[];
  shots: Shot[];
}

interface BattleshipState extends GameState {
  boards: Record<PlayerIndex, PlayerBoard>;
  currentTurn: TurnIndex;
  winner: 0 | PlayerIndex | null;
}

interface BattleshipAction extends GameAction {
  row: number;
  col: number;
}

interface BattleshipMove extends GameMove {
  row: number;
  col: number;
  targetPlayerIndex: PlayerIndex;
  result: ShotResult;
  sunkShipId?: string;
  sunkShipLength?: number;
}

interface BattleshipView extends GameView {
  playerIndex: PlayerIndex;
  currentTurn: TurnIndex;
  winner: 0 | PlayerIndex | null;
  ownBoard: PlayerBoard;
  opponentBoard: {
    ships: Ship[];
    shots: Shot[];
  };
}

const BOARD_SIZE = 10;
const FLEET_LENGTHS = [5, 4, 3, 3, 2] as const;

function opponentOf(playerIndex: PlayerIndex): PlayerIndex {
  return playerIndex === 1 ? 2 : 1;
}

function coordinatesEqual(a: Coordinate, b: Coordinate): boolean {
  return a.row === b.row && a.col === b.col;
}

function shipAt(ships: Ship[], coordinate: Coordinate): Ship | undefined {
  return ships.find((ship) => ship.cells.some((cell) => coordinatesEqual(cell, coordinate)));
}

function isSunk(ship: Ship): boolean {
  return ship.cells.every((cell) => ship.hits.some((hit) => coordinatesEqual(hit, cell)));
}

function areAllShipsSunk(board: PlayerBoard): boolean {
  return board.ships.every(isSunk);
}

function cloneCoordinate(coordinate: Coordinate): Coordinate {
  return { row: coordinate.row, col: coordinate.col };
}

function cloneShip(ship: Ship): Ship {
  return {
    id: ship.id,
    length: ship.length,
    cells: ship.cells.map(cloneCoordinate),
    hits: ship.hits.map(cloneCoordinate),
  };
}

function cloneShot(shot: Shot): Shot {
  return { ...shot };
}

function cloneBoard(board: PlayerBoard): PlayerBoard {
  return {
    ships: board.ships.map(cloneShip),
    shots: board.shots.map(cloneShot),
  };
}

function cloneState(state: BattleshipState): BattleshipState {
  return {
    boards: {
      1: cloneBoard(state.boards[1]),
      2: cloneBoard(state.boards[2]),
    },
    currentTurn: state.currentTurn,
    winner: state.winner,
  };
}

function isWithinBoard(coordinate: Coordinate): boolean {
  return Number.isInteger(coordinate.row)
    && Number.isInteger(coordinate.col)
    && coordinate.row >= 0
    && coordinate.row < BOARD_SIZE
    && coordinate.col >= 0
    && coordinate.col < BOARD_SIZE;
}

function createShipCells(row: number, col: number, length: number, horizontal: boolean): Coordinate[] {
  return Array.from({ length }, (_, offset) => ({
    row: horizontal ? row : row + offset,
    col: horizontal ? col + offset : col,
  }));
}

function overlapsAnyShip(ships: Ship[], cells: Coordinate[]): boolean {
  return cells.some((cell) => shipAt(ships, cell));
}

function placeShip(playerIndex: PlayerIndex, shipIndex: number, length: number, ships: Ship[]): Ship {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const horizontal = Math.random() < 0.5;
    const maxRow = horizontal ? BOARD_SIZE - 1 : BOARD_SIZE - length;
    const maxCol = horizontal ? BOARD_SIZE - length : BOARD_SIZE - 1;
    const row = Math.floor(Math.random() * (maxRow + 1));
    const col = Math.floor(Math.random() * (maxCol + 1));
    const cells = createShipCells(row, col, length, horizontal);

    if (!overlapsAnyShip(ships, cells)) {
      return {
        id: `p${playerIndex}-ship-${shipIndex + 1}`,
        length,
        cells,
        hits: [],
      };
    }
  }

  throw new Error('Failed to place battleship fleet');
}

function createBoard(playerIndex: PlayerIndex): PlayerBoard {
  const ships: Ship[] = [];
  FLEET_LENGTHS.forEach((length, shipIndex) => {
    ships.push(placeShip(playerIndex, shipIndex, length, ships));
  });
  return { ships, shots: [] };
}

export class BattleshipPlugin implements GamePlugin {
  initialState(): BattleshipState {
    return {
      boards: {
        1: createBoard(1),
        2: createBoard(2),
      },
      currentTurn: 1,
      winner: null,
    };
  }

  applyAction(state: BattleshipState, action: BattleshipAction, playerIndex: PlayerIndex) {
    if (state.winner !== null) throw new Error('Game is already over');
    if (state.currentTurn !== playerIndex) throw new Error('Not your turn');

    const coordinate = { row: action.row, col: action.col };
    if (!isWithinBoard(coordinate)) throw new Error('Shot out of bounds');

    const nextState = cloneState(state);
    const targetPlayerIndex = opponentOf(playerIndex);
    const targetBoard = nextState.boards[targetPlayerIndex];

    if (targetBoard.shots.some((shot) => coordinatesEqual(shot, coordinate))) {
      throw new Error('Coordinate already targeted');
    }

    const hitShip = shipAt(targetBoard.ships, coordinate);
    const shot: Shot = {
      ...coordinate,
      result: hitShip ? 'hit' : 'miss',
    };

    if (hitShip) {
      hitShip.hits.push(cloneCoordinate(coordinate));
      if (isSunk(hitShip)) {
        shot.sunkShipId = hitShip.id;
        shot.sunkShipLength = hitShip.length;
      }
    }

    targetBoard.shots.push(shot);

    if (areAllShipsSunk(targetBoard)) {
      nextState.currentTurn = 0;
      nextState.winner = playerIndex;
    } else {
      nextState.currentTurn = targetPlayerIndex;
    }

    const move: BattleshipMove = {
      row: coordinate.row,
      col: coordinate.col,
      targetPlayerIndex,
      result: shot.result,
      sunkShipId: shot.sunkShipId,
      sunkShipLength: shot.sunkShipLength,
    };

    return [{ move, state: nextState, playerIndex }];
  }

  getPlayerView(state: BattleshipState, playerIndex: PlayerIndex) {
    const opponentIndex = opponentOf(playerIndex);
    return {
      playerIndex,
      currentTurn: state.currentTurn,
      winner: state.winner,
      ownBoard: cloneBoard(state.boards[playerIndex]),
      opponentBoard: {
        ships: state.boards[opponentIndex].ships.filter(isSunk).map(cloneShip),
        shots: state.boards[opponentIndex].shots.map(cloneShot),
      },
    } satisfies BattleshipView;
  }

  getNextTurns(state: BattleshipState) {
    return state.currentTurn === 0 ? [] : [state.currentTurn];
  }

  isGameOver(state: BattleshipState) {
    return state.winner !== null;
  }

  getWinner(state: BattleshipState) {
    return state.winner;
  }
}
