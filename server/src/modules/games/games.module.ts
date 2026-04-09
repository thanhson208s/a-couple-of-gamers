import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { GamesRegistry } from './games.registry';
import { Game } from './game.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Game])],
  controllers: [GamesController],
  providers: [GamesService, GamesRegistry],
  exports: [GamesService, GamesRegistry],
})
export class GamesModule {}
