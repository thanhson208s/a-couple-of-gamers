import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AppThrottle } from '../../app.guard';
import { AuthService } from './auth.service';
import { DevAuthGuard } from './guards/dev-auth.guard';
import { LoginDto } from './login.dto';

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
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.idToken);
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
