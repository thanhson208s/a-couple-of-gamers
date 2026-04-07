import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { GamesModule } from './modules/games/games.module';
import { MatchesModule } from './modules/matches/matches.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ConfigModule } from './modules/config/config.module';
import { AdminModule } from './modules/admin/admin.module';
import { WsModule } from './modules/ws/ws.module';
import { DevModule } from './modules/dev/dev.module';
import { AppHealth as AppHealth } from './app.health';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      synchronize: false,
      autoLoadEntities: true,
    }),
    AuthModule,
    UsersModule,
    GamesModule,
    MatchesModule,
    NotificationsModule,
    ConfigModule,
    AdminModule,
    WsModule,
    DevModule,
  ],
  controllers: [AppHealth],
})
export class AppModule {}
