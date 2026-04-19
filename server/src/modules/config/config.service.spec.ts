import { Test } from '@nestjs/testing';
import { ConfigService } from './config.service';
import { GamesService } from '../games/games.service';
import { Game } from '../games/game.entity';

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
    it('returns a games map keyed by slug with enabled, bundleUrl, and bundleVersion', async () => {
      gamesService.listGames.mockResolvedValue([
        { slug: 'tictactoe', enabled: true,  bundleUrl: 'https://cdn/ttt.js', bundleVersion: '1.0.0' },
        { slug: 'chess',     enabled: false, bundleUrl: null, bundleVersion: null },
      ] as Game[]);

      const result = await service.getConfig() as any;

      expect(result.games['tictactoe']).toEqual({
        enabled: true,
        bundleUrl: 'https://cdn/ttt.js',
        bundleVersion: '1.0.0',
      });
      expect(result.games['chess']).toEqual({
        enabled: false,
        bundleUrl: null,
        bundleVersion: null,
      });
    });

    it('returns an empty games map when no games exist', async () => {
      gamesService.listGames.mockResolvedValue([]);
      const result = await service.getConfig() as any;
      expect(result.games).toEqual({});
    });
  });
});
