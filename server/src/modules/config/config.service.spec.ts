import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from './config.service';
import { Config, DEFAULT_CONFIG } from './config.entity';
import { GamesService } from '../games/games.service';
import { Game, GameStatus } from '../games/game.entity';

describe('ConfigService', () => {
  let service: ConfigService;
  let gamesService: jest.Mocked<Pick<GamesService, 'listGames'>>;
  let configRepo: jest.Mocked<{ findOne: jest.Mock; save: jest.Mock }>;

  beforeEach(async () => {
    gamesService = { listGames: jest.fn() };
    configRepo = { findOne: jest.fn(), save: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ConfigService,
        { provide: GamesService, useValue: gamesService },
        { provide: getRepositoryToken(Config), useValue: configRepo },
      ],
    }).compile();
    service = module.get(ConfigService);
  });

  describe('getConfig', () => {
    it('returns a games map keyed by id with status only', async () => {
      configRepo.findOne.mockResolvedValue(null);
      gamesService.listGames.mockResolvedValue([
        { id: 'tictactoe', status: GameStatus.Enabled },
        { id: 'chess',     status: GameStatus.ComingSoon },
      ] as Game[]);

      const result = await service.getConfig() as any;

      expect(result.games['tictactoe']).toEqual({ status: GameStatus.Enabled });
      expect(result.games['chess']).toEqual({ status: GameStatus.ComingSoon });
    });

    it('returns an empty games map when no games exist', async () => {
      configRepo.findOne.mockResolvedValue(null);
      gamesService.listGames.mockResolvedValue([]);
      const result = await service.getConfig() as any;
      expect(result.games).toEqual({});
    });

    it('merges stored configData into the response', async () => {
      configRepo.findOne.mockResolvedValue({
        id: 1,
        configData: DEFAULT_CONFIG,
      });
      gamesService.listGames.mockResolvedValue([]);

      const result = await service.getConfig() as any;

      expect(result.appVersion?.ios).toEqual(DEFAULT_CONFIG.appVersion?.ios);
      expect(result.appVersion?.android).toEqual(DEFAULT_CONFIG.appVersion?.android);
    });
  });

  describe('updateConfig', () => {
    it('saves config with id 1', async () => {
      configRepo.save.mockResolvedValue({});

      await service.updateConfig(DEFAULT_CONFIG);

      expect(configRepo.save).toHaveBeenCalledWith({ id: 1, configData: DEFAULT_CONFIG });
    });
  });
});
