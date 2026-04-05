import { Module } from '@nestjs/common';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { PluginRegistry } from './plugin.registry';

@Module({
  controllers: [GamesController],
  providers: [GamesService, PluginRegistry],
  exports: [GamesService, PluginRegistry],
})
export class GamesModule {}
