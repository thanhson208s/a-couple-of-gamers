import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AdminGuard } from './guards/admin.guard';
import { GuestAuthGuard } from './guards/guest-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OptionalAuthGuard } from './guards/optional-auth.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_ACCESS_SECRET,
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AdminGuard, GuestAuthGuard, JwtAuthGuard, OptionalAuthGuard],
  exports: [AuthService, JwtModule, AdminGuard, GuestAuthGuard, JwtAuthGuard, OptionalAuthGuard],
})
export class AuthModule {}
