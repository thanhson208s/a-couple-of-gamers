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
const MATCH_ID  = 'match-uuid-1';

function makeGame(overrides: Partial<Game> = {}): Game {
  return { id: 'tictactoe', status: GameStatus.Enabled, name: 'Tic-Tac-Toe', ...overrides } as Game;
}

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: MATCH_ID,
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
  gameId: string; playerSlot: 1 | 2; playerId: string;
  inviteCode: string; options: null; createdAt: string;
}> = {}): string {
  return JSON.stringify({
    gameId: 'tictactoe',
    playerSlot: 1,
    playerId: OTHER_ID,
    inviteCode: 'ABCD',
    options: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  });
}

function makeMetaJson(overrides: Partial<{
  player1Id: string; player2Id: string; gameId: string; status: string;
}> = {}): string {
  return JSON.stringify({
    player1Id: OTHER_ID,
    player2Id: CALLER_ID,
    gameId: 'tictactoe',
    status: 'active',
    ...overrides,
  });
}

describe('MatchesService', () => {
  let service: MatchesService;
  let matchesRepo: ReturnType<typeof mockRepository<Match>> & { findOneOrFail: jest.Mock };
  let gamesService: jest.Mocked<Pick<GamesService, 'findBySlug'>>;
  let gamesRegistry: jest.Mocked<Pick<GamesRegistry, 'get'>>;
  let redis: {
    get: jest.Mock; set: jest.Mock; del: jest.Mock;
    zadd: jest.Mock; zrem: jest.Mock; zrange: jest.Mock;
    zremrangebyscore: jest.Mock; mget: jest.Mock; getdel: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };
  let mockPlugin: {
    initialState: jest.Mock; applyAction: jest.Mock;
    isGameOver: jest.Mock; getWinner: jest.Mock; getPlayerView: jest.Mock;
  };

  beforeEach(async () => {
    mockPlugin = {
      initialState: jest.fn().mockReturnValue({ board: [] }),
      applyAction: jest.fn().mockReturnValue([]),
      isGameOver: jest.fn().mockReturnValue(false),
      getWinner: jest.fn().mockReturnValue(0),
      getPlayerView: jest.fn().mockReturnValue({ cells: [] }),
    };

    matchesRepo = Object.assign(mockRepository<Match>(), { findOneOrFail: jest.fn() }) as any;
    gamesService = { findBySlug: jest.fn() };
    gamesRegistry = { get: jest.fn().mockReturnValue(mockPlugin) };
    eventEmitter = { emit: jest.fn() };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      zadd: jest.fn().mockResolvedValue(1),
      zrem: jest.fn().mockResolvedValue(1),
      zrange: jest.fn().mockResolvedValue([]),
      zremrangebyscore: jest.fn().mockResolvedValue(0),
      mget: jest.fn().mockResolvedValue([]),
      getdel: jest.fn().mockResolvedValue(null),
    };

    const module = await Test.createTestingModule({
      providers: [
        MatchesService,
        { provide: getRepositoryToken(Match), useValue: matchesRepo },
        { provide: GamesService, useValue: gamesService },
        { provide: GamesRegistry, useValue: gamesRegistry },
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();
    service = module.get(MatchesService);
  });

  // ─── helpers ──────────────────────────────────────────────────────────────

  /** Mock redis.get to return match meta and/or state by key. */
  function mockRedisGet(opts: {
    meta?: string | null;
    state?: string | null;
  } = {}) {
    redis.get.mockImplementation((key: string) => {
      if (key === `match:meta:${MATCH_ID}`) return Promise.resolve(opts.meta ?? null);
      if (key === `match:state:${MATCH_ID}`) return Promise.resolve(opts.state ?? null);
      return Promise.resolve(null);
    });
  }

  // ─── createMatch ──────────────────────────────────────────────────────────

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

  // ─── joinMatch ────────────────────────────────────────────────────────────

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

    it('caches match meta in Redis after creating the match', async () => {
      redis.get.mockResolvedValue(makePendingJson({ playerSlot: 1, playerId: OTHER_ID }));
      const saved = makeMatch({ player1Id: OTHER_ID, player2Id: CALLER_ID });
      matchesRepo.create.mockReturnValue(saved);
      matchesRepo.save.mockResolvedValue(saved);

      await service.joinMatch('ABCD', CALLER_ID);

      expect(redis.set).toHaveBeenCalledWith(
        `match:meta:${MATCH_ID}`,
        expect.any(String),
        'PX',
        expect.any(Number),
      );
    });

    it('emits match:start event after match is created', async () => {
      redis.get.mockResolvedValue(makePendingJson({ playerSlot: 1, playerId: OTHER_ID }));
      const saved = makeMatch({ player1Id: OTHER_ID, player2Id: CALLER_ID });
      matchesRepo.create.mockReturnValue(saved);
      matchesRepo.save.mockResolvedValue(saved);

      await service.joinMatch('ABCD', CALLER_ID);

      expect(eventEmitter.emit).toHaveBeenCalledWith('match:start', expect.objectContaining({ match: saved }));
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

  // ─── cancelMatch ──────────────────────────────────────────────────────────

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

  // ─── abandonMatch ─────────────────────────────────────────────────────────

  describe('abandonMatch', () => {
    it('sets status to abandoned for player1', async () => {
      const match = makeMatch({ player1Id: CALLER_ID, player2Id: OTHER_ID });
      matchesRepo.findOne.mockResolvedValue(match);
      matchesRepo.save.mockImplementation(async (m) => m as Match);

      await service.abandonMatch(MATCH_ID, CALLER_ID);

      expect(matchesRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'abandoned' }));
    });

    it('flushes cached state to Postgres before clearing cache', async () => {
      const state = { board: ['X'] };
      const match = makeMatch({ player1Id: CALLER_ID });
      matchesRepo.findOne.mockResolvedValue(match);
      matchesRepo.save.mockImplementation(async (m) => m as Match);
      redis.get.mockResolvedValue(JSON.stringify(state));

      await service.abandonMatch(MATCH_ID, CALLER_ID);

      expect(matchesRepo.update).toHaveBeenCalledWith({ id: MATCH_ID }, { state });
    });

    it('clears match state and meta from Redis cache', async () => {
      const match = makeMatch({ player1Id: CALLER_ID });
      matchesRepo.findOne.mockResolvedValue(match);
      matchesRepo.save.mockImplementation(async (m) => m as Match);

      await service.abandonMatch(MATCH_ID, CALLER_ID);

      expect(redis.del).toHaveBeenCalledWith(`match:state:${MATCH_ID}`, `match:meta:${MATCH_ID}`);
    });

    it('emits match:over event', async () => {
      const match = makeMatch({ player1Id: CALLER_ID });
      matchesRepo.findOne.mockResolvedValue(match);
      matchesRepo.save.mockImplementation(async (m) => m as Match);

      await service.abandonMatch(MATCH_ID, CALLER_ID);

      expect(eventEmitter.emit).toHaveBeenCalledWith('match:over', expect.objectContaining({ match }));
    });

    it('throws NotFoundException when match does not exist in Postgres', async () => {
      matchesRepo.findOne.mockResolvedValue(null);
      await expect(service.abandonMatch('ghost-id', CALLER_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when caller is not a player', async () => {
      matchesRepo.findOne.mockResolvedValue(makeMatch({ player1Id: OTHER_ID, player2Id: 'THIRD0001' }));
      await expect(service.abandonMatch(MATCH_ID, CALLER_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── submitAction ─────────────────────────────────────────────────────────

  describe('submitAction', () => {
    const finalState = { board: ['X'] };
    const action = { type: 'place', cell: 0 };
    const events = [{ move: action, state: finalState, playerIndex: 2 }];

    it('throws NotFoundException when match meta is not found', async () => {
      matchesRepo.findOne.mockResolvedValue(null);

      await expect(service.submitAction(MATCH_ID, CALLER_ID, action)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when caller is not a player', async () => {
      mockRedisGet({ meta: makeMetaJson({ player1Id: OTHER_ID, player2Id: 'THIRD' }) });

      await expect(service.submitAction(MATCH_ID, CALLER_ID, action)).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when match is not active', async () => {
      mockRedisGet({ meta: makeMetaJson({ status: 'completed' }) });

      await expect(service.submitAction(MATCH_ID, CALLER_ID, action)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when plugin rejects the action', async () => {
      mockRedisGet({ meta: makeMetaJson(), state: JSON.stringify({ board: [] }) });
      mockPlugin.applyAction.mockImplementation(() => { throw new Error('Invalid move'); });

      await expect(service.submitAction(MATCH_ID, CALLER_ID, action)).rejects.toThrow(BadRequestException);
    });

    it('returns early without persisting or emitting when plugin returns empty events', async () => {
      mockRedisGet({ meta: makeMetaJson(), state: JSON.stringify({ board: [] }) });
      mockPlugin.applyAction.mockReturnValue([]);

      await service.submitAction(MATCH_ID, CALLER_ID, action);

      expect(redis.set).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('persists final state and emits match:moves on a valid action', async () => {
      mockRedisGet({ meta: makeMetaJson(), state: JSON.stringify({ board: [] }) });
      mockPlugin.applyAction.mockReturnValue(events);

      await service.submitAction(MATCH_ID, CALLER_ID, action);

      expect(redis.set).toHaveBeenCalledWith(
        `match:state:${MATCH_ID}`, JSON.stringify(finalState), 'PX', expect.any(Number),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'match:moves', expect.objectContaining({ matchId: MATCH_ID }),
      );
    });

    it('marks the match completed, clears cache, and emits match:over when game ends', async () => {
      mockRedisGet({ meta: makeMetaJson(), state: JSON.stringify({ board: [] }) });
      mockPlugin.applyAction.mockReturnValue(events);
      mockPlugin.isGameOver.mockReturnValue(true);
      matchesRepo.findOneOrFail.mockResolvedValue(makeMatch());
      matchesRepo.save.mockImplementation(async (m) => m as Match);

      await service.submitAction(MATCH_ID, CALLER_ID, action);

      expect(matchesRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
      expect(redis.del).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith('match:over', expect.anything());
    });
  });

  // ─── getStateFromCache ────────────────────────────────────────────────────

  describe('getStateFromCache', () => {
    it('returns cached state when Redis has it', async () => {
      const state = { board: ['X'] };
      redis.get.mockResolvedValue(JSON.stringify(state));

      const result = await service.getStateFromCache(MATCH_ID);

      expect(result).toEqual(state);
      expect(matchesRepo.findOne).not.toHaveBeenCalled();
    });

    it('falls back to Postgres and re-caches when Redis misses', async () => {
      const state = { board: [] };
      matchesRepo.findOne.mockResolvedValue(makeMatch({ state }));

      const result = await service.getStateFromCache(MATCH_ID);

      expect(result).toEqual(state);
      expect(redis.set).toHaveBeenCalledWith(
        `match:state:${MATCH_ID}`, JSON.stringify(state), 'PX', expect.any(Number),
      );
    });

    it('throws NotFoundException when neither Redis nor Postgres has the match', async () => {
      matchesRepo.findOne.mockResolvedValue(null);

      await expect(service.getStateFromCache(MATCH_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── persistState ─────────────────────────────────────────────────────────

  describe('persistState', () => {
    it('writes state to Redis with 1-hour TTL', async () => {
      const state = { board: ['X', null] };

      await service.persistState(MATCH_ID, state as any);

      expect(redis.set).toHaveBeenCalledWith(
        `match:state:${MATCH_ID}`, JSON.stringify(state), 'PX', 60 * 60 * 1000,
      );
    });
  });

  // ─── flushStateToDB ───────────────────────────────────────────────────────

  describe('flushStateToDB', () => {
    it('reads state from Redis and updates Postgres', async () => {
      const state = { board: ['X'] };
      redis.get.mockResolvedValue(JSON.stringify(state));

      await service.flushStateToDB(MATCH_ID);

      expect(matchesRepo.update).toHaveBeenCalledWith({ id: MATCH_ID }, { state });
    });

    it('does nothing when Redis has no cached state', async () => {
      await service.flushStateToDB(MATCH_ID);

      expect(matchesRepo.update).not.toHaveBeenCalled();
    });
  });

  // ─── listPendingMatches ───────────────────────────────────────────────────

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

  // ─── listActiveMatches ────────────────────────────────────────────────────

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

  // ─── listCompletedMatches ─────────────────────────────────────────────────

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

  // ─── getMatchOpponent ─────────────────────────────────────────────────────

  describe('getMatchOpponent', () => {
    it('returns player2Id when caller is player1', async () => {
      redis.get.mockResolvedValue(makeMetaJson({ player1Id: CALLER_ID, player2Id: OTHER_ID }));

      expect(await service.getMatchOpponent(MATCH_ID, CALLER_ID)).toBe(OTHER_ID);
    });

    it('returns player1Id when caller is player2', async () => {
      redis.get.mockResolvedValue(makeMetaJson({ player1Id: OTHER_ID, player2Id: CALLER_ID }));

      expect(await service.getMatchOpponent(MATCH_ID, CALLER_ID)).toBe(OTHER_ID);
    });

    it('returns null when caller is not in the match', async () => {
      redis.get.mockResolvedValue(makeMetaJson({ player1Id: OTHER_ID, player2Id: 'THIRD' }));

      expect(await service.getMatchOpponent(MATCH_ID, CALLER_ID)).toBeNull();
    });
  });

  // ─── getMatchGame ─────────────────────────────────────────────────────────

  describe('getMatchGame', () => {
    it('returns gameId for a known match', async () => {
      redis.get.mockResolvedValue(makeMetaJson());

      expect(await service.getMatchGame(MATCH_ID)).toBe('tictactoe');
    });

    it('returns null when match meta is not found', async () => {
      matchesRepo.findOne.mockResolvedValue(null);

      expect(await service.getMatchGame(MATCH_ID)).toBeNull();
    });
  });

  // ─── getPlayerIndex ───────────────────────────────────────────────────────

  describe('getPlayerIndex', () => {
    it('returns 1 when user is player1', async () => {
      redis.get.mockResolvedValue(makeMetaJson({ player1Id: CALLER_ID }));

      expect(await service.getPlayerIndex(MATCH_ID, CALLER_ID)).toBe(1);
    });

    it('returns 2 when user is player2', async () => {
      redis.get.mockResolvedValue(makeMetaJson({ player1Id: OTHER_ID, player2Id: CALLER_ID }));

      expect(await service.getPlayerIndex(MATCH_ID, CALLER_ID)).toBe(2);
    });

    it('returns null when user is not in the match', async () => {
      redis.get.mockResolvedValue(makeMetaJson({ player1Id: OTHER_ID, player2Id: 'THIRD' }));

      expect(await service.getPlayerIndex(MATCH_ID, CALLER_ID)).toBeNull();
    });
  });

  // ─── getPlayerView ────────────────────────────────────────────────────────

  describe('getPlayerView', () => {
    it('returns view from plugin for an active match', async () => {
      const state = { board: [] };
      mockRedisGet({ meta: makeMetaJson(), state: JSON.stringify(state) });

      const result = await service.getPlayerView(MATCH_ID, 1);

      expect(mockPlugin.getPlayerView).toHaveBeenCalledWith(state, 1);
      expect(result).toEqual({ cells: [] });
    });

    it('returns null when match is not active', async () => {
      redis.get.mockResolvedValue(makeMetaJson({ status: 'completed' }));

      expect(await service.getPlayerView(MATCH_ID, 1)).toBeNull();
    });

    it('returns null when match meta is not found', async () => {
      matchesRepo.findOne.mockResolvedValue(null);

      expect(await service.getPlayerView(MATCH_ID, 1)).toBeNull();
    });
  });

  // ─── findMatch ────────────────────────────────────────────────────────────

  describe('findMatch', () => {
    it('returns the match from the repository', async () => {
      const match = makeMatch();
      matchesRepo.findOne.mockResolvedValue(match);

      const result = await service.findMatch(MATCH_ID);

      expect(result).toBe(match);
      expect(matchesRepo.findOne).toHaveBeenCalledWith({ where: { id: MATCH_ID } });
    });

    it('returns null when the match does not exist', async () => {
      matchesRepo.findOne.mockResolvedValue(null);

      expect(await service.findMatch(MATCH_ID)).toBeNull();
    });
  });

  // ─── pushReplay ───────────────────────────────────────────────────────────

  describe('pushReplay', () => {
    const initialView = { cells: [] };
    const steps = [{ move: { type: 'place' }, view: { cells: ['X'] }, playerIndex: 1 }];

    it('does nothing when steps array is empty', async () => {
      await service.pushReplay(MATCH_ID, initialView, CALLER_ID, []);

      expect(redis.set).not.toHaveBeenCalled();
    });

    it('creates a new replay with initialView and steps when no existing replay', async () => {
      await service.pushReplay(MATCH_ID, initialView, CALLER_ID, steps);

      const stored = JSON.parse(redis.set.mock.calls[0][1]);
      expect(stored.initialView).toEqual(initialView);
      expect(stored.steps).toEqual(steps);
      expect(redis.set).toHaveBeenCalledWith(
        `match:replay:${MATCH_ID}:${CALLER_ID}`, expect.any(String), 'PX', expect.any(Number),
      );
    });

    it('appends steps to an existing replay without overwriting initialView', async () => {
      const existing = { initialView, steps: [{ move: {}, view: {}, playerIndex: 2 }] };
      redis.get.mockResolvedValue(JSON.stringify(existing));

      await service.pushReplay(MATCH_ID, initialView, CALLER_ID, steps);

      const stored = JSON.parse(redis.set.mock.calls[0][1]);
      expect(stored.steps).toHaveLength(2);
      expect(stored.initialView).toEqual(initialView);
    });
  });

  // ─── popReplay ────────────────────────────────────────────────────────────

  describe('popReplay', () => {
    it('returns parsed replay and deletes the Redis key', async () => {
      const replay = { initialView: { cells: [] }, steps: [] };
      redis.getdel.mockResolvedValue(JSON.stringify(replay));

      const result = await service.popReplay(MATCH_ID, CALLER_ID);

      expect(redis.getdel).toHaveBeenCalledWith(`match:replay:${MATCH_ID}:${CALLER_ID}`);
      expect(result).toEqual(replay);
    });

    it('returns null when no replay exists', async () => {
      expect(await service.popReplay(MATCH_ID, CALLER_ID)).toBeNull();
    });
  });

  // ─── cleanupStaleMatches ──────────────────────────────────────────────────

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
