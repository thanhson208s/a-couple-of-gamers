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
import { mockRepository } from '../../common/test/helpers';

const CALLER_ID = 'CALLER0001';
const OTHER_ID  = 'OTHER00001';

function makeGame(overrides: Partial<Game> = {}): Game {
  return { id: 'g1', slug: 'tictactoe', status: GameStatus.Enabled, remoteUrl: null, remoteVersion: null, name: 'Tic-Tac-Toe', ...overrides } as Game;
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
    player1GuestUuid: null,
    player2GuestUuid: null,
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
  const mockPlugin = { initialState: jest.fn().mockReturnValue({ board: [] }) };

  beforeEach(async () => {
    matchesRepo = mockRepository<Match>();
    gamesService = { findBySlug: jest.fn() };
    gamesRegistry = { get: jest.fn().mockReturnValue(mockPlugin) };

    const module = await Test.createTestingModule({
      providers: [
        MatchesService,
        { provide: getRepositoryToken(Match), useValue: matchesRepo },
        { provide: GamesService, useValue: gamesService },
        { provide: GamesRegistry, useValue: gamesRegistry },
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
    it('queries pending and active matches for the given user', async () => {
      const matches = [makeMatch({ player1Id: CALLER_ID })];
      matchesRepo.find.mockResolvedValue(matches);

      const result = await service.listMatches(CALLER_ID);

      expect(result).toBe(matches);
      // Verify that find was called with conditions covering both player slots
      const callArg = matchesRepo.find.mock.calls[0]![0]!;
      expect(Array.isArray(callArg.where)).toBe(true);
      const conditions = callArg.where as object[];
      expect(conditions.some((c: any) => c.player1Id === CALLER_ID)).toBe(true);
      expect(conditions.some((c: any) => c.player2Id === CALLER_ID)).toBe(true);
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
