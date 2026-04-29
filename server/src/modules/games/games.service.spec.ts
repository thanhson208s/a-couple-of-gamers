import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GamesService } from './games.service';
import { Game, GameStatus } from './game.entity';
import { GamesRegistry } from './games.registry';
import { mockRepository } from '../../common/test/helpers';

describe('GamesService', () => {
  let service: GamesService;
  let gamesRepo: ReturnType<typeof mockRepository<Game>>;
  let gamesRegistry: jest.Mocked<Pick<GamesRegistry, 'slugs'>>;

  beforeEach(async () => {
    gamesRepo = mockRepository<Game>();
    gamesRegistry = { slugs: jest.fn().mockReturnValue([]) };

    const module = await Test.createTestingModule({
      providers: [
        GamesService,
        { provide: getRepositoryToken(Game), useValue: gamesRepo },
        { provide: GamesRegistry, useValue: gamesRegistry },
      ],
    }).compile();
    service = module.get(GamesService);
  });

  describe('onModuleInit', () => {
    it('inserts a row for each registered slug using ON CONFLICT DO NOTHING', async () => {
      gamesRegistry.slugs.mockReturnValue(['tictactoe', 'chess']);

      const executeMock = jest.fn().mockResolvedValue({});
      const orIgnoreMock = jest.fn().mockReturnValue({ execute: executeMock });
      const valuesMock = jest.fn().mockReturnValue({ orIgnore: orIgnoreMock });
      const intoMock = jest.fn().mockReturnValue({ values: valuesMock });
      const insertMock = jest.fn().mockReturnValue({ into: intoMock });
      (gamesRepo as any).createQueryBuilder = jest.fn().mockReturnValue({ insert: insertMock });

      await service.onModuleInit();

      expect((gamesRepo as any).createQueryBuilder).toHaveBeenCalledTimes(2);
      expect(executeMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('findBySlug', () => {
    it('returns the game when its status is enabled', async () => {
      const game = { id: 'tictactoe', status: GameStatus.Enabled } as Game;
      gamesRepo.findOne.mockResolvedValue(game);

      const result = await service.findBySlug('tictactoe');

      expect(result).toBe(game);
      expect(gamesRepo.findOne).toHaveBeenCalledWith({ where: { id: 'tictactoe', status: GameStatus.Enabled } });
    });

    it('returns null when the game is not enabled or not found', async () => {
      gamesRepo.findOne.mockResolvedValue(null);
      expect(await service.findBySlug('unknown')).toBeNull();
    });
  });

  describe('listGames', () => {
    it('returns all games regardless of status', async () => {
      const games = [
        { id: 'tictactoe', status: GameStatus.Enabled },
        { id: 'chess', status: GameStatus.Disabled },
      ] as Game[];
      gamesRepo.find.mockResolvedValue(games);

      const result = await service.listGames();

      expect(result).toEqual(games);
      expect(gamesRepo.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('setGameStatus', () => {
    it('sets status to the given value and saves', async () => {
      const game = { id: 'tictactoe', name: 'Tic-Tac-Toe', status: GameStatus.ComingSoon } as Game;
      gamesRepo.findOne.mockResolvedValue(game);
      gamesRepo.save.mockImplementation(async (g) => g as Game);

      const result = await service.updateGame('tictactoe', undefined, GameStatus.Enabled);

      expect(game.status).toBe(GameStatus.Enabled);
      expect(gamesRepo.save).toHaveBeenCalledWith(game);
      expect(result.status).toBe(GameStatus.Enabled);
    });

    it('sets name to the given value and saves', async () => {
      const game = { id: 'tictactoe', name: 'Tic-Tac-Toe', status: GameStatus.ComingSoon } as Game;
      gamesRepo.findOne.mockResolvedValue(game);
      gamesRepo.save.mockImplementation(async (g) => g as Game);

      const result = await service.updateGame('tictactoe', 'Caro', undefined);

      expect(game.name).toBe('Caro');
      expect(gamesRepo.save).toHaveBeenCalledWith(game);
      expect(result.name).toBe('Caro');
    });

    it('throws NotFoundException for an unknown slug', async () => {
      gamesRepo.findOne.mockResolvedValue(null);
      await expect(service.updateGame('unknown', undefined, GameStatus.Enabled)).rejects.toThrow(NotFoundException);
    });
  });
});
