import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { DevAuthGuard } from './guards/dev-auth.guard';
import { GuestAuthGuard } from './guards/guest-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('dev')
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
  socialLogin(@Body() body: { idToken: string }) {
    return this.authService.socialLogin(body.idToken);
  }

  @Post('refresh')
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
