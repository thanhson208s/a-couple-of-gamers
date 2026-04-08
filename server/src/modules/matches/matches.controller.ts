import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
import { AppThrottle } from '../../app.guard';
import { MatchesService } from './matches.service';

@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Post()
  @AppThrottle({ ttl: 3_600_000, limit: 20 })
  createMatch(@Body() body: { gameSlug: string; opponentType: 'human' | 'ai' }) {
    return this.matchesService.createMatch(body);
  }

  @Get()
  listActiveMatches() {
    return this.matchesService.listActiveMatches();
  }

  @Get(':id')
  getMatch(@Param('id') id: string) {
    return this.matchesService.getMatch(id);
  }

  @Post(':id/join')
  joinMatch(@Param('id') id: string, @Body() body: { inviteCode: string }) {
    return this.matchesService.joinMatch(id, body.inviteCode);
  }

  @Delete(':id')
  abandonMatch(@Param('id') id: string) {
    return this.matchesService.abandonMatch(id);
  }

  @Post(':id/moves')
  submitMove(@Param('id') id: string, @Body() body: { move: unknown }) {
    return this.matchesService.submitMove(id, body.move);
  }

  @Post(':id/complete')
  completeAiMatch(@Param('id') id: string, @Body() body: { winnerId: string | null }) {
    return this.matchesService.completeAiMatch(id, body.winnerId);
  }

  @Get(':id/invite')
  getInvite(@Param('id') id: string) {
    return this.matchesService.getInvite(id);
  }
}
