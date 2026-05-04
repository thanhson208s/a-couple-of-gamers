import { Module } from '@nestjs/common';
import { ConfigController } from './config.controller';
import { ConfigService } from './config.service';
import { GamesModule } from '../games/games.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Config } from './config.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Config]),
    GamesModule,
  ],
  controllers: [ConfigController],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
