import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { GuardsModule } from '../../common/guards/guards.module';
import { ConfigModule } from '../config/config.module';
import { GamesModule } from '../games/games.module';

@Module({
  imports: [ConfigModule, GamesModule, GuardsModule],
  controllers: [AdminController],
})
export class AdminModule {}
