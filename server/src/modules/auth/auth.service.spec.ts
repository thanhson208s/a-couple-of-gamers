import { NotImplementedException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { RefreshToken } from './refresh-token.entity';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { mockRepository } from '../../common/test/helpers';
import { REDIS_CLIENT } from '../../common/redis/redis.module';

function makeUser(overrides: Partial<User> = {}): User {
  return { id: 'ABCD123456', provider: 'anonymous', providerId: 'firebase-uid-123', displayName: 'Guest', ...overrides } as User;
}

function makeRefreshToken(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id: 'rt1',
    userId: 'ABCD123456',
    tokenHash: 'some-hash',
    expiresAt: new Date(Date.now() + 86_400_000), // 1 day in the future
    revokedAt: null,
    ...overrides,
  } as RefreshToken;
}

describe('AuthService', () => {
  let service: AuthService;
  let refreshTokensRepo: ReturnType<typeof mockRepository<RefreshToken>>;
  let usersService: jest.Mocked<Pick<UsersService, 'findOrCreate' | 'findById'>>;
  let jwtService: jest.Mocked<Pick<JwtService, 'sign'>>;
  let redis: { get: jest.Mock, set: jest.Mock, del: jest.Mock };

  beforeEach(async () => {
    refreshTokensRepo = mockRepository<RefreshToken>();
    usersService = { findOrCreate: jest.fn(), findById: jest.fn() };
    jwtService = { sign: jest.fn().mockReturnValue('access_token') };
    redis = { get: jest.fn(), set: jest.fn(), del: jest.fn() };

    // issueRefreshToken calls create() then save()
    refreshTokensRepo.create.mockImplementation((data) => ({ ...data } as RefreshToken));
    refreshTokensRepo.save.mockImplementation(async (t) => t as RefreshToken);

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(RefreshToken), useValue: refreshTokensRepo },
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: REDIS_CLIENT, useValue: redis }
      ],
    }).compile();
    service = module.get(AuthService);
  });

  describe('devLogin', () => {
    it('returns accessToken, refreshToken, and user fields', async () => {
      const user = makeUser({ provider: 'dev', providerId: 'alice', displayName: 'dev_alice' });
      usersService.findOrCreate.mockResolvedValue(user);

      const result = await service.devLogin('alice');

      expect(usersService.findOrCreate).toHaveBeenCalledWith('dev', 'alice', 'dev_alice');
      expect(jwtService.sign).toHaveBeenCalledWith({ id: user.id, type: 'dev' });
      expect(result.accessToken).toBe('access_token');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.refreshToken).toHaveLength(64); // 32 random bytes as hex
      expect(result.id).toBe(user.id);
      expect(result.provider).toBe('dev');
    });
  });

  describe('login', () => {
    it('is not yet implemented', async () => {
      await expect(service.login('some-id-token')).rejects.toThrow(NotImplementedException);
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token and returns new tokens', async () => {
      const user = makeUser();
      const stored = makeRefreshToken();
      refreshTokensRepo.findOne.mockResolvedValue(stored);
      usersService.findById.mockResolvedValue(user);

      const result = await service.refresh('raw-token');

      // Revokes old token
      expect(refreshTokensRepo.update).toHaveBeenCalledWith(stored.id, expect.objectContaining({ revokedAt: expect.any(Date) }));
      // Issues new tokens
      expect(result.accessToken).toBe('access_token');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.id).toBe(user.id);
    });

    it('throws UnauthorizedException when the token hash is not found', async () => {
      refreshTokensRepo.findOne.mockResolvedValue(null);
      await expect(service.refresh('unknown-token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the token is expired', async () => {
      refreshTokensRepo.findOne.mockResolvedValue(
        makeRefreshToken({ expiresAt: new Date(Date.now() - 1000) }),
      );
      await expect(service.refresh('expired-token')).rejects.toThrow(UnauthorizedException);
    });

    it('revokes all tokens and throws UnauthorizedException when the token was already revoked', async () => {
      refreshTokensRepo.findOne.mockResolvedValue(
        makeRefreshToken({ revokedAt: new Date() }),
      );

      await expect(service.refresh('replayed-token')).rejects.toThrow(UnauthorizedException);

      // revokeAllTokens must have been called
      expect(refreshTokensRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'ABCD123456' }),
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });

    it('throws UnauthorizedException when the user no longer exists after token rotation', async () => {
      refreshTokensRepo.findOne.mockResolvedValue(makeRefreshToken());
      usersService.findById.mockResolvedValue(null);
      await expect(service.refresh('valid-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('revokes the matching active refresh token', async () => {
      const stored = makeRefreshToken();
      refreshTokensRepo.findOne.mockResolvedValue(stored);

      await service.logout('raw-token');

      expect(refreshTokensRepo.update).toHaveBeenCalledWith(
        stored.id,
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });

    it('does nothing when the token is not found', async () => {
      refreshTokensRepo.findOne.mockResolvedValue(null);

      await service.logout('unknown-token');

      expect(refreshTokensRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('ws-ticket', () => {
    it('save correct ticket and user id to redis with 60s TTL', async () => {
      const userId = 'random-user';
      const ticket = 'random-ticket';
      
      const cryptoRandomBytes = jest.spyOn(require('crypto'), 'randomBytes').mockReturnValue({
        toString: () => ticket
      } as any);

      const redisSet = jest.spyOn(redis, 'set').mockResolvedValue('OK');

      const result = await service.issueWsTicket(userId);

      cryptoRandomBytes.mockRestore();

      expect(result).toBe(ticket);
      expect(redisSet).toHaveBeenCalledWith(`ws_ticket:${ticket}`, userId, 'EX', 60);
    });

    it('generate different keys every time', async () => {
      const userId1 = 'user-1';
      const userId2 = 'user-2';

      jest.spyOn(redis, 'set').mockResolvedValue('OK');

      const result1 = await service.issueWsTicket(userId1);
      const result2 = await service.issueWsTicket(userId2);

      expect(result1 == result2).toBeFalsy();
    });

    it('retrieve correct user id successfully and delete ticket', async () => {
      const userId = "random-user";
      const ticket = 'random-ticket';

      const redisGet = jest.spyOn(redis, 'get').mockResolvedValue(userId);
      const redisDel = jest.spyOn(redis, 'del').mockResolvedValue(1);

      const result = await service.validateWsTicket(ticket);

      expect(result).toBe(userId);
      expect(redisGet).toHaveBeenCalledWith(`ws_ticket:${ticket}`);
      expect(redisDel).toHaveBeenCalledWith(`ws_ticket:${ticket}`);
    });

    it('validate failed if ticket does not exist', async () => {
      const ticket = 'random-ticket';

      const redisGet = jest.spyOn(redis, 'get').mockResolvedValue(null);

      const result = await service.validateWsTicket(ticket);

      expect(result).toBeNull();
      expect(redisGet).toHaveBeenCalledWith(`ws_ticket:${ticket}`);
    });
  });
});
