import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { UserFavorite } from './user-favorite.entity';
import { Game } from '../games/game.entity';
import { UserStat } from './user-stat.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserFavorite, UserStat, Game])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
