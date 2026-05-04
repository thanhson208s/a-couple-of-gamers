import { BadRequestException, ConflictException, ForbiddenException, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { UserFavorite } from './user-favorite.entity';
import { UserRival } from './user-rival.entity';
import { UserDevice } from './user-device.entity';
import { UserFriend, FriendStatus } from './user-friend.entity';
import { Game, GameType } from '../games/game.entity';
import { mockRepository } from '../../common/helpers/test.helper';
import { FIREBASE_AUTH } from '../../common/firebase/firebase.module';

describe('UsersService', () => {
  let service: UsersService;
  let usersRepo: ReturnType<typeof mockRepository<User>> & { findOneOrFail: jest.Mock };
  let userFavoritesRepo: ReturnType<typeof mockRepository<UserFavorite>>;
  let userRivalsRepo: ReturnType<typeof mockRepository<UserRival>>;
  let userDevicesRepo: ReturnType<typeof mockRepository<UserDevice>>;
  let userFriendsRepo: ReturnType<typeof mockRepository<UserFriend>> & { createQueryBuilder: jest.Mock };
  let gamesRepo: ReturnType<typeof mockRepository<Game>>;
  let dataSource: { transaction: jest.Mock };
  let firebaseAuth: { deleteUser: jest.Mock; verifyIdToken: jest.Mock };

  beforeEach(async () => {
    usersRepo = { ...mockRepository<User>(), findOneOrFail: jest.fn() };
    userFavoritesRepo = mockRepository<UserFavorite>();
    userRivalsRepo = mockRepository<UserRival>();
    userDevicesRepo = mockRepository<UserDevice>();
    userFriendsRepo = { ...mockRepository<UserFriend>(), createQueryBuilder: jest.fn() };
    gamesRepo = mockRepository<Game>();
    firebaseAuth = { deleteUser: jest.fn(), verifyIdToken: jest.fn() };
    // transaction() runs the callback with an EntityManager whose getRepository() returns userRivalsRepo
    dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb({ getRepository: () => userRivalsRepo })),
    };

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: getRepositoryToken(UserFavorite), useValue: userFavoritesRepo },
        { provide: getRepositoryToken(UserRival), useValue: userRivalsRepo },
        { provide: getRepositoryToken(UserDevice), useValue: userDevicesRepo },
        { provide: getRepositoryToken(UserFriend), useValue: userFriendsRepo },
        { provide: getRepositoryToken(Game), useValue: gamesRepo },
        { provide: FIREBASE_AUTH, useValue: firebaseAuth },
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
    const P1 = 'AAAAAAAAAA';
    const P2 = 'ZZZZZZZZZZ';
    const gameId = 'tictactoe';

    beforeEach(() => {
      userRivalsRepo.existsBy.mockResolvedValue(true);
      userRivalsRepo.increment.mockResolvedValue(undefined as any);
    });

    describe('versus', () => {
      it('increments winCount for player1 row and lossCount for player2 row when player1 wins', async () => {
        await service.updateRival(P1, P2, gameId, 1, GameType.Versus);
        expect(userRivalsRepo.increment).toHaveBeenCalledWith({ userId1: P1, userId2: P2, gameId }, 'winCount', 1);
        expect(userRivalsRepo.increment).toHaveBeenCalledWith({ userId1: P2, userId2: P1, gameId }, 'lossCount', 1);
      });

      it('increments lossCount for player1 row and winCount for player2 row when player2 wins', async () => {
        await service.updateRival(P1, P2, gameId, 2, GameType.Versus);
        expect(userRivalsRepo.increment).toHaveBeenCalledWith({ userId1: P1, userId2: P2, gameId }, 'lossCount', 1);
        expect(userRivalsRepo.increment).toHaveBeenCalledWith({ userId1: P2, userId2: P1, gameId }, 'winCount', 1);
      });

      it('increments drawCount in both rows on draw', async () => {
        await service.updateRival(P1, P2, gameId, 0, GameType.Versus);
        expect(userRivalsRepo.increment).toHaveBeenCalledWith({ userId1: P1, userId2: P2, gameId }, 'drawCount', 1);
        expect(userRivalsRepo.increment).toHaveBeenCalledWith({ userId1: P2, userId2: P1, gameId }, 'drawCount', 1);
      });
    });

    describe('coop', () => {
      it('increments winCount in both rows when both win', async () => {
        await service.updateRival(P1, P2, gameId, 1, GameType.Coop);
        expect(userRivalsRepo.increment).toHaveBeenCalledWith({ userId1: P1, userId2: P2, gameId }, 'winCount', 1);
        expect(userRivalsRepo.increment).toHaveBeenCalledWith({ userId1: P2, userId2: P1, gameId }, 'winCount', 1);
      });

      it('increments lossCount in both rows when both lose', async () => {
        await service.updateRival(P1, P2, gameId, 0, GameType.Coop);
        expect(userRivalsRepo.increment).toHaveBeenCalledWith({ userId1: P1, userId2: P2, gameId }, 'lossCount', 1);
        expect(userRivalsRepo.increment).toHaveBeenCalledWith({ userId1: P2, userId2: P1, gameId }, 'lossCount', 1);
      });
    });

    it('creates both rows before incrementing when they do not exist', async () => {
      userRivalsRepo.existsBy.mockResolvedValue(false);
      userRivalsRepo.create.mockImplementation((data) => ({ ...data } as UserRival));
      userRivalsRepo.save.mockResolvedValue(undefined as any);

      await service.updateRival(P1, P2, gameId, 1, GameType.Versus);

      expect(userRivalsRepo.save).toHaveBeenCalledTimes(2);
      expect(userRivalsRepo.increment).toHaveBeenCalledTimes(2);
    });

    it('does not create rows when they already exist', async () => {
      await service.updateRival(P1, P2, gameId, 1, GameType.Versus);
      expect(userRivalsRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('getRival', () => {
    const P1 = 'AAAAAAAAAA';
    const P2 = 'ZZZZZZZZZZ';
    const records = [{ userId1: 'AAAAAAAAAA', userId2: 'ZZZZZZZZZZ', gameId: 'tictactoe' }] as UserRival[];

    it('queries with userId as userId1 and opponentId as userId2', async () => {
      userRivalsRepo.find.mockResolvedValue(records);

      const result = await service.getRival(P1, P2);

      expect(userRivalsRepo.find).toHaveBeenCalledWith({ where: { userId1: P1, userId2: P2 } });
      expect(result).toBe(records);
    });

    it('queries from opponent perspective without reordering', async () => {
      userRivalsRepo.find.mockResolvedValue(records);

      await service.getRival(P2, P1);

      expect(userRivalsRepo.find).toHaveBeenCalledWith({ where: { userId1: P2, userId2: P1 } });
    });
  });

  describe('getStats', () => {
    const userId = 'MMMMMMMMMM';
    const smallerId = 'AAAAAAAAAA';
    const largerId  = 'ZZZZZZZZZZ';

    it('returns stats directly from userId1 rows', async () => {
      userRivalsRepo.find.mockResolvedValue([
        { userId1: userId, userId2: largerId, gameId: 'tictactoe', matchCount: 5, winCount: 3, lossCount: 1, drawCount: 1 },
      ] as UserRival[]);

      const result = await service.getStats(userId);

      expect(result).toEqual([{ gameId: 'tictactoe', matchCount: 5, winCount: 3, lossCount: 1, drawCount: 1 }]);
      expect(userRivalsRepo.find).toHaveBeenCalledWith({ where: { userId1: userId } });
    });

    it('aggregates stats across multiple rivals for the same game', async () => {
      userRivalsRepo.find.mockResolvedValue([
        { userId1: userId, userId2: largerId,  gameId: 'tictactoe', matchCount: 3, winCount: 2, lossCount: 1, drawCount: 0 },
        { userId1: userId, userId2: smallerId, gameId: 'tictactoe', matchCount: 2, winCount: 1, lossCount: 1, drawCount: 0 },
      ] as UserRival[]);

      const result = await service.getStats(userId);

      expect(result).toEqual([{ gameId: 'tictactoe', matchCount: 5, winCount: 3, lossCount: 2, drawCount: 0 }]);
    });

    it('returns empty array when user has no rivals', async () => {
      userRivalsRepo.find.mockResolvedValue([]);

      const result = await service.getStats(userId);

      expect(result).toEqual([]);
    });
  });

  describe('sendFriendRequest', () => {
    const userId = 'AAAAAAAAAA';
    const targetId = 'ZZZZZZZZZZ';
    const socialUser = { id: userId, provider: 'google.com' } as User;

    beforeEach(() => {
      usersRepo.findOne.mockResolvedValue(socialUser);
    });

    it('throws ForbiddenException for anonymous accounts', async () => {
      usersRepo.findOne.mockResolvedValue({ id: userId, provider: 'anonymous' } as User);
      await expect(service.sendFriendRequest(userId, targetId)).rejects.toThrow(ForbiddenException);
      expect(usersRepo.existsBy).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when sending to self', async () => {
      await expect(service.sendFriendRequest(userId, userId)).rejects.toThrow(BadRequestException);
      expect(usersRepo.existsBy).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when target user does not exist', async () => {
      usersRepo.existsBy.mockResolvedValue(false);
      await expect(service.sendFriendRequest(userId, targetId)).rejects.toThrow(NotFoundException);
      expect(userFriendsRepo.findOne).not.toHaveBeenCalled();
    });

    it('throws ConflictException when a relationship already exists', async () => {
      usersRepo.existsBy.mockResolvedValue(true);
      userFriendsRepo.findOne.mockResolvedValue({ requesterId: userId, addresseeId: targetId, status: FriendStatus.Pending } as UserFriend);
      await expect(service.sendFriendRequest(userId, targetId)).rejects.toThrow(ConflictException);
      expect(userFriendsRepo.save).not.toHaveBeenCalled();
    });

    it('creates a pending request when no prior relationship exists', async () => {
      usersRepo.existsBy.mockResolvedValue(true);
      userFriendsRepo.findOne.mockResolvedValue(null);
      userFriendsRepo.create.mockImplementation((data) => ({ ...data } as UserFriend));
      userFriendsRepo.save.mockResolvedValue(undefined as any);

      await service.sendFriendRequest(userId, targetId);

      expect(userFriendsRepo.create).toHaveBeenCalledWith({ requesterId: userId, addresseeId: targetId });
      expect(userFriendsRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('acceptFriendRequest', () => {
    const userId = 'AAAAAAAAAA';
    const requesterId = 'ZZZZZZZZZZ';

    it('throws NotFoundException when no pending request exists', async () => {
      userFriendsRepo.findOne.mockResolvedValue(null);
      await expect(service.acceptFriendRequest(userId, requesterId)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when request is already accepted', async () => {
      userFriendsRepo.findOne.mockResolvedValue({ requesterId, addresseeId: userId, status: FriendStatus.Accepted } as UserFriend);
      await expect(service.acceptFriendRequest(userId, requesterId)).rejects.toThrow(BadRequestException);
      expect(userFriendsRepo.save).not.toHaveBeenCalled();
    });

    it('updates status to accepted on a pending request', async () => {
      const row = { requesterId, addresseeId: userId, status: FriendStatus.Pending } as UserFriend;
      userFriendsRepo.findOne.mockResolvedValue(row);
      userFriendsRepo.save.mockResolvedValue(undefined as any);

      await service.acceptFriendRequest(userId, requesterId);

      expect(row.status).toBe(FriendStatus.Accepted);
      expect(userFriendsRepo.save).toHaveBeenCalledWith(row);
    });
  });

  describe('removeFriend', () => {
    const userId = 'AAAAAAAAAA';
    const friendId = 'ZZZZZZZZZZ';

    it('deletes both row directions', async () => {
      userFriendsRepo.delete.mockResolvedValue({ affected: 1, raw: [] });

      await service.removeFriend(userId, friendId);

      expect(userFriendsRepo.delete).toHaveBeenCalledWith({ requesterId: userId, addresseeId: friendId });
      expect(userFriendsRepo.delete).toHaveBeenCalledWith({ requesterId: friendId, addresseeId: userId });
      expect(userFriendsRepo.delete).toHaveBeenCalledTimes(2);
    });

    it('is idempotent when no row exists', async () => {
      userFriendsRepo.delete.mockResolvedValue({ affected: 0, raw: [] });

      await expect(service.removeFriend(userId, friendId)).resolves.toBeUndefined();
      expect(userFriendsRepo.delete).toHaveBeenCalledTimes(2);
    });
  });

  describe('getFriendList', () => {
    const userId = 'AAAAAAAAAA';

    it('returns mapped friend list from query builder', async () => {
      const friends = [
        { id: 'FRIEND0001', displayName: 'Alice', avatarUrl: null },
        { id: 'FRIEND0002', displayName: 'Bob', avatarUrl: 'https://photo.jpg' },
      ];
      const mockQb = {
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(friends),
      };
      userFriendsRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getFriendList(userId);

      expect(result).toBe(friends);
      expect(userFriendsRepo.createQueryBuilder).toHaveBeenCalledWith('uf');
    });

    it('returns empty array when user has no accepted friends', async () => {
      const mockQb = {
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      userFriendsRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getFriendList(userId);

      expect(result).toEqual([]);
    });
  });

  describe('areFriends', () => {
    const userId1 = 'AAAAAAAAAA';
    const userId2 = 'ZZZZZZZZZZ';

    it('returns true when an accepted row exists with userId1 as requester', async () => {
      userFriendsRepo.existsBy.mockResolvedValue(true);

      expect(await service.areFriends(userId1, userId2)).toBe(true);
      expect(userFriendsRepo.existsBy).toHaveBeenCalledWith([
        { requesterId: userId1, addresseeId: userId2, status: FriendStatus.Accepted },
        { requesterId: userId2, addresseeId: userId1, status: FriendStatus.Accepted },
      ]);
    });

    it('returns false when no accepted friendship exists', async () => {
      userFriendsRepo.existsBy.mockResolvedValue(false);

      expect(await service.areFriends(userId1, userId2)).toBe(false);
    });
  });
});
