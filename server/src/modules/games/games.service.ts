import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Game } from './game.entity';

@Injectable()
export class GamesService {
  constructor(
    @InjectRepository(Game) private readonly games: Repository<Game>,
  ) {}

  async findBySlug(slug: string): Promise<Game | null> {
    return this.games.findOne({ where: { slug, isActive: true } });
  }

  async listGames() {
    // TODO: query games table, include bundle metadata
    return [];
  }

  async getGame(_slug: string) {
    throw new Error('not implemented');
  }
}
