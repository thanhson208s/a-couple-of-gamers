import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MatchesService } from './matches.service';
import { Match } from './match.entity';
import { GamesService } from '../games/games.service';
import { GamesRegistry } from '../games/games.registry';
import { Game, GameStatus } from '../games/game.entity';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { mockRepository } from '../../common/test/helpers';

const CALLER_ID = 'CALLER0001';
const OTHER_ID  = 'OTHER00001';

function makeGame(overrides: Partial<Game> = {}): Game {
  return { id: 'g1', slug: 'tictactoe', status: GameStatus.Enabled, name: 'Tic-Tac-Toe', ...overrides } as Game;
}

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'match-uuid-1',
    game: makeGame(),
    status: 'active',
    state: { board: [] },
    options: null,
    player1Id: OTHER_ID,
    player2Id: CALLER_ID,
    winner: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Match;
}

function makePendingJson(overrides: Partial<{
  gameId: string; gameSlug: string; playerSlot: 1 | 2; playerId: string;
  inviteCode: string; options: null; createdAt: string;
}> = {}): string {
  return JSON.stringify({
    gameId: 'g1',
    gameSlug: 'tictactoe',
    playerSlot: 1,
    playerId: OTHER_ID,
    inviteCode: 'ABCD',
    options: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  });
}

