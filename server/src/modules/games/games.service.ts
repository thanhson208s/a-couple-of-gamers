import { Injectable } from '@nestjs/common';

@Injectable()
export class GamesService {
  async listGames() {
    // TODO: query games table, include bundle metadata
    return [];
  }

  async getGame(_slug: string) {
    throw new Error('not implemented');
  }
}
