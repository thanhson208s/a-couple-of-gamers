import { randomInt } from 'crypto';
import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { FIREBASE_AUTH } from '../../common/firebase/firebase.module';
import { auth } from 'firebase-admin';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @Inject(FIREBASE_AUTH) private readonly firebaseAuth: auth.Auth,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  async findOrUpsertByFirebaseUid(uid: string, provider: string, displayName?: string, email?: string): Promise<User> {
    let user = await this.users.findOne({ where: { providerId: uid }});
    if (user) {
      if (user.provider !== provider)
        user.provider = provider;
      else return user;
    } else {
      const id = await this.generateId();
      if (!displayName)
        displayName = email ? email.split('@')[0] : 'Gamer' + id;
      user = this.users.create({ id, provider, providerId: uid, displayName })
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

  async getProfile() {
    throw new Error('not implemented');
  }

  async deleteAccount(userId: string): Promise<void> {
    const user = await this.users.findOneOrFail({ where: { id: userId } });
    await this.users.delete(userId);
    try {
      await this.firebaseAuth.deleteUser(user.providerId);
    } catch {}
  }

  async upsertDeviceToken(_body: { token: string; platform: string }) {
    throw new Error('not implemented');
  }

  async getFavorites() {
    throw new Error('not implemented');
  }

  async addFavorite(_gameSlug: string) {
    throw new Error('not implemented');
  }

  async removeFavorite(_gameSlug: string) {
    throw new Error('not implemented');
  }

  async getRivals() {
    throw new Error('not implemented');
  }

  async getRivalStats(_opponentId: string) {
    throw new Error('not implemented');
  }
}
