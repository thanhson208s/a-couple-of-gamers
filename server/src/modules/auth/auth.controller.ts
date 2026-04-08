import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AppThrottle } from '../../app.guard';
import { AuthService } from './auth.service';
import { DevAuthGuard } from './guards/dev-auth.guard';
import { GuestAuthGuard } from './guards/guest-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('dev')
  @SkipThrottle()
  @UseGuards(DevAuthGuard)
  devLogin(@Body() body: { accountId: string }) {
    return this.authService.devLogin(body.accountId);
  }

  @Post('guest')
  @UseGuards(GuestAuthGuard)
  guestLogin(@Body() body: { guestId: string }) {
    return this.authService.guestLogin(body.guestId);
  }

  @Post('social')
  @AppThrottle({ ttl: 60_000, limit: 10 })
  socialLogin(@Body() body: { idToken: string }) {
    return this.authService.socialLogin(body.idToken);
  }

  @Post('refresh')
  @AppThrottle({ ttl: 60_000, limit: 20 })
  refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refresh(body.refreshToken);
  }

  @Post('ws-ticket')
  issueWsTicket() {
    // Requires JWT auth guard (to be added)
    return this.authService.issueWsTicket();
  }

  @Post('guest-merge')
  guestMerge() {
    // Requires JWT + X-Guest-Id header (to be added)
    return this.authService.guestMerge();
  }
}
