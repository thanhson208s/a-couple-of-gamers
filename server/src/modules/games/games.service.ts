import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Game } from './game.entity';
import { GamesRegistry } from './games.registry';

@Injectable()
export class GamesService implements OnModuleInit {
  constructor(
    @InjectRepository(Game) private readonly games: Repository<Game>,
    private readonly gamesRegistry: GamesRegistry,
  ) {}

  // On startup, ensure every registered slug has a row in the games table.
  // Uses INSERT ... ON CONFLICT DO NOTHING so existing rows (name, enabled) are never overwritten.
  async onModuleInit() {
    for (const slug of this.gamesRegistry.slugs()) {
      await this.games
        .createQueryBuilder()
        .insert()
        .into(Game)
        .values({ slug, name: slug, enabled: false })
        .orIgnore()
        .execute();
    }
  }

  async findBySlug(slug: string): Promise<Game | null> {
    return this.games.findOne({ where: { slug, enabled: true } });
  }

  async listGames(): Promise<Game[]> {
    return this.games.find();
  }

  async getGame(_slug: string) {
    throw new Error('not implemented');
  }

  async enableGame(slug: string, enabled: boolean) {
    const game = await this.games.findOne({ where: { slug } });
    if (!game) throw new NotFoundException(`Game not found: ${slug}`);
    game.enabled = enabled;
    return this.games.save(game);
  }
}
