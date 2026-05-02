import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { UserFavorite } from './user-favorite.entity';
import { Game } from '../games/game.entity';
import { UserRival } from './user-rival.entity';
import { UserDevice } from './user-device.entity';
import { GamesModule } from '../games/games.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserFavorite, UserRival, UserDevice, Game]), GamesModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
