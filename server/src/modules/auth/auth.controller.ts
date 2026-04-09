import { Controller, Post, Body, Headers, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AppThrottle } from '../../app.guard';
import { AuthService } from './auth.service';
import { DevAuthGuard } from './guards/dev-auth.guard';

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
  guestLogin(@Body() body: { guestId: string }) {
    return this.authService.guestLogin(body.guestId);
  }

  @Post('social')
  @AppThrottle({ ttl: 60_000, limit: 10 })
  socialLogin(@Headers('authorization') authorization: string | undefined, @Body() body: { idToken: string }) {
    // If caller carries a guest JWT (type:'guest'), its sub is extracted for merge
    const guestUserId = this.authService.extractGuestUserId(authorization);
    return this.authService.socialLogin(body.idToken, guestUserId);
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

  @Post('ws-ticket')
  issueWsTicket() {
    // Requires JWT auth guard (to be added)
    return this.authService.issueWsTicket();
  }
}
