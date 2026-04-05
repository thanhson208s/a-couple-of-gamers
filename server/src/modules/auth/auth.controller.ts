import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
