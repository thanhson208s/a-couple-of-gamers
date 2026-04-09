import { createHash, randomBytes } from 'crypto';
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { JwtUser } from './guards/jwt-auth.guard';
import { RefreshToken } from './refresh-token.entity';

const REFRESH_TOKEN_TTL_DAYS = 30;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
  ) {}

  async devLogin(accountId: string): Promise<{ accessToken: string; refreshToken: string; id: string; provider: string; providerId: string; displayName: string }> {
    const user = await this.usersService.findOrCreate('dev', accountId, `dev_${accountId}`);
    const accessToken = this.jwtService.sign({ id: user.id, type: AuthService.tokenType(user.provider) } satisfies JwtUser);
    const refreshToken = await this.issueRefreshToken(user.id);
    return { accessToken, refreshToken, id: user.id, provider: user.provider, providerId: user.providerId, displayName: user.displayName };
  }

  async guestLogin(guestId: string): Promise<{ accessToken: string; refreshToken: string; id: string; provider: string; providerId: string; displayName: string }> {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(guestId)) {
      throw new BadRequestException('Invalid guest UUID format');
    }

    const user = await this.usersService.findOrCreate('guest', guestId, `guest_${guestId}`);
    const accessToken = this.jwtService.sign({ id: user.id, type: AuthService.tokenType(user.provider) } satisfies JwtUser);
    const refreshToken = await this.issueRefreshToken(user.id);
    return { accessToken, refreshToken, id: user.id, provider: user.provider, providerId: user.providerId, displayName: user.displayName };
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

  extractGuestUserId(authorization: string | undefined): string | undefined {
    if (!authorization?.startsWith('Bearer ')) return undefined;
    const payload = this.jwtService.decode(authorization.slice(7)) as JwtUser | null;
    if (!payload || typeof payload !== 'object') return undefined;
    if (payload.type !== 'guest') return undefined;
    return typeof payload.id === 'string' ? payload.id : undefined;
  }

  // Issues type:'social' access token.
  // If guestUserId present and (provider, uid) not yet taken: upgrades the guest record in-place.
  async socialLogin(_idToken: string, _guestUserId?: string) {
    throw new Error('not implemented');
  }

  async issueWsTicket() {
    throw new Error('not implemented');
  }

  static tokenType(provider: string): 'guest' | 'dev' | 'social' {
    if (provider === 'guest') return 'guest';
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
