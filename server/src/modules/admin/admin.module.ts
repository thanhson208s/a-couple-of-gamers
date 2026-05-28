import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { GuardsModule } from '../../common/guards/guards.module';
import { ConfigModule } from '../config/config.module';
import { GamesModule } from '../games/games.module';
import { MaintenanceModule } from '../maintenance/maintenance.module';

@Module({
  imports: [ConfigModule, GamesModule, MaintenanceModule, GuardsModule],
  controllers: [AdminController],
})
export class AdminModule {}
