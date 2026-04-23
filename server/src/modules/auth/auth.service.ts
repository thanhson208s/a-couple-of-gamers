import { createHash, randomBytes } from 'crypto';
import { Inject, Injectable, NotImplementedException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { JwtUser } from './guards/jwt-auth.guard';
import { RefreshToken } from './refresh-token.entity';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import { Redis } from 'ioredis'

const REFRESH_TOKEN_TTL_DAYS = 30;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
  ) {}

  async devLogin(accountId: string): Promise<{ accessToken: string; refreshToken: string; id: string; provider: string; providerId: string; displayName: string }> {
    const user = await this.usersService.findOrCreate('dev', accountId, `dev_${accountId}`);
    const accessToken = this.jwtService.sign({ id: user.id, type: AuthService.tokenType(user.provider) } satisfies JwtUser);
    const refreshToken = await this.issueRefreshToken(user.id);
    return { accessToken, refreshToken, id: user.id, provider: user.provider, providerId: user.providerId, displayName: user.displayName };
  }

  // Verifies Firebase ID token, upserts user by provider_id (Firebase UID), issues JWT.
  // sign_in_provider='anonymous' → type:'anonymous'; social providers → type:'social'
  async login(_idToken: string): Promise<{ accessToken: string; refreshToken: string; id: string; provider: string; providerId: string; displayName: string }> {
    throw new NotImplementedException();
  }

  async refresh(rawToken: string): Promise<{ accessToken: string; refreshToken: string; id: string; provider: string; providerId: string; displayName: string }> {
    const hash = sha256(rawToken);
    const token = await this.refreshTokens.findOne({ where: { tokenHash: hash } });

    if (!token) throw new UnauthorizedException();
    if (token.expiresAt < new Date()) throw new UnauthorizedException();

    if (token.revokedAt) {
      await this.revokeAllTokens(token.userId);
      throw new UnauthorizedException();
    }

    await this.refreshTokens.update(token.id, { revokedAt: new Date() });

    const user = await this.usersService.findById(token.userId);
    if (!user) throw new UnauthorizedException();

    const newRefreshToken = await this.issueRefreshToken(token.userId);
    const accessToken = this.jwtService.sign({ id: user.id, type: AuthService.tokenType(user.provider) } satisfies JwtUser);
    return { accessToken, refreshToken: newRefreshToken, id: user.id, provider: user.provider, providerId: user.providerId, displayName: user.displayName };
  }

  async issueWsTicket(userId: string) {
    const ticket = randomBytes(20).toString('hex');
    await this.redis.set(`ws_ticket:${ticket}`, userId, 'EX', 60);
    return ticket;
  }

  async validateWsTicket(ticket: string) {
    const userId = await this.redis.get(`ws_ticket:${ticket}`);
    if (userId) await this.redis.del(`ws_ticket:${ticket}`);
    return userId;
  }

  static tokenType(provider: string): 'anonymous' | 'dev' | 'social' {
    if (provider === 'anonymous') return 'anonymous';
    if (provider === 'dev') return 'dev';
    return 'social';
  }

  private async issueRefreshToken(userId: string): Promise<string> {
    const raw = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);
    await this.refreshTokens.save(this.refreshTokens.create({ userId, tokenHash: sha256(raw), expiresAt }));
    return raw;
  }

  async logout(rawToken: string): Promise<void> {
    const hash = sha256(rawToken);
    const token = await this.refreshTokens.findOne({ where: { tokenHash: hash, revokedAt: IsNull() } });
    if (token) {
      await this.refreshTokens.update(token.id, { revokedAt: new Date() });
    }
  }

  private async revokeAllTokens(userId: string): Promise<void> {
    await this.refreshTokens.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }
}
