import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Game, GameStatus } from './game.entity';
import { GamesRegistry } from './games.registry';

@Injectable()
export class GamesService implements OnModuleInit {
  constructor(
    @InjectRepository(Game) private readonly games: Repository<Game>,
    private readonly gamesRegistry: GamesRegistry,
  ) {}

  // On startup, ensure every registered slug has a row in the games table.
  // Uses INSERT ... ON CONFLICT DO NOTHING so existing rows (name, status) are never overwritten.
  async onModuleInit() {
    for (const slug of this.gamesRegistry.slugs()) {
      await this.games
        .createQueryBuilder()
        .insert()
        .into(Game)
        .values({ slug, name: slug, status: GameStatus.ComingSoon })
        .orIgnore()
        .execute();
    }
  }

  async findBySlug(slug: string): Promise<Game | null> {
    return this.games.findOne({ where: { slug, status: GameStatus.Enabled } });
  }

  async listGames(): Promise<Game[]> {
    return this.games.find();
  }

  async getGame(slug: string) {
    return this.games.findOne({ where: { slug }})
  }

  async updateGame(slug: string, name?: string, status?: GameStatus) {
    const game = await this.games.findOne({ where: { slug } });
    if (!game) throw new NotFoundException(`Game not found: ${slug}`);
    if (name != null) game.name = name;
    if (status != null) game.status = status;
    return this.games.save(game);
  }
}
