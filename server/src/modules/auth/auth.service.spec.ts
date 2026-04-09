import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { RefreshToken } from './refresh-token.entity';
import { UsersService } from '../users/users.service';
import { mockRepository } from '../../common/test/helpers';

describe('AuthService', () => {
  let service: AuthService;
  let refreshTokensRepo: ReturnType<typeof mockRepository<RefreshToken>>;
  let usersService: jest.Mocked<Pick<UsersService, 'findOrCreate' | 'findById'>>;
  let jwtService: jest.Mocked<Pick<JwtService, 'sign'>>;

  beforeEach(async () => {
    refreshTokensRepo = mockRepository<RefreshToken>();
    usersService = { findOrCreate: jest.fn(), findById: jest.fn() };
    jwtService = { sign: jest.fn() };

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
    it.todo('returns access token, refresh token, and user fields');
  });

  describe('guestLogin', () => {
    it.todo('returns tokens for a valid UUID');
    it.todo('throws BadRequestException for a non-UUID guest ID');
  });

  describe('refresh', () => {
    it.todo('rotates the refresh token and returns new tokens');
    it.todo('throws UnauthorizedException when the token hash is not found');
    it.todo('throws UnauthorizedException when the token is expired');
    it.todo('revokes all tokens and throws UnauthorizedException when the token was already revoked');
    it.todo('throws UnauthorizedException when the user no longer exists after token rotation');
  });
});
