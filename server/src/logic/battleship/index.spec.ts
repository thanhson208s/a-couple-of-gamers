import { BattleshipPlugin } from './index';

describe('BattleshipPlugin', () => {
  let plugin: BattleshipPlugin;

  beforeEach(() => {
    plugin = new BattleshipPlugin();
  });

  it('creates a 10x10 classic fleet for each player and starts with player 1', () => {
    const state = plugin.initialState() as any;

    expect(plugin.getNextTurns(state)).toEqual([1]);
    expect(state.currentTurn).toBe(1);
    expect(state.winner).toBeNull();

    for (const playerIndex of [1, 2]) {
      const ships = state.boards[playerIndex].ships;
      expect(ships.map((ship: any) => ship.length).sort((a: number, b: number) => b - a)).toEqual([5, 4, 3, 3, 2]);

      const occupied = new Set<string>();
      for (const ship of ships) {
        expect(ship.cells).toHaveLength(ship.length);
        for (const cell of ship.cells) {
          expect(cell.row).toBeGreaterThanOrEqual(0);
          expect(cell.row).toBeLessThan(10);
          expect(cell.col).toBeGreaterThanOrEqual(0);
          expect(cell.col).toBeLessThan(10);
          const key = `${cell.row}:${cell.col}`;
          expect(occupied.has(key)).toBe(false);
          occupied.add(key);
        }
      }
    }
  });

  it('hides unsunk opponent ships from player views', () => {
    const state = plugin.initialState();
    const view = plugin.getPlayerView(state as any, 1) as any;

    expect(view.ownBoard.ships).toHaveLength(5);
    expect(view.opponentBoard.ships).toEqual([]);
    expect(view.opponentBoard.shots).toEqual([]);
  });

  it('shows sunk opponent ships in player views', () => {
    const state = plugin.initialState() as any;
    const ship = state.boards[2].ships[0];
    ship.cells = [ship.cells[0], ship.cells[1]];
    ship.length = ship.cells.length;

    const [firstEvent] = plugin.applyAction(state, ship.cells[0], 1) as any[];
    firstEvent.state.currentTurn = 1;

    const beforeSunkView = plugin.getPlayerView(firstEvent.state, 1) as any;
    expect(beforeSunkView.opponentBoard.ships).toEqual([]);

    const [secondEvent] = plugin.applyAction(firstEvent.state, ship.cells[1], 1) as any[];
    const afterSunkView = plugin.getPlayerView(secondEvent.state, 1) as any;

    expect(afterSunkView.opponentBoard.ships).toEqual([
      expect.objectContaining({
        id: ship.id,
        length: 2,
        cells: ship.cells,
        hits: ship.cells,
      }),
    ]);
  });

  it('applies a player 1 shot, records the result, and advances to player 2', () => {
    const state = plugin.initialState() as any;
    const target = state.boards[2].ships[0].cells[0];

    const [event] = plugin.applyAction(state, target, 1) as any[];

    expect(event.playerIndex).toBe(1);
    expect(event.move).toMatchObject({
      row: target.row,
      col: target.col,
      targetPlayerIndex: 2,
      result: 'hit',
    });
    expect(event.state.boards[2].shots).toEqual([
      expect.objectContaining({ row: target.row, col: target.col, result: 'hit' }),
    ]);
    expect(event.state.currentTurn).toBe(2);
    expect(plugin.getNextTurns(event.state)).toEqual([2]);
  });

  it('rejects duplicate shots at the same target coordinate', () => {
    const state = plugin.initialState() as any;
    const target = state.boards[2].ships[0].cells[0];
    const [event] = plugin.applyAction(state, target, 1) as any[];
    event.state.currentTurn = 1;

    expect(() => plugin.applyAction(event.state, target, 1)).toThrow('Coordinate already targeted');
  });

  it('ends when a player sinks the last remaining opponent ship segment', () => {
    const state = plugin.initialState() as any;
    const finalShip = state.boards[2].ships[0];
    state.boards[2].ships = [finalShip];
    finalShip.cells = [finalShip.cells[0]];

    const [event] = plugin.applyAction(state, finalShip.cells[0], 1) as any[];

    expect(event.move).toMatchObject({
      result: 'hit',
      sunkShipId: finalShip.id,
      sunkShipLength: finalShip.length,
    });
    expect(event.state.currentTurn).toBe(0);
    expect(event.state.winner).toBe(1);
    expect(plugin.isGameOver(event.state)).toBe(true);
    expect(plugin.getWinner(event.state)).toBe(1);
  });
});
