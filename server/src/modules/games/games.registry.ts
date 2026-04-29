import { Injectable } from '@nestjs/common';
import { GamePlugin } from '../../logic';
import { TicTacToePlugin } from '../../logic/tictactoe';
import { GameType } from './game.entity';

interface RegistryEntry {
  plugin: GamePlugin;
  type: GameType;
}

@Injectable()
export class GamesRegistry {
  private readonly entries = new Map<string, RegistryEntry>([
    ['tictactoe', { plugin: new TicTacToePlugin(), type: GameType.Versus }],
  ]);

  slugs(): string[] {
    return [...this.entries.keys()];
  }

  get(slug: string): GamePlugin {
    const entry = this.entries.get(slug);
    if (!entry) throw new Error(`No plugin registered for game: ${slug}`);
    return entry.plugin;
  }

  getType(slug: string): GameType {
    const entry = this.entries.get(slug);
    if (!entry) throw new Error(`No plugin registered for game: ${slug}`);
    return entry.type;
  }
}
