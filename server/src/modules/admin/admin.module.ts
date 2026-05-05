import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AdminController } from './admin.controller';
import { GuardsModule } from '../../common/guards/guards.module';
import { ConfigModule } from '../config/config.module';
import { GamesModule } from '../games/games.module';

@Module({
  imports: [
    ConfigModule,
    GamesModule,
    GuardsModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', '..', '..', 'public', 'admin'),
      serveRoot: '/admin',
    }),
  ],
  controllers: [AdminController],
})
export class AdminModule {}
