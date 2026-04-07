import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  async findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  async findOrCreate(provider: string, providerId: string, displayName: string): Promise<User> {
    let user = await this.users.findOne({ where: { provider, providerId } });
    if (!user) {
      user = await this.users.save(this.users.create({ provider, providerId, displayName }));
    }
    return user;
  }

  async getProfile() {
    throw new Error('not implemented');
  }

  async deleteAccount() {
    throw new Error('not implemented');
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
