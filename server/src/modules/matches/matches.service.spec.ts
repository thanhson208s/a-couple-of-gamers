import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LessThanOrEqual } from 'typeorm';
import { MatchesService } from './matches.service';
import { Match } from './match.entity';
import { GamesService } from '../games/games.service';
import { GamesRegistry } from '../games/games.registry';
import { Game, GameStatus } from '../games/game.entity';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
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
    status: 'pending',
    state: {},
    options: null,
    player1Id: OTHER_ID,
    player2Id: null,

    currentTurn: null,
    winner: null,
    inviteCode: 'ABCD',
    inviteCodeExpiresAt: new Date(Date.now() + 86_400_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Match;
}

describe('MatchesService', () => {
  let service: MatchesService;
  let matchesRepo: ReturnType<typeof mockRepository<Match>>;
  let gamesService: jest.Mocked<Pick<GamesService, 'findBySlug'>>;
  let gamesRegistry: jest.Mocked<Pick<GamesRegistry, 'get'>>;
  let redis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  const mockPlugin = { initialState: jest.fn().mockReturnValue({ board: [] }) };

  beforeEach(async () => {
    matchesRepo = mockRepository<Match>();
    gamesService = { findBySlug: jest.fn() };
    gamesRegistry = { get: jest.fn().mockReturnValue(mockPlugin) };
    redis = { get: jest.fn(), set: jest.fn(), del: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        MatchesService,
        { provide: getRepositoryToken(Match), useValue: matchesRepo },
        { provide: GamesService, useValue: gamesService },
        { provide: GamesRegistry, useValue: gamesRegistry },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();
    service = module.get(MatchesService);
  });

  describe('createMatch', () => {
    it('creates a pending match and returns id, inviteCode, deepLink, and expiresAt', async () => {
      const game = makeGame();
      gamesService.findBySlug.mockResolvedValue(game);
      const saved = makeMatch({ id: 'new-match', inviteCode: 'WXYZ', player1Id: CALLER_ID });
      matchesRepo.create.mockReturnValue(saved);
      matchesRepo.save.mockResolvedValue(saved);

      const result = await service.createMatch('tictactoe', 1, CALLER_ID) as any;

      expect(result.id).toBe('new-match');
      expect(result.inviteCode).toBe('WXYZ');
      expect(result.deepLink).toBe('acog://join?code=WXYZ');
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('assigns the caller to player slot 2 when playerSlot is 2', async () => {
      gamesService.findBySlug.mockResolvedValue(makeGame());
      matchesRepo.create.mockImplementation((data) => ({ ...data } as Match));
      matchesRepo.save.mockImplementation(async (m) => ({ ...m, id: 'new' } as Match));

      await service.createMatch('tictactoe', 2, CALLER_ID);

      expect(matchesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ player1Id: null, player2Id: CALLER_ID }),
      );
    });

    it('throws NotFoundException when the game slug is not found', async () => {
      gamesService.findBySlug.mockResolvedValue(null);
      await expect(service.createMatch('ghost', 1, CALLER_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when no plugin is registered for the game', async () => {
      gamesService.findBySlug.mockResolvedValue(makeGame());
      gamesRegistry.get.mockImplementation(() => { throw new Error('No plugin registered for game: tictactoe'); });
      await expect(service.createMatch('tictactoe', 1, CALLER_ID)).rejects.toThrow(BadRequestException);
    });
  });

  describe('joinMatch', () => {
    it('transitions match to active and initialises game state', async () => {
      const match = makeMatch();
      matchesRepo.findOne.mockResolvedValue(match);
      matchesRepo.save.mockImplementation(async (m) => m as Match);

      const result = await service.joinMatch('ABCD', CALLER_ID);

      expect(result.status).toBe('active');
      expect(result.player2Id).toBe(CALLER_ID);
      expect(result.inviteCode).toBeNull();
      expect(mockPlugin.initialState).toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown invite code', async () => {
      matchesRepo.findOne.mockResolvedValue(null);
      await expect(service.joinMatch('ZZZZ', CALLER_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws GoneException when the invite code has expired', async () => {
      matchesRepo.findOne.mockResolvedValue(
        makeMatch({ inviteCodeExpiresAt: new Date(Date.now() - 1000) }),
      );
      await expect(service.joinMatch('ABCD', CALLER_ID)).rejects.toThrow(GoneException);
    });

    it('throws ConflictException when the match is no longer pending', async () => {
      matchesRepo.findOne.mockResolvedValue(makeMatch({ status: 'active' }));
      await expect(service.joinMatch('ABCD', CALLER_ID)).rejects.toThrow(ConflictException);
    });

    it('throws ForbiddenException when the caller is already a player in the match', async () => {
      matchesRepo.findOne.mockResolvedValue(makeMatch({ player1Id: CALLER_ID }));
      await expect(service.joinMatch('ABCD', CALLER_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('listMatches', () => {
    describe('completed = false', () => {
      it('returns pending and active matches for the user', async () => {
        const matches = [makeMatch({ player1Id: CALLER_ID }), makeMatch({ player2Id: CALLER_ID, status: 'active' })];
        matchesRepo.find.mockResolvedValue(matches);

        const result = await service.listMatches(CALLER_ID, false);

        expect(result).toBe(matches);
      });

      it('queries four OR conditions covering both player slots for pending and active', async () => {
        matchesRepo.find.mockResolvedValue([]);

        await service.listMatches(CALLER_ID, false);

        const [callArg] = matchesRepo.find.mock.calls[0]!;
        const conditions = (callArg as any).where as any[];
        expect(conditions).toHaveLength(4);
        expect(conditions.some((c) => c.player1Id === CALLER_ID && c.status === 'pending')).toBe(true);
        expect(conditions.some((c) => c.player2Id === CALLER_ID && c.status === 'pending')).toBe(true);
        expect(conditions.some((c) => c.player1Id === CALLER_ID && c.status === 'active')).toBe(true);
        expect(conditions.some((c) => c.player2Id === CALLER_ID && c.status === 'active')).toBe(true);
      });

      it('filters pending matches by non-expired invite code', async () => {
        matchesRepo.find.mockResolvedValue([]);

        await service.listMatches(CALLER_ID, false);

        const [callArg] = matchesRepo.find.mock.calls[0]!;
        const conditions = (callArg as any).where as any[];
        const pendingConditions = conditions.filter((c) => c.status === 'pending');
        pendingConditions.forEach((c) => expect(c.inviteCodeExpiresAt).toBeDefined());
      });

      it('filters active matches by inactivity cutoff', async () => {
        matchesRepo.find.mockResolvedValue([]);

        await service.listMatches(CALLER_ID, false);

        const [callArg] = matchesRepo.find.mock.calls[0]!;
        const conditions = (callArg as any).where as any[];
        const activeConditions = conditions.filter((c) => c.status === 'active');
        activeConditions.forEach((c) => expect(c.updatedAt).toBeDefined());
      });
    });

    describe('completed = true', () => {
      it('returns completed matches for the user', async () => {
        const matches = [makeMatch({ player1Id: CALLER_ID, status: 'completed' })];
        matchesRepo.find.mockResolvedValue(matches);

        const result = await service.listMatches(CALLER_ID, true);

        expect(result).toBe(matches);
      });

      it('queries completed status for both player slots', async () => {
        matchesRepo.find.mockResolvedValue([]);

        await service.listMatches(CALLER_ID, true);

        const [callArg] = matchesRepo.find.mock.calls[0]!;
        const conditions = (callArg as any).where as any[];
        expect(conditions.every((c: any) => c.status === 'completed')).toBe(true);
        expect(conditions.some((c: any) => c.player1Id === CALLER_ID)).toBe(true);
        expect(conditions.some((c: any) => c.player2Id === CALLER_ID)).toBe(true);
      });

      it('orders by updatedAt DESC and limits to 10 results', async () => {
        matchesRepo.find.mockResolvedValue([]);

        await service.listMatches(CALLER_ID, true);

        const [callArg] = matchesRepo.find.mock.calls[0]!;
        expect((callArg as any).order).toEqual({ updatedAt: 'DESC' });
        expect((callArg as any).take).toBe(10);
        expect((callArg as any).skip).toBe(0);
      });
    });
  });

  describe('cleanupStaleMatches', () => {
    it('deletes expired pending matches and idle active matches', async () => {
      matchesRepo.delete.mockResolvedValue({ affected: 0, raw: [] });

      await service.cleanupStaleMatches();

      expect(matchesRepo.delete).toHaveBeenCalledTimes(2);
      // First call: expired pending
      expect(matchesRepo.delete).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending', inviteCodeExpiresAt: expect.anything() }),
      );
      // Second call: idle active
      expect(matchesRepo.delete).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'active', updatedAt: expect.anything() }),
      );
    });
  });
});
