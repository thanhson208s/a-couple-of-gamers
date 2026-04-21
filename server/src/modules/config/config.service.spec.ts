import { Test } from '@nestjs/testing';
import { ConfigService } from './config.service';
import { GamesService } from '../games/games.service';
import { Game, GameStatus } from '../games/game.entity';

describe('ConfigService', () => {
  let service: ConfigService;
  let gamesService: jest.Mocked<Pick<GamesService, 'listGames'>>;

  beforeEach(async () => {
    gamesService = { listGames: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ConfigService,
        { provide: GamesService, useValue: gamesService },
      ],
    }).compile();
    service = module.get(ConfigService);
  });

  describe('getConfig', () => {
    it('returns a games map keyed by slug with status only', async () => {
      gamesService.listGames.mockResolvedValue([
        { slug: 'tictactoe', status: GameStatus.Enabled },
        { slug: 'chess',     status: GameStatus.ComingSoon },
      ] as Game[]);

      const result = await service.getConfig() as any;

      expect(result.games['tictactoe']).toEqual({ status: GameStatus.Enabled });
      expect(result.games['chess']).toEqual({ status: GameStatus.ComingSoon });
    });

    it('returns an empty games map when no games exist', async () => {
      gamesService.listGames.mockResolvedValue([]);
      const result = await service.getConfig() as any;
      expect(result.games).toEqual({});
    });
  });
});
