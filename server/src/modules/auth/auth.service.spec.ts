import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { RefreshToken } from './refresh-token.entity';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { mockRepository } from '../../common/test/helpers';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

function makeUser(overrides: Partial<User> = {}): User {
  return { id: 'ABCD123456', provider: 'guest', providerId: VALID_UUID, displayName: 'guest_abc', ...overrides } as User;
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
  let jwtService: jest.Mocked<Pick<JwtService, 'sign' | 'decode'>>;

  beforeEach(async () => {
    refreshTokensRepo = mockRepository<RefreshToken>();
    usersService = { findOrCreate: jest.fn(), findById: jest.fn() };
    jwtService = { sign: jest.fn().mockReturnValue('access_token'), decode: jest.fn() };

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

  describe('guestLogin', () => {
    it('returns tokens for a valid UUID', async () => {
      const user = makeUser();
      usersService.findOrCreate.mockResolvedValue(user);

      const result = await service.guestLogin(VALID_UUID);

      expect(usersService.findOrCreate).toHaveBeenCalledWith('guest', VALID_UUID, `guest_${VALID_UUID}`);
      expect(result.accessToken).toBe('access_token');
      expect(typeof result.refreshToken).toBe('string');
    });

    it('throws BadRequestException for a non-UUID guest ID', async () => {
      await expect(service.guestLogin('not-a-uuid')).rejects.toThrow(BadRequestException);
      expect(usersService.findOrCreate).not.toHaveBeenCalled();
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

  describe('extractGuestUserId', () => {
    it('returns the user id for a guest JWT', () => {
      jwtService.decode.mockReturnValue({ id: 'ABCD123456', type: 'guest' });
      expect(service.extractGuestUserId('Bearer some_token')).toBe('ABCD123456');
    });

    it('returns undefined when the authorization header is absent', () => {
      expect(service.extractGuestUserId(undefined)).toBeUndefined();
    });

    it('returns undefined when token type is not "guest"', () => {
      jwtService.decode.mockReturnValue({ id: 'ABCD123456', type: 'dev' });
      expect(service.extractGuestUserId('Bearer some_token')).toBeUndefined();
    });

    it('returns undefined when the header is not a Bearer token', () => {
      expect(service.extractGuestUserId('Basic abc')).toBeUndefined();
    });
  });
});
