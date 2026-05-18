import { Controller, Post, UseGuards } from '@nestjs/common';
import { WsService } from './ws.service';
import { CurrentUser, JwtAuthGuard, JwtUser } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('ws')
export class WsController {
  constructor(private readonly wsService: WsService) {}

  @Post('ticket')
  issueWsTicket(@CurrentUser() user: JwtUser) {
    return this.wsService.issueWsTicket(user.id);
  }
}
