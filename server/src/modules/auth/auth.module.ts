import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshToken } from './refresh-token.entity';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { DevAuthGuard } from './guards/dev-auth.guard';
import { GuestAuthGuard } from './guards/guest-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OptionalAuthGuard } from './guards/optional-auth.guard';
import { UsersModule } from '../users/users.module';

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
  ],
  controllers: [AuthController],
  providers: [AuthService, AdminAuthGuard, DevAuthGuard, GuestAuthGuard, JwtAuthGuard, OptionalAuthGuard],
  exports: [AuthService, JwtModule, AdminAuthGuard, DevAuthGuard, GuestAuthGuard, JwtAuthGuard, OptionalAuthGuard],
})
export class AuthModule {}
