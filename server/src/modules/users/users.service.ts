import { randomInt } from 'crypto';
import { ForbiddenException, Inject, Injectable, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';

export const FAVORITES_LIMIT = { anonymous: 3, social: 100 } as const;
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { UserFavorite } from './user-favorite.entity';
import { Game } from '../games/game.entity';
import { FIREBASE_AUTH } from '../../common/firebase/firebase.module';
import { auth } from 'firebase-admin';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserFavorite) private readonly userFavorites: Repository<UserFavorite>,
    @InjectRepository(Game) private readonly games: Repository<Game>,
    @Inject(FIREBASE_AUTH) private readonly firebaseAuth: auth.Auth,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  async findOrUpsertByFirebaseUid(uid: string, provider: string, displayName?: string, email?: string, avatarUrl?: string | null): Promise<User> {
    let user = await this.users.findOne({ where: { providerId: uid }});
    if (user) {
      if (user.provider === provider) return user;
      user.provider = provider;
      if (!['anonymous', 'password', 'dev'].includes(provider)) {
        if (displayName !== undefined) user.displayName = displayName;
        if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;
      }
    } else {
      const id = await this.generateId();
      if (!displayName)
        displayName = email ? email.split('@')[0] : 'Gamer' + id;
      user = this.users.create({ id, provider, providerId: uid, displayName, avatarUrl: avatarUrl ?? null });
    }

    return await this.users.save(user);
  }

  async findOrCreate(provider: string, providerId: string, displayName: string): Promise<User> {
    let user = await this.users.findOne({ where: { providerId } });
    if (!user) {
      const id = await this.generateId();
      user = await this.users.save(this.users.create({ id, provider, providerId, displayName }));
    }
    return user;
  }

  private async generateId(): Promise<string> {
    const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 5; attempt++) {
      const id = Array.from(
        { length: 10 },
        () => CHARSET[randomInt(0, CHARSET.length)],
      ).join('');
      if (!(await this.users.existsBy({ id }))) return id;
    }
    throw new InternalServerErrorException('Failed to generate unique user ID after 5 attempts');
  }

  async getProfile(userId: string): Promise<{ id: string; provider: string; displayName: string; avatarUrl: string | null; favorites: string[]; favoritesLimit: number }> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException();
    const favs = await this.userFavorites.find({ where: { userId }, relations: ['game'] });
    const favoritesLimit = user.provider === 'anonymous' ? FAVORITES_LIMIT.anonymous : FAVORITES_LIMIT.social;
    return { id: user.id, provider: user.provider, displayName: user.displayName, avatarUrl: user.avatarUrl, favorites: favs.map(f => f.game.id), favoritesLimit };
  }

  async deleteAccount(userId: string, idToken: string): Promise<void> {
    const FRESH_PERIOD = 300; //seconds
    try {
      const decodedIdToken = await this.firebaseAuth.verifyIdToken(idToken, true);
      if (decodedIdToken.iat + FRESH_PERIOD < Math.floor(Date.now() / 1000))
        throw new UnauthorizedException();

      const user = await this.users.findOne({ where: { providerId: decodedIdToken.uid }});
      if (user && user.id !== userId)
        throw new UnauthorizedException();

      if (user) await this.users.delete(user.id);
      await this.firebaseAuth.deleteUser(decodedIdToken.uid);
    } catch(e) {
      throw new UnauthorizedException();
    }
  }

  async upsertDeviceToken(_body: { token: string; platform: string }) {
    throw new Error('not implemented');
  }

  async addFavorite(userId: string, userType: string, gameSlug: string): Promise<void> {
    const game = await this.games.findOne({ where: { id: gameSlug } });
    if (!game) throw new NotFoundException();
    const existing = await this.userFavorites.findOne({ where: { userId, gameId: game.id } });
    if (existing) return;
    const limit = userType === 'anonymous' ? FAVORITES_LIMIT.anonymous : FAVORITES_LIMIT.social;
    const count = await this.userFavorites.count({ where: { userId } });
    if (count >= limit) throw new ForbiddenException();
    await this.userFavorites.save(this.userFavorites.create({ userId, gameId: game.id }));
  }

  async removeFavorite(userId: string, gameSlug: string): Promise<void> {
    const game = await this.games.findOne({ where: { id: gameSlug } });
    if (game) await this.userFavorites.delete({ userId, gameId: game.id });
  }

  async getRivals() {
    throw new Error('not implemented');
  }

  async getRivalStats(_opponentId: string) {
    throw new Error('not implemented');
  }
}
