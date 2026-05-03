import { ForbiddenException, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { UserFavorite } from './user-favorite.entity';
import { UserRival } from './user-rival.entity';
import { UserDevice } from './user-device.entity';
import { Game, GameType } from '../games/game.entity';
import { mockRepository } from '../../common/helpers/test.helper';
import { FIREBASE_AUTH } from '../../common/firebase/firebase.module';
import { GamesRegistry } from '../games/games.registry';

describe('UsersService', () => {
  let service: UsersService;
  let usersRepo: ReturnType<typeof mockRepository<User>> & { findOneOrFail: jest.Mock };
  let userFavoritesRepo: ReturnType<typeof mockRepository<UserFavorite>>;
  let userRivalsRepo: ReturnType<typeof mockRepository<UserRival>>;
  let userDevicesRepo: ReturnType<typeof mockRepository<UserDevice>>;
  let gamesRepo: ReturnType<typeof mockRepository<Game>>;
  let firebaseAuth: { deleteUser: jest.Mock; verifyIdToken: jest.Mock };
  let gamesRegistry: { getType: jest.Mock };

  beforeEach(async () => {
    usersRepo = { ...mockRepository<User>(), findOneOrFail: jest.fn() };
    userFavoritesRepo = mockRepository<UserFavorite>();
    userRivalsRepo = mockRepository<UserRival>();
    userDevicesRepo = mockRepository<UserDevice>();
    gamesRepo = mockRepository<Game>();
    firebaseAuth = { deleteUser: jest.fn(), verifyIdToken: jest.fn() };
    gamesRegistry = { getType: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: getRepositoryToken(UserFavorite), useValue: userFavoritesRepo },
        { provide: getRepositoryToken(UserRival), useValue: userRivalsRepo },
        { provide: getRepositoryToken(UserDevice), useValue: userDevicesRepo },
        { provide: getRepositoryToken(Game), useValue: gamesRepo },
        { provide: FIREBASE_AUTH, useValue: firebaseAuth },
        { provide: GamesRegistry, useValue: gamesRegistry },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  describe('findById', () => {
    it('returns the user when found', async () => {
      const user = { id: 'ABCD123456', provider: 'guest' } as User;
      usersRepo.findOne.mockResolvedValue(user);

      const result = await service.findById('ABCD123456');

      expect(result).toBe(user);
      expect(usersRepo.findOne).toHaveBeenCalledWith({ where: { id: 'ABCD123456' } });
    });

    it('returns null when not found', async () => {
      usersRepo.findOne.mockResolvedValue(null);
      expect(await service.findById('UNKNOWN')).toBeNull();
    });
  });

  describe('findOrCreate', () => {
    it('returns the existing user without inserting', async () => {
      const existing = { id: 'ABCD123456', provider: 'guest', providerId: 'uid-1' } as User;
      usersRepo.findOne.mockResolvedValue(existing);

      const result = await service.findOrCreate('guest', 'uid-1', 'guest_uid-1');

      expect(result).toBe(existing);
      expect(usersRepo.save).not.toHaveBeenCalled();
    });

    it('generates an ID and inserts a new user when none exists', async () => {
      usersRepo.findOne.mockResolvedValue(null);
      usersRepo.existsBy.mockResolvedValue(false); // ID is unique on first try
      usersRepo.create.mockImplementation((data) => ({ ...data } as User));
      usersRepo.save.mockImplementation(async (u) => u as User);

      const result = await service.findOrCreate('guest', 'uid-new', 'guest_uid-new');

      expect(usersRepo.save).toHaveBeenCalledTimes(1);
      expect(result.provider).toBe('guest');
      expect(result.providerId).toBe('uid-new');
      expect(typeof result.id).toBe('string');
      expect(result.id).toHaveLength(10);
    });

    it('throws InternalServerErrorException after 5 consecutive ID collisions', async () => {
      usersRepo.findOne.mockResolvedValue(null);
      // Every generated ID already exists
      usersRepo.existsBy.mockResolvedValue(true);

      await expect(service.findOrCreate('guest', 'uid-x', 'guest_uid-x')).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(usersRepo.existsBy).toHaveBeenCalledTimes(5);
      expect(usersRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('findOrUpsertByFirebaseUid', () => {
    it('generates an ID and inserts a new user when none exists', async () => {
      usersRepo.findOne.mockResolvedValue(null);
      usersRepo.existsBy.mockResolvedValue(false);
      usersRepo.create.mockImplementation((data) => ({ ...data } as any));
      usersRepo.save.mockImplementation(async (u) => u as User);

      const result = await service.findOrUpsertByFirebaseUid('firebase-uid', 'provider.com', "abc");

      expect(usersRepo.save).toHaveBeenCalledTimes(1);
      expect(result.provider).toBe('provider.com');
      expect(result.providerId).toBe('firebase-uid');
      expect(result.displayName).toBe('abc');
      expect(typeof result.id).toBe('string');
      expect(result.id).toHaveLength(10);
    });

    it('creates new user using email if display name is not provided', async () => {
      usersRepo.findOne.mockResolvedValue(null);
      usersRepo.existsBy.mockResolvedValue(false);
      usersRepo.create.mockImplementation((data) => ({ ...data } as any));
      usersRepo.save.mockImplementation(async (u) => u as User);

      const result = await service.findOrUpsertByFirebaseUid('firebase-uid', 'provider.com', undefined, "abc@abc.com");

      expect(usersRepo.save).toHaveBeenCalledTimes(1);
      expect(result.provider).toBe('provider.com');
      expect(result.providerId).toBe('firebase-uid');
      expect(result.displayName).toBe('abc');
      expect(typeof result.id).toBe('string');
      expect(result.id).toHaveLength(10);
    });

    it('creates new user with auto generated name when both display name and email are missing', async () => {
      usersRepo.findOne.mockResolvedValue(null);
      usersRepo.existsBy.mockResolvedValue(false);
      usersRepo.create.mockImplementation((data) => ({ ...data } as any));
      usersRepo.save.mockImplementation(async (u) => u as User);

      const result = await service.findOrUpsertByFirebaseUid('firebase-uid', 'provider.com', undefined, undefined);

      expect(usersRepo.save).toHaveBeenCalledTimes(1);
      expect(result.provider).toBe('provider.com');
      expect(result.providerId).toBe('firebase-uid');
      expect(result.displayName).toBe('Gamer' + result.id);
      expect(typeof result.id).toBe('string');
      expect(result.id).toHaveLength(10);
    });

    it('updates provider, displayName and avatarUrl on first social login', async () => {
      const user = { id: '0123456789', provider: 'anonymous', displayName: 'Gamer0123456789', avatarUrl: null } as User;
      usersRepo.findOne.mockResolvedValue(user);
      usersRepo.save.mockImplementation(async (u) => u as User);

      const result = await service.findOrUpsertByFirebaseUid('firebase-uid', 'google.com', 'Alice', undefined, 'https://photo.jpg');

      expect(usersRepo.save).toHaveBeenCalledTimes(1);
      expect(result.provider).toBe('google.com');
      expect(result.displayName).toBe('Alice');
      expect(result.avatarUrl).toBe('https://photo.jpg');
    });

    it('does not overwrite displayName or avatarUrl when they are undefined on provider change', async () => {
      const user = { id: '0123456789', provider: 'anonymous', displayName: 'Gamer0123456789', avatarUrl: null } as User;
      usersRepo.findOne.mockResolvedValue(user);
      usersRepo.save.mockImplementation(async (u) => u as User);

      await service.findOrUpsertByFirebaseUid('firebase-uid', 'google.com');

      expect(usersRepo.save).toHaveBeenCalledTimes(1);
      expect(user.displayName).toBe('Gamer0123456789');
      expect(user.avatarUrl).toBeNull();
    });

    it('does not update displayName or avatarUrl when new provider is non-social', async () => {
      const user = { id: '0123456789', provider: 'anonymous', displayName: 'Gamer0123456789', avatarUrl: null } as User;
      usersRepo.findOne.mockResolvedValue(user);
      usersRepo.save.mockImplementation(async (u) => u as User);

      await service.findOrUpsertByFirebaseUid('firebase-uid', 'dev', 'Dev User', undefined, 'https://photo.jpg');

      expect(usersRepo.save).toHaveBeenCalledTimes(1);
      expect(user.displayName).toBe('Gamer0123456789');
      expect(user.avatarUrl).toBeNull();
    });

    it('does not overwrite displayName or avatarUrl on re-login with same provider', async () => {
      const user = { id: '0123456789', provider: 'google.com', displayName: 'Alice', avatarUrl: 'https://original.jpg' } as User;
      usersRepo.findOne.mockResolvedValue(user);

      await service.findOrUpsertByFirebaseUid('firebase-uid', 'google.com', 'New Name', undefined, 'https://new.jpg');

      expect(usersRepo.save).not.toHaveBeenCalled();
      expect(user.displayName).toBe('Alice');
      expect(user.avatarUrl).toBe('https://original.jpg');
    });
  });

  describe('getProfile', () => {
    const user = { id: 'ABCD123456', provider: 'google.com', displayName: 'Test User', avatarUrl: 'https://photo.example.com/u.jpg' } as User;

    it('returns id, provider, displayName, avatarUrl, favorite slugs, and favoritesLimit', async () => {
      usersRepo.findOne.mockResolvedValue(user);
      userFavoritesRepo.find.mockResolvedValue([
        { userId: user.id, gameId: 'tictactoe', game: { id: 'tictactoe' } },
        { userId: user.id, gameId: 'chess', game: { id: 'chess' } },
      ] as UserFavorite[]);

      const result = await service.getProfile(user.id);

      expect(result).toEqual({ id: 'ABCD123456', provider: 'google.com', displayName: 'Test User', avatarUrl: 'https://photo.example.com/u.jpg', favorites: ['tictactoe', 'chess'], favoritesLimit: UsersService.getFavoriteLimit('social') });
      expect(usersRepo.findOne).toHaveBeenCalledWith({ where: { id: user.id } });
      expect(userFavoritesRepo.find).toHaveBeenCalledWith({ where: { userId: user.id }, relations: ['game'] });
    });

    it('returns null avatarUrl and empty favorites when user has none', async () => {
      usersRepo.findOne.mockResolvedValue({ ...user, avatarUrl: null } as User);
      userFavoritesRepo.find.mockResolvedValue([]);

      const result = await service.getProfile(user.id);

      expect(result.avatarUrl).toBeNull();
      expect(result.favorites).toEqual([]);
    });

    it('returns anonymous favoritesLimit for anonymous users', async () => {
      usersRepo.findOne.mockResolvedValue({ ...user, provider: 'anonymous' } as User);
      userFavoritesRepo.find.mockResolvedValue([]);

      const result = await service.getProfile(user.id);

      expect(result.favoritesLimit).toBe(UsersService.getFavoriteLimit('anonymous'));
    });

    it('throws NotFoundException when user does not exist', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      await expect(service.getProfile('NOTEXISTS')).rejects.toThrow(NotFoundException);
      expect(userFavoritesRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('deleteAccount', () => {
    const user = { id: 'ABCD123456', providerId: 'firebase-uid-123', provider: 'google.com' } as User;
    const now = Math.floor(Date.now() / 1000);
    const freshIat = now - 60;   // 1 min ago — within 5-min window
    const staleIat = now - 400;  // ~6.7 min ago — outside 5-min window

    it('deletes DB record and Firebase account when token is fresh and user matches', async () => {
      firebaseAuth.verifyIdToken.mockResolvedValue({ uid: user.providerId, iat: freshIat });
      usersRepo.findOne.mockResolvedValue(user);
      usersRepo.delete.mockResolvedValue({ affected: 1, raw: [] });
      firebaseAuth.deleteUser.mockResolvedValue(undefined);

      await service.deleteAccount(user.id, 'valid-id-token');

      expect(usersRepo.delete).toHaveBeenCalledWith(user.id);
      expect(firebaseAuth.deleteUser).toHaveBeenCalledWith(user.providerId);
    });

    it('throws UnauthorizedException when token is stale', async () => {
      firebaseAuth.verifyIdToken.mockResolvedValue({ uid: user.providerId, iat: staleIat });

      await expect(service.deleteAccount(user.id, 'stale-token')).rejects.toThrow(UnauthorizedException);
      expect(usersRepo.delete).not.toHaveBeenCalled();
      expect(firebaseAuth.deleteUser).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when decoded uid resolves to a different DB user', async () => {
      const otherUser = { id: 'ZZZZZZZZZZ', providerId: user.providerId, provider: 'google.com' } as User;
      firebaseAuth.verifyIdToken.mockResolvedValue({ uid: user.providerId, iat: freshIat });
      usersRepo.findOne.mockResolvedValue(otherUser);

      await expect(service.deleteAccount(user.id, 'valid-id-token')).rejects.toThrow(UnauthorizedException);
      expect(usersRepo.delete).not.toHaveBeenCalled();
    });

    it('skips DB delete but still removes Firebase account when user not found in DB', async () => {
      firebaseAuth.verifyIdToken.mockResolvedValue({ uid: 'orphan-firebase-uid', iat: freshIat });
      usersRepo.findOne.mockResolvedValue(null);
      firebaseAuth.deleteUser.mockResolvedValue(undefined);

      await service.deleteAccount(user.id, 'valid-id-token');

      expect(usersRepo.delete).not.toHaveBeenCalled();
      expect(firebaseAuth.deleteUser).toHaveBeenCalledWith('orphan-firebase-uid');
    });

    it('throws UnauthorizedException when Firebase token verification fails', async () => {
      firebaseAuth.verifyIdToken.mockRejectedValue(new Error('token-invalid'));

      await expect(service.deleteAccount(user.id, 'bad-token')).rejects.toThrow(UnauthorizedException);
      expect(usersRepo.delete).not.toHaveBeenCalled();
      expect(firebaseAuth.deleteUser).not.toHaveBeenCalled();
    });
  });

  describe('addFavorite', () => {
    const userId = 'ABCD123456';
    const game = { id: 'tictactoe' } as Game;

    it('saves a new favorite for a social user below the limit', async () => {
      usersRepo.findOne.mockResolvedValue({ id: userId, provider: 'google.com' } as User);
      gamesRepo.existsBy.mockResolvedValue(true);
      userFavoritesRepo.findOne.mockResolvedValue(null);
      userFavoritesRepo.count.mockResolvedValue(0);
      userFavoritesRepo.create.mockImplementation((data) => ({ ...data } as UserFavorite));
      userFavoritesRepo.save.mockImplementation(async (f) => f as UserFavorite);

      await service.addFavorite(userId, 'tictactoe');

      expect(gamesRepo.existsBy).toHaveBeenCalledWith({ id: 'tictactoe' });
      expect(userFavoritesRepo.save).toHaveBeenCalledTimes(1);
    });

    it('saves a new favorite for an anonymous user below the limit', async () => {
      usersRepo.findOne.mockResolvedValue({ id: userId, provider: 'anonymous' } as User);
      gamesRepo.existsBy.mockResolvedValue(true);
      userFavoritesRepo.findOne.mockResolvedValue(null);
      userFavoritesRepo.count.mockResolvedValue(2);
      userFavoritesRepo.create.mockImplementation((data) => ({ ...data } as UserFavorite));
      userFavoritesRepo.save.mockImplementation(async (f) => f as UserFavorite);

      await service.addFavorite(userId, 'tictactoe');

      expect(userFavoritesRepo.save).toHaveBeenCalledTimes(1);
    });

    it('throws ForbiddenException when anonymous user reaches the limit', async () => {
      usersRepo.findOne.mockResolvedValue({ id: userId, provider: 'anonymous' } as User);
      gamesRepo.existsBy.mockResolvedValue(true);
      userFavoritesRepo.findOne.mockResolvedValue(null);
      userFavoritesRepo.count.mockResolvedValue(UsersService.getFavoriteLimit('anonymous'));

      await expect(service.addFavorite(userId, 'tictactoe')).rejects.toThrow(ForbiddenException);
      expect(userFavoritesRepo.save).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when social user reaches the limit', async () => {
      usersRepo.findOne.mockResolvedValue({ id: userId, provider: 'google.com' } as User);
      gamesRepo.existsBy.mockResolvedValue(true);
      userFavoritesRepo.findOne.mockResolvedValue(null);
      userFavoritesRepo.count.mockResolvedValue(UsersService.getFavoriteLimit('social'));

      await expect(service.addFavorite(userId, 'tictactoe')).rejects.toThrow(ForbiddenException);
      expect(userFavoritesRepo.save).not.toHaveBeenCalled();
    });

    it('is idempotent when game is already favorited', async () => {
      usersRepo.findOne.mockResolvedValue({ id: userId, provider: 'google.com' } as User);
      gamesRepo.existsBy.mockResolvedValue(true);
      userFavoritesRepo.findOne.mockResolvedValue({ userId, gameId: game.id } as UserFavorite);

      await service.addFavorite(userId, 'tictactoe');

      expect(userFavoritesRepo.count).not.toHaveBeenCalled();
      expect(userFavoritesRepo.save).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when game does not exist', async () => {
      usersRepo.findOne.mockResolvedValue({ id: userId, provider: 'google.com' } as User);
      gamesRepo.existsBy.mockResolvedValue(false);

      await expect(service.addFavorite(userId, 'unknown')).rejects.toThrow(NotFoundException);
      expect(userFavoritesRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('removeFavorite', () => {
    const userId = 'ABCD123456';
    const game = { id: 'tictactoe' } as Game;

    it('deletes the favorite when game exists', async () => {
      gamesRepo.findOne.mockResolvedValue(game);
      userFavoritesRepo.delete.mockResolvedValue({ affected: 1, raw: [] });

      await service.removeFavorite(userId, 'tictactoe');

      expect(userFavoritesRepo.delete).toHaveBeenCalledWith({ userId, gameId: game.id });
    });

    it('is idempotent when favorite does not exist', async () => {
      userFavoritesRepo.delete.mockResolvedValue({ affected: 0, raw: [] });

      await service.removeFavorite(userId, 'unknown');

      expect(userFavoritesRepo.delete).toHaveBeenCalledWith({ userId, gameId: 'unknown' });
    });
  });

  describe('updateRival', () => {
    // P1 < P2 lexicographically so P1 is always userId1 in canonical order
    const P1 = 'AAAAAAAAAA';
    const P2 = 'ZZZZZZZZZZ';
    const gameId = 'tictactoe';

    beforeEach(() => {
      userRivalsRepo.existsBy.mockResolvedValue(true);
      userRivalsRepo.increment.mockResolvedValue(undefined as any);
    });

    describe('versus', () => {
      it('increments winCount when player1 (userId1) wins', async () => {
        await service.updateRival(P1, P2, gameId, 1, GameType.Versus);
        expect(userRivalsRepo.increment).toHaveBeenCalledWith({ userId1: P1, userId2: P2, gameId }, 'winCount', 1);
      });

      it('increments lossCount when player2 (userId2) wins', async () => {
        await service.updateRival(P1, P2, gameId, 2, GameType.Versus);
        expect(userRivalsRepo.increment).toHaveBeenCalledWith({ userId1: P1, userId2: P2, gameId }, 'lossCount', 1);
      });

      it('increments lossCount when player1 is userId2 and wins', async () => {
        // match player1=P2, player2=P1 — canonical userId1=P1, winner=1 means P2 (userId2) won
        await service.updateRival(P2, P1, gameId, 1, GameType.Versus);
        expect(userRivalsRepo.increment).toHaveBeenCalledWith({ userId1: P1, userId2: P2, gameId }, 'lossCount', 1);
      });

      it('increments winCount when player1 is userId2 and loses', async () => {
        // match player1=P2, player2=P1 — canonical userId1=P1, winner=2 means P1 (userId1) won
        await service.updateRival(P2, P1, gameId, 2, GameType.Versus);
        expect(userRivalsRepo.increment).toHaveBeenCalledWith({ userId1: P1, userId2: P2, gameId }, 'winCount', 1);
      });

      it('increments drawCount on draw', async () => {
        await service.updateRival(P1, P2, gameId, 0, GameType.Versus);
        expect(userRivalsRepo.increment).toHaveBeenCalledWith({ userId1: P1, userId2: P2, gameId }, 'drawCount', 1);
      });
    });

    describe('coop', () => {
      it('increments winCount when both win', async () => {
        await service.updateRival(P1, P2, gameId, 1, GameType.Coop);
        expect(userRivalsRepo.increment).toHaveBeenCalledWith({ userId1: P1, userId2: P2, gameId }, 'winCount', 1);
      });

      it('increments lossCount when both lose', async () => {
        await service.updateRival(P1, P2, gameId, 0, GameType.Coop);
        expect(userRivalsRepo.increment).toHaveBeenCalledWith({ userId1: P1, userId2: P2, gameId }, 'lossCount', 1);
      });
    });

    it('creates the row before incrementing when it does not exist', async () => {
      userRivalsRepo.existsBy.mockResolvedValue(false);
      userRivalsRepo.create.mockImplementation((data) => ({ ...data } as UserRival));
      userRivalsRepo.save.mockResolvedValue(undefined as any);

      await service.updateRival(P1, P2, gameId, 1, GameType.Versus);

      expect(userRivalsRepo.save).toHaveBeenCalledTimes(1);
      expect(userRivalsRepo.increment).toHaveBeenCalledTimes(1);
    });

    it('does not create a row when it already exists', async () => {
      await service.updateRival(P1, P2, gameId, 1, GameType.Versus);
      expect(userRivalsRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('getRival', () => {
    const P1 = 'AAAAAAAAAA';
    const P2 = 'ZZZZZZZZZZ';
    const records = [{ userId1: 'AAAAAAAAAA', userId2: 'ZZZZZZZZZZ', gameId: 'tictactoe' }] as UserRival[];

    it('queries with canonical order when userId is the smaller ID', async () => {
      userRivalsRepo.find.mockResolvedValue(records);

      const result = await service.getRival(P1, P2);

      expect(userRivalsRepo.find).toHaveBeenCalledWith({ where: { userId1: P1, userId2: P2 } });
      expect(result).toBe(records);
    });

    it('queries with canonical order when userId is the larger ID', async () => {
      userRivalsRepo.find.mockResolvedValue(records);

      await service.getRival(P2, P1);

      expect(userRivalsRepo.find).toHaveBeenCalledWith({ where: { userId1: P1, userId2: P2 } });
    });
  });

  describe('getStats', () => {
    const userId = 'MMMMMMMMMM';
    const smallerId = 'AAAAAAAAAA';  // < userId
    const largerId  = 'ZZZZZZZZZZ';  // > userId

    it('returns aggregated versus stats from the requesting user perspective when user is userId1', async () => {
      gamesRegistry.getType.mockReturnValue(GameType.Versus);
      userRivalsRepo.find.mockResolvedValue([
        { userId1: userId, userId2: largerId, gameId: 'tictactoe', matchCount: 5, winCount: 3, lossCount: 1, drawCount: 1 },
      ] as UserRival[]);

      const result = await service.getStats(userId);

      expect(result).toEqual([{ gameId: 'tictactoe', matchCount: 5, winCount: 3, lossCount: 1, drawCount: 1 }]);
    });

    it('swaps win/loss for versus when user is userId2', async () => {
      gamesRegistry.getType.mockReturnValue(GameType.Versus);
      userRivalsRepo.find.mockResolvedValue([
        { userId1: smallerId, userId2: userId, gameId: 'tictactoe', matchCount: 5, winCount: 3, lossCount: 1, drawCount: 1 },
      ] as UserRival[]);

      const result = await service.getStats(userId);

      expect(result).toEqual([{ gameId: 'tictactoe', matchCount: 5, winCount: 1, lossCount: 3, drawCount: 1 }]);
    });

    it('does not swap win/loss for coop when user is userId2', async () => {
      gamesRegistry.getType.mockReturnValue(GameType.Coop);
      userRivalsRepo.find.mockResolvedValue([
        { userId1: smallerId, userId2: userId, gameId: 'coop-game', matchCount: 4, winCount: 3, lossCount: 1, drawCount: 0 },
      ] as UserRival[]);

      const result = await service.getStats(userId);

      expect(result).toEqual([{ gameId: 'coop-game', matchCount: 4, winCount: 3, lossCount: 1, drawCount: 0 }]);
    });

    it('aggregates stats across multiple rivals for the same game', async () => {
      gamesRegistry.getType.mockReturnValue(GameType.Versus);
      userRivalsRepo.find.mockResolvedValue([
        { userId1: userId, userId2: largerId,  gameId: 'tictactoe', matchCount: 3, winCount: 2, lossCount: 1, drawCount: 0 },
        { userId1: smallerId, userId2: userId, gameId: 'tictactoe', matchCount: 2, winCount: 1, lossCount: 1, drawCount: 0 },
      ] as UserRival[]);

      const result = await service.getStats(userId);

      // Row 1 (user is userId1): wins=2, losses=1; Row 2 (user is userId2): wins=1, losses=1
      expect(result).toEqual([{ gameId: 'tictactoe', matchCount: 5, winCount: 3, lossCount: 2, drawCount: 0 }]);
    });

    it('returns empty array when user has no rivals', async () => {
      userRivalsRepo.find.mockResolvedValue([]);

      const result = await service.getStats(userId);

      expect(result).toEqual([]);
    });
  });
});
