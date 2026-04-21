import { NotImplementedException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { RefreshToken } from './refresh-token.entity';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { mockRepository } from '../../common/test/helpers';

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

  beforeEach(async () => {
    refreshTokensRepo = mockRepository<RefreshToken>();
    usersService = { findOrCreate: jest.fn(), findById: jest.fn() };
    jwtService = { sign: jest.fn().mockReturnValue('access_token') };

    // issueRefreshToken calls create() then save()
    refreshTokensRepo.create.mockImplementation((data) => ({ ...data } as RefreshToken));
    refreshTokensRepo.save.mockImplementation(async (t) => t as RefreshToken);

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(RefreshToken), useValue: refreshTokensRepo },
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
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
});
