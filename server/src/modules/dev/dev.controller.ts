import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { DevGuard } from '../auth/guards/dev.guard';
import { MatchesService } from '../matches/matches.service';

@Controller('dev/cheat')
@UseGuards(DevGuard)
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
