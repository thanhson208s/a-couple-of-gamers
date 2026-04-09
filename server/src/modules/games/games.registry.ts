import { Injectable } from '@nestjs/common';
import { GamePlugin } from '@acog/game-logic';
import { TicTacToePlugin } from '@acog/game-logic-tictactoe';

@Injectable()
export class GamesRegistry {
  private readonly plugins = new Map<string, GamePlugin>([
    ['tictactoe', new TicTacToePlugin()],
  ]);

  slugs(): string[] {
    return [...this.plugins.keys()];
  }

  get(slug: string): GamePlugin {
    const plugin = this.plugins.get(slug);
    if (!plugin) throw new Error(`No plugin registered for game: ${slug}`);
    return plugin;
  }
}
