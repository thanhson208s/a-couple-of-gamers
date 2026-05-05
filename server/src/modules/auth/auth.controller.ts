import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AppThrottle } from '../../app.guard';
import { AuthService } from './auth.service';
import { DevAuthGuard } from './guards/dev-auth.guard';
import { FirebaseLoginDto } from './firebase-login.dto';
import { CurrentUser, JwtAuthGuard, JwtUser } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('dev')
  @SkipThrottle()
  @UseGuards(DevAuthGuard)
  devLogin(@Body() body: { accountId: string }) {
    return this.authService.devLogin(body.accountId);
  }

  @Post('login')
  @AppThrottle({ ttl: 60_000, limit: 20 })
  login(@Body() dto: FirebaseLoginDto) {
    return this.authService.firebaseLogin(dto.idToken);
  }

  @Post('refresh')
  @AppThrottle({ ttl: 60_000, limit: 20 })
  refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refresh(body.refreshToken);
  }

  @Post('logout')
  logout(@Body() body: { refreshToken: string }) {
    return this.authService.logout(body.refreshToken);
  }
}
