import { createHash, randomBytes } from 'crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { JwtUser } from '../../common/guards/jwt-auth.guard';
import { RefreshToken } from './refresh-token.entity';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import { Redis } from 'ioredis'
import { FIREBASE_AUTH } from '../../common/firebase/firebase.module';
import { auth } from 'firebase-admin';

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
    @Inject(FIREBASE_AUTH) private readonly firebaseAuth: auth.Auth,
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
  ) {}

  async devLogin(accountId: string): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.usersService.findOrUpsertByProviderId(accountId, 'dev', `dev_${accountId}`);
    const accessToken = this.issueAccessToken(user.id, user.provider);
    const refreshToken = await this.issueRefreshToken(user.id);
    return { accessToken, refreshToken };
  }

  async firebaseLogin(idToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const decodedIdToken = await this.firebaseAuth.verifyIdToken(idToken, true);
      const userRecord = await this.firebaseAuth.getUser(decodedIdToken.uid);
      const user = await this.usersService.findOrUpsertByProviderId(decodedIdToken.uid, decodedIdToken.firebase.sign_in_provider, userRecord.displayName, userRecord.email, userRecord.photoURL);
      const accessToken = this.issueAccessToken(user.id, user.provider);
      const refreshToken = await this.issueRefreshToken(user.id);
      return { accessToken, refreshToken };
    } catch(e) {
      throw new UnauthorizedException();
    }
  }

  async refresh(rawToken: string): Promise<{ accessToken: string; refreshToken: string; }> {
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
    const accessToken = this.jwtService.sign({ id: user.id } satisfies JwtUser);
    return { accessToken, refreshToken: newRefreshToken };
  }

  private issueAccessToken(id: string, _provider: string): string {
    return this.jwtService.sign({ id } satisfies JwtUser); 
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
