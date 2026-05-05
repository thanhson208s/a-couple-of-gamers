import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { DevAuthGuard } from '../../common/guards/dev-auth.guard';
import { MatchesService } from '../matches/matches.service';
import { CompleteMatchDto } from './complete-match.dto';
import { AuthService } from '../auth/auth.service';

@Controller('dev')
@SkipThrottle()
@UseGuards(DevAuthGuard)
export class DevController {
  constructor(
    private readonly matchesService: MatchesService,
    private readonly authService: AuthService
  ) {}

  @Get('ping')
  ping() {
    return { ok: true, message: 'You should not see this message in staging or production' };
  }

  @Post('auth')
  login(@Body() body: { accountId: string }) {
    return this.authService.devLogin(body.accountId);
  }

  @Post('matches/complete')
  completeMatch(@Body() dto: CompleteMatchDto) {
    return this.matchesService.completeMatch(dto.matchId, dto.winner);
  }
}
