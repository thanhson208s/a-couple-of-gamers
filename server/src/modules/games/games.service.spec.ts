import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GamesService } from './games.service';
import { Game } from './game.entity';
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
    it('returns the game when it is enabled', async () => {
      const game = { id: 'g1', slug: 'tictactoe', enabled: true } as Game;
      gamesRepo.findOne.mockResolvedValue(game);

      const result = await service.findBySlug('tictactoe');

      expect(result).toBe(game);
      expect(gamesRepo.findOne).toHaveBeenCalledWith({ where: { slug: 'tictactoe', enabled: true } });
    });

    it('returns null when the game is disabled or not found', async () => {
      gamesRepo.findOne.mockResolvedValue(null);
      expect(await service.findBySlug('unknown')).toBeNull();
    });
  });

  describe('listGames', () => {
    it('returns all games regardless of enabled status', async () => {
      const games = [
        { id: 'g1', slug: 'tictactoe', enabled: true },
        { id: 'g2', slug: 'chess', enabled: false },
      ] as Game[];
      gamesRepo.find.mockResolvedValue(games);

      const result = await service.listGames();

      expect(result).toEqual(games);
      expect(gamesRepo.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('enableGame', () => {
    it('sets enabled to the given value and saves', async () => {
      const game = { id: 'g1', slug: 'tictactoe', enabled: false } as Game;
      gamesRepo.findOne.mockResolvedValue(game);
      gamesRepo.save.mockImplementation(async (g) => g as Game);

      const result = await service.enableGame('tictactoe', true);

      expect(game.enabled).toBe(true);
      expect(gamesRepo.save).toHaveBeenCalledWith(game);
      expect(result.enabled).toBe(true);
    });

    it('throws NotFoundException for an unknown slug', async () => {
      gamesRepo.findOne.mockResolvedValue(null);
      await expect(service.enableGame('unknown', true)).rejects.toThrow(NotFoundException);
    });
  });
});
