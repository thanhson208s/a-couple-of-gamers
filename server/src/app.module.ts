import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { Redis } from 'ioredis';
import { RedisModule, REDIS_CLIENT } from './common/redis/redis.module';
import { AppGuard } from './app.guard';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { GamesModule } from './modules/games/games.module';
import { MatchesModule } from './modules/matches/matches.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ConfigModule } from './modules/config/config.module';
import { AdminModule } from './modules/admin/admin.module';
import { WsModule } from './modules/ws/ws.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
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
    EventEmitterModule.forRoot(),
    RedisModule,
    ThrottlerModule.forRootAsync({
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => ({
        throttlers: [
          { name: 'app-throttle', ttl: 60_000, limit: 120 },
        ],
        storage: new ThrottlerStorageRedisService(redis),
      }),
    }),
    AuthModule,
    UsersModule,
    GamesModule,
    MatchesModule,
    NotificationsModule,
    ConfigModule,
    AdminModule,
    WsModule,
    MaintenanceModule,
    DevModule,
  ],
  controllers: [AppHealth],
  providers: [
    { provide: APP_GUARD, useClass: AppGuard },
  ],
})
export class AppModule {}