describe('MatchesService', () => {
  let service: MatchesService;
  let matchesRepo: ReturnType<typeof mockRepository<Match>>;
  let gamesService: jest.Mocked<Pick<GamesService, 'findBySlug'>>;
  let gamesRegistry: jest.Mocked<Pick<GamesRegistry, 'get'>>;
  let redis: {
    get: jest.Mock; set: jest.Mock; del: jest.Mock;
    zadd: jest.Mock; zrem: jest.Mock; zrange: jest.Mock;
    zremrangebyscore: jest.Mock; mget: jest.Mock;
  };
  const mockPlugin = { initialState: jest.fn().mockReturnValue({ board: [] }) };

  beforeEach(async () => {
    matchesRepo = mockRepository<Match>();
    gamesService = { findBySlug: jest.fn() };
    gamesRegistry = { get: jest.fn().mockReturnValue(mockPlugin) };
    redis = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      zadd: jest.fn().mockResolvedValue(1),
      zrem: jest.fn().mockResolvedValue(1),
      zrange: jest.fn().mockResolvedValue([]),
      zremrangebyscore: jest.fn().mockResolvedValue(0),
      mget: jest.fn().mockResolvedValue([]),
    };

    const module = await Test.createTestingModule({
      providers: [
        MatchesService,
        { provide: getRepositoryToken(Match), useValue: matchesRepo },
        { provide: GamesService, useValue: gamesService },
        { provide: GamesRegistry, useValue: gamesRegistry },
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    service = module.get(MatchesService);
  });

  describe('createMatch', () => {
    it('stores pending match in Redis and returns inviteCode, deepLink, expiresAt', async () => {
      gamesService.findBySlug.mockResolvedValue(makeGame());

      const result = await service.createMatch('tictactoe', 1, CALLER_ID) as any;

      expect(result.inviteCode).toMatch(/^[a-zA-Z2-9]{8}$/);
      expect(result.deepLink).toBe(`acog://join?code=${result.inviteCode}`);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.id).toBeUndefined();
    });

    it('writes main key to Redis with 24 h TTL', async () => {
      gamesService.findBySlug.mockResolvedValue(makeGame());

      const result = await service.createMatch('tictactoe', 1, CALLER_ID) as any;

      expect(redis.set).toHaveBeenCalledWith(
        `invite:code:${result.inviteCode}`,
        expect.any(String),
        'PX',
        24 * 60 * 60 * 1000,
      );
    });

    it('adds invite code to user sorted set', async () => {
      gamesService.findBySlug.mockResolvedValue(makeGame());

      const result = await service.createMatch('tictactoe', 1, CALLER_ID) as any;

      expect(redis.zadd).toHaveBeenCalledWith(
        `invite:user:${CALLER_ID}`,
        expect.any(Number),
        result.inviteCode,
      );
    });

    it('does not write to Postgres', async () => {
      gamesService.findBySlug.mockResolvedValue(makeGame());

      await service.createMatch('tictactoe', 1, CALLER_ID);

      expect(matchesRepo.save).not.toHaveBeenCalled();
    });

    it('assigns the caller to player slot 2 when playerSlot is 2', async () => {
      gamesService.findBySlug.mockResolvedValue(makeGame());

      await service.createMatch('tictactoe', 2, CALLER_ID);

      const stored = JSON.parse(redis.set.mock.calls[0][1]);
      expect(stored.playerSlot).toBe(2);
      expect(stored.playerId).toBe(CALLER_ID);
    });

    it('throws NotFoundException when the game slug is not found', async () => {
      gamesService.findBySlug.mockResolvedValue(null);
      await expect(service.createMatch('ghost', 1, CALLER_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when no plugin is registered for the game', async () => {
      gamesService.findBySlug.mockResolvedValue(makeGame());
      gamesRegistry.get.mockImplementation(() => { throw new Error('No plugin'); });
      await expect(service.createMatch('tictactoe', 1, CALLER_ID)).rejects.toThrow(BadRequestException);
    });
  });

  describe('joinMatch', () => {
    it('creates an active Postgres match and removes Redis keys', async () => {
      redis.get.mockResolvedValue(makePendingJson({ playerSlot: 1, playerId: OTHER_ID }));
      const saved = makeMatch({ player1Id: OTHER_ID, player2Id: CALLER_ID });
      matchesRepo.create.mockReturnValue(saved);
      matchesRepo.save.mockResolvedValue(saved);

      await service.joinMatch('ABCD', CALLER_ID);

      expect(redis.del).toHaveBeenCalledWith('invite:code:ABCD');
      expect(redis.zrem).toHaveBeenCalledWith(`invite:user:${OTHER_ID}`, 'ABCD');
    });

    it('places the creator in their chosen slot and joiner in the other', async () => {
      redis.get.mockResolvedValue(makePendingJson({ playerSlot: 2, playerId: OTHER_ID }));
      matchesRepo.create.mockImplementation((d) => d as Match);
      matchesRepo.save.mockImplementation(async (m) => m as Match);

      await service.joinMatch('ABCD', CALLER_ID);

      expect(matchesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ player1Id: CALLER_ID, player2Id: OTHER_ID }),
      );
    });

    it('initialises game state via the plugin', async () => {
      redis.get.mockResolvedValue(makePendingJson());
      matchesRepo.create.mockReturnValue(makeMatch());
      matchesRepo.save.mockImplementation(async (m) => m as Match);

      await service.joinMatch('ABCD', CALLER_ID);

      expect(mockPlugin.initialState).toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown invite code', async () => {
      redis.get.mockResolvedValue(null);
      await expect(service.joinMatch('ZZZZ', CALLER_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when the caller is the creator', async () => {
      redis.get.mockResolvedValue(makePendingJson({ playerId: CALLER_ID }));
      await expect(service.joinMatch('ABCD', CALLER_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('cancelMatch', () => {
    it('deletes both Redis keys when the creator cancels', async () => {
      redis.get.mockResolvedValue(makePendingJson({ playerId: CALLER_ID }));

      await service.cancelMatch('ABCD', CALLER_ID);

      expect(redis.del).toHaveBeenCalledWith('invite:code:ABCD');
      expect(redis.zrem).toHaveBeenCalledWith(`invite:user:${CALLER_ID}`, 'ABCD');
    });

    it('throws NotFoundException when invite code does not exist', async () => {
      redis.get.mockResolvedValue(null);
      await expect(service.cancelMatch('ZZZZ', CALLER_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when caller is not the creator', async () => {
      redis.get.mockResolvedValue(makePendingJson({ playerId: OTHER_ID }));
      await expect(service.cancelMatch('ABCD', CALLER_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('abandonMatch', () => {
    it('sets status to abandoned for player1', async () => {
      const match = makeMatch({ player1Id: CALLER_ID, player2Id: OTHER_ID });
      matchesRepo.findOne.mockResolvedValue(match);
      matchesRepo.save.mockImplementation(async (m) => m as Match);

      await service.abandonMatch('match-uuid-1', CALLER_ID);

      expect(matchesRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'abandoned' }));
    });

    it('throws NotFoundException when match does not exist in Postgres', async () => {
      matchesRepo.findOne.mockResolvedValue(null);
      await expect(service.abandonMatch('ghost-id', CALLER_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when caller is not a player', async () => {
      matchesRepo.findOne.mockResolvedValue(makeMatch({ player1Id: OTHER_ID, player2Id: 'THIRD0001' }));
      await expect(service.abandonMatch('match-uuid-1', CALLER_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('listPendingMatches', () => {
    it('returns empty array when no invite codes in sorted set', async () => {
      redis.zrange.mockResolvedValue([]);

      const result = await service.listPendingMatches(CALLER_ID);

      expect(result).toEqual([]);
      expect(redis.mget).not.toHaveBeenCalled();
    });

    it('returns pending match DTOs from Redis', async () => {
      redis.zrange.mockResolvedValue(['ABCD']);
      redis.mget.mockResolvedValue([makePendingJson({ inviteCode: 'ABCD', playerId: CALLER_ID })]);

      const result = await service.listPendingMatches(CALLER_ID);

      expect(result).toHaveLength(1);
      expect((result[0] as any).status).toBe('pending');
      expect((result[0] as any).inviteCode).toBe('ABCD');
    });

    it('prunes expired sorted set members before reading', async () => {
      redis.zrange.mockResolvedValue([]);

      await service.listPendingMatches(CALLER_ID);

      expect(redis.zremrangebyscore).toHaveBeenCalledWith(
        `invite:user:${CALLER_ID}`,
        '-inf',
        expect.any(Number),
      );
    });
  });

  describe('listActiveMatches', () => {
    it('returns active matches from Postgres for both player slots', async () => {
      const matches = [makeMatch()];
      matchesRepo.find.mockResolvedValue(matches);

      const result = await service.listActiveMatches(CALLER_ID);

      expect(result).toBe(matches);
      const [callArg] = matchesRepo.find.mock.calls[0]!;
      const conditions = (callArg as any).where as any[];
      expect(conditions).toHaveLength(2);
      conditions.forEach((c) => expect(c.status).toBe('active'));
    });

    it('filters by inactivity cutoff', async () => {
      matchesRepo.find.mockResolvedValue([]);

      await service.listActiveMatches(CALLER_ID);

      const [callArg] = matchesRepo.find.mock.calls[0]!;
      const conditions = (callArg as any).where as any[];
      conditions.forEach((c) => expect(c.updatedAt).toBeDefined());
    });
  });

  describe('listCompletedMatches', () => {
    it('returns completed matches for both player slots', async () => {
      const matches = [makeMatch({ status: 'completed' })];
      matchesRepo.find.mockResolvedValue(matches);

      const result = await service.listCompletedMatches(CALLER_ID);

      expect(result).toBe(matches);
      const [callArg] = matchesRepo.find.mock.calls[0]!;
      const conditions = (callArg as any).where as any[];
      expect(conditions.every((c: any) => c.status === 'completed')).toBe(true);
      expect(conditions.some((c: any) => c.player1Id === CALLER_ID)).toBe(true);
      expect(conditions.some((c: any) => c.player2Id === CALLER_ID)).toBe(true);
    });

    it('orders by updatedAt DESC and limits to 10 results', async () => {
      matchesRepo.find.mockResolvedValue([]);

      await service.listCompletedMatches(CALLER_ID);

      const [callArg] = matchesRepo.find.mock.calls[0]!;
      expect((callArg as any).order).toEqual({ updatedAt: 'DESC' });
      expect((callArg as any).take).toBe(10);
      expect((callArg as any).skip).toBe(0);
    });
  });

  describe('cleanupStaleMatches', () => {
    it('finds stale matches, deletes them from DB, and clears their Redis keys', async () => {
      const abandoned = [{ id: 'a1' }, { id: 'a2' }] as Match[];
      const staleActive = [{ id: 's1' }] as Match[];
      matchesRepo.find
        .mockResolvedValueOnce(abandoned)
        .mockResolvedValueOnce(staleActive);
      matchesRepo.delete.mockResolvedValue({ affected: 3, raw: [] });

      await service.cleanupStaleMatches();

      expect(matchesRepo.find).toHaveBeenCalledTimes(2);
      expect(matchesRepo.delete).toHaveBeenCalledWith(['a1', 'a2', 's1']);
      expect(redis.del).toHaveBeenCalledWith(
        'match:state:a1', 'match:meta:a1',
        'match:state:a2', 'match:meta:a2',
        'match:state:s1', 'match:meta:s1',
      );
    });

    it('does nothing when there are no stale matches', async () => {
      matchesRepo.find.mockResolvedValue([]);

      await service.cleanupStaleMatches();

      expect(matchesRepo.delete).not.toHaveBeenCalled();
      expect(redis.del).not.toHaveBeenCalled();
    });
  });
});
