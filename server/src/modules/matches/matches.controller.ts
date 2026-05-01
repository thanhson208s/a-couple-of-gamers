import { Controller, Get, Post, Delete, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
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

  @Get('pending')
  listPendingMatches(@CurrentUser() user: JwtUser) {
    return this.matchesService.listPendingMatches(user.id);
  }

  @Get('active')
  listActiveMatches(@CurrentUser() user: JwtUser) {
    return this.matchesService.listActiveMatches(user.id);
  }

  @Get('history')
  listCompletedMatches(@CurrentUser() user: JwtUser) {
    return this.matchesService.listCompletedMatches(user.id);
  }

  @Post('join')
  joinMatch(@Body() dto: JoinMatchDto, @CurrentUser() user: JwtUser) {
    return this.matchesService.joinMatch(dto.inviteCode, user.id);
  }

  @Delete('pending/:inviteCode')
  cancelMatch(@Param('inviteCode') inviteCode: string, @CurrentUser() user: JwtUser) {
    return this.matchesService.cancelMatch(inviteCode, user.id);
  }

  @Delete(':id')
  abandonMatch(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.matchesService.abandonMatch(id, user.id);
  }
}
