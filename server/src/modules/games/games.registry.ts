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

  getPlugin(gameId: string): GamePlugin {
    const entry = this.entries.get(gameId);
    if (!entry) throw new Error(`${gameId} is not a registered game.`);
    return entry.plugin;
  }

  getType(gameId: string): GameType {
    const entry = this.entries.get(gameId);
    if (!entry) throw new Error(`${gameId} is not a registered game.`);
    return entry.type;
  }
}
