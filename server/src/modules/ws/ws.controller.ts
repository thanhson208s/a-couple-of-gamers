import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { WsService } from './ws.service';
import { CurrentUser, JwtAuthGuard, JwtUser } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('ws')
export class WsController {
  constructor(private readonly wsService: WsService) {}

  @Post('ticket')
  issueWsTicket(@CurrentUser() user: JwtUser) {
    return this.wsService.issueWsTicket(user.id);
  }
}
