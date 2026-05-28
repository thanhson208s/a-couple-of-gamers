import { Controller, Post, Body } from '@nestjs/common';
import { AppThrottle } from '../../app.guard';
import { AuthService } from './auth.service';
import { FirebaseLoginDto } from './firebase-login.dto';
import { RefreshTokenDto } from './refresh-token.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @AppThrottle({ ttl: 60_000, limit: 20 })
  login(@Body() dto: FirebaseLoginDto) {
    return this.authService.firebaseLogin(dto.idToken);
  }

  @Post('refresh')
  @AppThrottle({ ttl: 60_000, limit: 20 })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }
}
