import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshToken } from './refresh-token.entity';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { DevAuthGuard } from './guards/dev-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UsersModule } from '../users/users.module';
import { RedisModule } from '../../common/redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RefreshToken]),
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_ACCESS_SECRET,
        signOptions: { expiresIn: '15m' },
      }),
    }),
    UsersModule,
    RedisModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, AdminAuthGuard, DevAuthGuard, JwtAuthGuard],
  exports: [AuthService, JwtModule, AdminAuthGuard, DevAuthGuard, JwtAuthGuard],
})
export class AuthModule {}
