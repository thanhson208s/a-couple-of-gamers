import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { Match } from './match.entity';
import { GamesModule } from '../games/games.module';
import { AuthModule } from '../auth/auth.module';
import { WsModule } from '../ws/ws.module';

@Module({
  imports: [TypeOrmModule.forFeature([Match]), GamesModule, AuthModule, WsModule],
  controllers: [MatchesController],
  providers: [MatchesService],
  exports: [MatchesService],
})
export class MatchesModule {}
