import { InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { UserFavorite } from './user-favorite.entity';
import { mockRepository } from '../../common/test/helpers';
import { FIREBASE_AUTH } from '../../common/firebase/firebase.module';

describe('UsersService', () => {
  let service: UsersService;
  let usersRepo: ReturnType<typeof mockRepository<User>> & { findOneOrFail: jest.Mock };
  let userFavoritesRepo: ReturnType<typeof mockRepository<UserFavorite>>;
  let firebaseAuth: { deleteUser: jest.Mock; verifyIdToken: jest.Mock };

  beforeEach(async () => {
    usersRepo = { ...mockRepository<User>(), findOneOrFail: jest.fn() };
    userFavoritesRepo = mockRepository<UserFavorite>();
    firebaseAuth = { deleteUser: jest.fn(), verifyIdToken: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: getRepositoryToken(UserFavorite), useValue: userFavoritesRepo },
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

    it('returns id, provider, displayName, avatarUrl and favorite slugs', async () => {
      usersRepo.findOne.mockResolvedValue(user);
      userFavoritesRepo.find.mockResolvedValue([
        { userId: user.id, gameId: 'uuid-1', game: { slug: 'tictactoe' } },
        { userId: user.id, gameId: 'uuid-2', game: { slug: 'chess' } },
      ] as UserFavorite[]);

      const result = await service.getProfile(user.id);

      expect(result).toEqual({ id: 'ABCD123456', provider: 'google.com', displayName: 'Test User', avatarUrl: 'https://photo.example.com/u.jpg', favorites: ['tictactoe', 'chess'] });
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
});
