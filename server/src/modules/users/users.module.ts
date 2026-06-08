import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { UserFavorite } from './user-favorite.entity';
import { Game } from '../games/game.entity';
import { UserRival } from './user-rival.entity';
import { UserFriend } from './user-friend.entity';
import { Grave } from './grave.entity';
import { WsModule } from '../ws/ws.module';
import { ConfigModule } from '../config/config.module';
import { GuardsModule } from '../../common/guards/guards.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserFavorite, UserRival, UserFriend, Grave, Game]),
    WsModule,
    ConfigModule,
    GuardsModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
