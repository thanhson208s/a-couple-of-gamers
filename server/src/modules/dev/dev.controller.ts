import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { DevAuthGuard } from '../auth/guards/dev-auth.guard';
import { MatchesService } from '../matches/matches.service';

@Controller('dev/cheat')
@SkipThrottle()
@UseGuards(DevAuthGuard)
export class DevController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get('ping')
  ping() {
    return { ok: true, mode: 'dev' };
  }

  @Post('matches/:id/force-complete')
  forceComplete(@Param('id') id: string, @Body() body: {winner: 0 | 1 | 2}) {
    return this.matchesService.devForceComplete(id, body.winner);
  }
}
