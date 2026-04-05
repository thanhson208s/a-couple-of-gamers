import { Injectable } from '@nestjs/common';

@Injectable()
export class UsersService {
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
