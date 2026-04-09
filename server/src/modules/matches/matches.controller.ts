import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { AppThrottle } from '../../app.guard';
import { CurrentUser, JwtAuthGuard, JwtUser } from '../auth/guards/jwt-auth.guard';
import { MatchesService } from './matches.service';
import { CreateMatchDto } from './create-match.dto';
import { JoinMatchDto } from './join-match.dto';

@UseGuards(JwtAuthGuard)
@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Post()
  @AppThrottle({ ttl: 3_600_000, limit: 20 })
  createMatch(@Body() dto: CreateMatchDto, @CurrentUser() user: JwtUser) {
    return this.matchesService.createMatch(dto.gameSlug, dto.playerSlot, user.id, dto.options);
  }

  @Get()
  listMatches(@CurrentUser() user: JwtUser) {
    return this.matchesService.listMatches(user.id);
  }

  @Get(':id')
  getMatch(@Param('id') id: string) {
    return this.matchesService.getMatch(id);
  }

  @Post('join')
  joinMatch(@Body() dto: JoinMatchDto, @CurrentUser() user: JwtUser) {
    return this.matchesService.joinMatch(dto.inviteCode, user.id);
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
