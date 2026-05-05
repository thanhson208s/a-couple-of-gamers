import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { Match } from './match.entity';
import { GamesModule } from '../games/games.module';
import { GuardsModule } from '../../common/guards/guards.module';
import { WsModule } from '../ws/ws.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [TypeOrmModule.forFeature([Match]), GamesModule, GuardsModule, WsModule, UsersModule, NotificationsModule, ConfigModule],
  controllers: [MatchesController],
  providers: [MatchesService],
  exports: [MatchesService],
})
export class MatchesModule {}
